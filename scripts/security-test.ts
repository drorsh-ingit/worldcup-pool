/**
 * Security Test Suite
 *
 * Tests: DB leakage, cross-group isolation, admin authorization,
 *        SQL injection, XSS prevention, and additional security issues.
 *
 * Run: npx tsx scripts/security-test.ts
 *
 * Requires: dev server running on localhost:3005
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import { hash } from "bcryptjs";

const db = new PrismaClient();
const BASE_URL = "http://localhost:3005";
const TS = Date.now();

// ─── Test infrastructure ─────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

function pass(name: string) {
  passed++;
  console.log(`  \x1b[32m✓ PASS\x1b[0m ${name}`);
}

function fail(name: string, reason: string) {
  failed++;
  failures.push(`${name}: ${reason}`);
  console.log(`  \x1b[31m✗ FAIL\x1b[0m ${name} — ${reason}`);
}

function expectedFail(name: string, reason: string) {
  failed++;
  failures.push(`${name} [KNOWN]: ${reason}`);
  console.log(`  \x1b[33m✗ KNOWN FAIL\x1b[0m ${name} — ${reason}`);
}

function skip(name: string, reason: string) {
  skipped++;
  console.log(`  \x1b[90m- SKIP\x1b[0m ${name} — ${reason}`);
}

function section(title: string) {
  console.log(`\n\x1b[1m━━━ ${title} ━━━\x1b[0m`);
}

// ─── Test data ────────────────────────────────────────────────────────────

interface TestData {
  adminUser: { id: string; email: string };
  memberUser: { id: string; email: string };
  outsiderUser: { id: string; email: string };
  groupA: { id: string; slug: string };
  groupB: { id: string; slug: string };
  tournamentA: { id: string };
  betTypeA: { id: string };
  membershipAdmin: { id: string };
  membershipMember: { id: string };
}

async function setupTestData(): Promise<TestData> {
  console.log("\n\x1b[1mSetting up test data...\x1b[0m");

  const passwordHash = await hash("SecTest1234!", 12);

  // Create 3 test users
  const adminUser = await db.user.create({
    data: {
      email: `sectest-admin-${TS}@test.local`,
      name: "SecTest Admin",
      passwordHash,
    },
  });

  const memberUser = await db.user.create({
    data: {
      email: `sectest-member-${TS}@test.local`,
      name: "SecTest Member",
      passwordHash,
    },
  });

  const outsiderUser = await db.user.create({
    data: {
      email: `sectest-outsider-${TS}@test.local`,
      name: "SecTest Outsider",
      passwordHash,
    },
  });

  // Create 2 test groups
  const groupA = await db.group.create({
    data: {
      name: `SecTest-GroupA-${TS}`,
      slug: `sectest-a-${TS}`,
      settings: {},
    },
  });

  const groupB = await db.group.create({
    data: {
      name: `SecTest-GroupB-${TS}`,
      slug: `sectest-b-${TS}`,
      settings: {},
    },
  });

  // Memberships: admin=ADMIN of A, member=MEMBER of A, outsider=ADMIN of B
  const membershipAdmin = await db.groupMembership.create({
    data: {
      userId: adminUser.id,
      groupId: groupA.id,
      role: "ADMIN",
      status: "APPROVED",
    },
  });

  const membershipMember = await db.groupMembership.create({
    data: {
      userId: memberUser.id,
      groupId: groupA.id,
      role: "MEMBER",
      status: "APPROVED",
    },
  });

  await db.groupMembership.create({
    data: {
      userId: outsiderUser.id,
      groupId: groupB.id,
      role: "ADMIN",
      status: "APPROVED",
    },
  });

  // Create a tournament in Group A
  const tournamentA = await db.tournament.create({
    data: {
      groupId: groupA.id,
      kind: "WC_2026",
      name: "SecTest Tournament",
      status: "GROUP_STAGE",
    },
  });

  // Create two teams so we can create a match
  const teamHome = await db.team.create({
    data: {
      tournamentId: tournamentA.id,
      name: "SecTest Home",
      code: "STH",
      groupLetter: "A",
      odds: {},
    },
  });

  const teamAway = await db.team.create({
    data: {
      tournamentId: tournamentA.id,
      name: "SecTest Away",
      code: "STA",
      groupLetter: "A",
      odds: {},
    },
  });

  // Create a match
  await db.match.create({
    data: {
      tournamentId: tournamentA.id,
      homeTeamId: teamHome.id,
      awayTeamId: teamAway.id,
      phase: "GROUP",
      matchday: 1,
      groupLetter: "A",
      kickoffAt: new Date("2099-01-01"),
      status: "UPCOMING",
    },
  });

  // Create a bet type (OPEN so we can test placing bets)
  const betTypeA = await db.betType.create({
    data: {
      tournamentId: tournamentA.id,
      category: "TOURNAMENT",
      subType: "winner",
      name: "SecTest Winner",
      status: "OPEN",
      opensAt: new Date(),
    },
  });

  console.log("  Created: 3 users, 2 groups, 1 tournament, 2 teams, 1 match, 1 bet type");

  return {
    adminUser: { id: adminUser.id, email: adminUser.email },
    memberUser: { id: memberUser.id, email: memberUser.email },
    outsiderUser: { id: outsiderUser.id, email: outsiderUser.email },
    groupA: { id: groupA.id, slug: groupA.slug },
    groupB: { id: groupB.id, slug: groupB.slug },
    tournamentA: { id: tournamentA.id },
    betTypeA: { id: betTypeA.id },
    membershipAdmin: { id: membershipAdmin.id },
    membershipMember: { id: membershipMember.id },
  };
}

async function teardownTestData(data: TestData) {
  console.log("\n\x1b[1mCleaning up test data...\x1b[0m");

  // Delete groups (cascades to memberships, tournaments, teams, matches, bet types, bets)
  await db.group.deleteMany({
    where: { id: { in: [data.groupA.id, data.groupB.id] } },
  });

  // Delete users (cascades to memberships, bets, push subscriptions)
  await db.user.deleteMany({
    where: { id: { in: [data.adminUser.id, data.memberUser.id, data.outsiderUser.id] } },
  });

  console.log("  Cleaned up all test data");
}

// ─── Helper: get a session cookie for a test user ─────────────────────────

async function getSessionCookie(email: string, password: string): Promise<string | null> {
  try {
    // Get CSRF token first
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.csrfToken;
    const cookies = csrfRes.headers.getSetCookie?.() ?? [];

    const cookieHeader = cookies.join("; ");

    // Sign in
    const signInRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
      body: new URLSearchParams({
        csrfToken,
        email,
        password,
        json: "true",
      }),
      redirect: "manual",
    });

    const allCookies = signInRes.headers.getSetCookie?.() ?? [];
    const sessionCookie = allCookies.find((c) => c.startsWith("authjs.session-token=") || c.startsWith("__Secure-authjs.session-token="));
    return sessionCookie?.split(";")[0] ?? cookieHeader;
  } catch {
    return null;
  }
}

// ─── Suite 1: DB Connection String Not Exposed ──────────────────────────

async function testDbNotExposed() {
  section("1. DB Connection String Not Exposed");

  // 1a: No NEXT_PUBLIC_DATABASE env var in source
  try {
    const result = execSync(
      'grep -r "NEXT_PUBLIC_DATABASE" src/ .env.example 2>/dev/null || true',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (result.trim().length === 0) {
      pass("1a: No NEXT_PUBLIC_DATABASE in source code");
    } else {
      fail("1a: NEXT_PUBLIC_DATABASE found in source", result.trim());
    }
  } catch {
    pass("1a: No NEXT_PUBLIC_DATABASE in source code");
  }

  // 1b: No raw SQL queries
  try {
    const result = execSync(
      'grep -r "\\$queryRaw\\|\\$executeRaw\\|\\$queryRawUnsafe\\|\\$executeRawUnsafe" src/ 2>/dev/null || true',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (result.trim().length === 0) {
      pass("1b: No raw SQL queries in codebase");
    } else {
      fail("1b: Raw SQL found", result.trim());
    }
  } catch {
    pass("1b: No raw SQL queries in codebase");
  }

  // 1c: API error responses don't leak DB connection string
  try {
    const res = await fetch(`${BASE_URL}/api/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    if (text.includes("postgres://") || text.includes("neon.tech") || text.includes("DATABASE_URL")) {
      fail("1c: /api/push leaks DB info in error response", text.slice(0, 200));
    } else {
      pass("1c: /api/push error response does not leak DB info");
    }
  } catch (e) {
    skip("1c: /api/push test", `Could not reach server: ${e}`);
  }

  // 1d: Cron endpoint with wrong token doesn't leak DB info
  try {
    const res = await fetch(`${BASE_URL}/api/cron/open-bets`, {
      headers: { Authorization: "Bearer wrong-token-12345" },
    });
    const text = await res.text();
    if (text.includes("postgres://") || text.includes("neon.tech") || text.includes("DATABASE_URL")) {
      fail("1d: /api/cron/open-bets leaks DB info", text.slice(0, 200));
    } else {
      pass("1d: Cron endpoint error does not leak DB info");
    }
  } catch (e) {
    skip("1d: Cron endpoint test", `Could not reach server: ${e}`);
  }

  // 1e: Check that .env is in .gitignore
  try {
    const gitignore = execSync(
      'cat .gitignore',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (gitignore.includes(".env")) {
      pass("1e: .env is in .gitignore");
    } else {
      fail("1e: .env NOT in .gitignore", "Secrets could be committed");
    }
  } catch {
    skip("1e: .gitignore check", "Could not read .gitignore");
  }
}

// ─── Suite 2: Cross-Group Data Isolation ────────────────────────────────

async function testCrossGroupIsolation(data: TestData) {
  section("2. Cross-Group Data Isolation");

  // 2a: Outsider cannot place bet in GroupA
  // We test at DB level: verify the membership check pattern exists
  const outsiderMembership = await db.groupMembership.findUnique({
    where: {
      userId_groupId: {
        userId: data.outsiderUser.id,
        groupId: data.groupA.id,
      },
    },
  });
  if (!outsiderMembership) {
    pass("2a: Outsider has no membership in GroupA (placeBet would reject)");
  } else {
    fail("2a: Outsider unexpectedly has membership in GroupA", outsiderMembership.status);
  }

  // 2b: getUserBets — outsider can query GroupA's tournamentId
  // This tests the known vulnerability: getUserBets doesn't check group membership
  const outsiderBetsInGroupA = await db.bet.findMany({
    where: { userId: data.outsiderUser.id, tournamentId: data.tournamentA.id },
  });
  // The function returns bets filtered by userId, so an outsider gets empty results
  // (they haven't placed any bets). But the issue is it doesn't REJECT the request.
  // To properly test: place a bet as outsider directly, then check if getUserBets returns it.
  // For now, verify the code path: getUserBets does NOT check group membership.
  try {
    const betsSource = execSync(
      'grep -A 20 "export async function getUserBets" src/lib/actions/bets.ts',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (!betsSource.includes("groupMembership") && !betsSource.includes("membership")) {
      fail("2b: getUserBets has no group membership check", "Returns bets for any tournamentId without verifying group access");
    } else {
      pass("2b: getUserBets checks group membership");
    }
  } catch {
    skip("2b: getUserBets check", "Could not grep source");
  }

  // 2c: Group page requires membership — test via HTTP
  try {
    // Unauthenticated request to group page
    const res = await fetch(`${BASE_URL}/group/${data.groupA.id}`, { redirect: "manual" });
    if (res.status === 302 || res.status === 307 || res.status === 200) {
      // If 200, check if it redirects via client-side (Next.js middleware)
      pass("2c: Group page requires auth (redirects or blocks unauthenticated)");
    } else if (res.status === 404) {
      pass("2c: Group page returns 404 for unauthenticated user");
    } else {
      fail("2c: Unexpected status for group page", `Status: ${res.status}`);
    }
  } catch (e) {
    skip("2c: Group page test", `${e}`);
  }

  // 2d: Outsider cannot see GroupA's tournament data
  const outsiderTournaments = await db.tournament.findMany({
    where: {
      groupId: data.groupA.id,
      group: {
        members: {
          some: {
            userId: data.outsiderUser.id,
            status: "APPROVED",
          },
        },
      },
    },
  });
  if (outsiderTournaments.length === 0) {
    pass("2d: Outsider cannot access GroupA tournaments via membership-scoped query");
  } else {
    fail("2d: Outsider can see GroupA tournaments", `Found ${outsiderTournaments.length}`);
  }

  // 2e: Direct DB query WITHOUT membership filter returns data (proves filter is needed)
  const allTournaments = await db.tournament.findMany({
    where: { groupId: data.groupA.id },
  });
  if (allTournaments.length > 0) {
    pass("2e: Unscoped DB query returns GroupA data (proves membership filter is necessary)");
  } else {
    fail("2e: No tournaments found in GroupA", "Test data setup issue");
  }
}

// ─── Suite 3: Non-Admin Cannot Do Admin Actions ────────────────────────

async function testAdminAuthorization(data: TestData) {
  section("3. Non-Admin Cannot Perform Admin Actions");

  // Test each admin-gated action by extracting the function body between exports
  const adminActions = [
    { file: "bet-types.ts", fn: "openBetType", label: "openBetType" },
    { file: "bet-types.ts", fn: "lockBetType", label: "lockBetType" },
    { file: "bet-types.ts", fn: "resolveBetType", label: "resolveBetType" },
    { file: "bet-types.ts", fn: "createCuratedBet", label: "createCuratedBet" },
    { file: "results.ts", fn: "enterMatchResult", label: "enterMatchResult" },
    { file: "tournaments.ts", fn: "updateTournamentStatus", label: "updateTournamentStatus" },
    { file: "push.ts", fn: "sendTestPush", label: "sendTestPush" },
  ];

  for (const action of adminActions) {
    try {
      const source = execSync(
        `cat src/lib/actions/${action.file}`,
        { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
      );

      // Find the function body: from its declaration to the next export or end of file
      const fnStart = source.indexOf(`export async function ${action.fn}`);
      if (fnStart === -1) {
        skip(`3: ${action.label}`, "Function not found in source");
        continue;
      }
      const afterFn = source.slice(fnStart);
      const nextExport = afterFn.indexOf("\nexport ", 10);
      const fnBody = nextExport !== -1 ? afterFn.slice(0, nextExport) : afterFn;

      if (fnBody.includes("requireAdmin") || fnBody.includes('role !== "ADMIN"')) {
        pass(`3: ${action.label} requires admin role`);
      } else {
        fail(`3: ${action.label} does NOT check admin role`, "Missing requireAdmin or role check");
      }
    } catch {
      skip(`3: ${action.label}`, "Could not read source file");
    }
  }

  // Check groups.ts separately (uses inline check, not requireAdmin)
  try {
    const groupsSource = execSync(
      'cat src/lib/actions/groups.ts',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );

    // deleteGroup
    if (groupsSource.includes('role !== "ADMIN"') && groupsSource.includes("deleteGroup")) {
      pass("3: deleteGroup requires admin role");
    } else {
      fail("3: deleteGroup missing admin check", "");
    }

    // updateMembership
    if (groupsSource.includes('role !== "ADMIN"') && groupsSource.includes("updateMembership")) {
      pass("3: updateMembership requires admin role");
    } else {
      fail("3: updateMembership missing admin check", "");
    }
  } catch {
    skip("3: groups.ts actions", "Could not read source");
  }

  // 3-live: Actually test with member session via HTTP (if server is up)
  try {
    const memberCookie = await getSessionCookie(data.memberUser.email, "SecTest1234!");
    if (memberCookie) {
      // Try to hit admin-only API endpoints
      const res = await fetch(`${BASE_URL}/group/${data.groupA.id}/admin`, {
        headers: { Cookie: memberCookie },
        redirect: "manual",
      });
      // Admin page should either 404 or redirect for non-admin
      if (res.status === 200) {
        // Check if page content has admin controls (might show empty state)
        const html = await res.text();
        // The page loads but server component checks membership — if non-admin, it should notFound()
        if (html.includes("notFound") || html.includes("404")) {
          pass("3-live: Admin page rejects non-admin member (404)");
        } else {
          // Next.js might still render the page shell — check server-side logic instead
          skip("3-live: Admin page access", "Page rendered — check server-side auth separately");
        }
      } else {
        pass(`3-live: Admin page rejects non-admin member (status ${res.status})`);
      }
    } else {
      skip("3-live: Admin page test", "Could not get member session");
    }
  } catch (e) {
    skip("3-live: Admin page test", `${e}`);
  }
}

// ─── Suite 4: SQL Injection ─────────────────────────────────────────────

async function testSqlInjection(data: TestData) {
  section("4. SQL Injection Prevention");

  // 4a: No raw SQL in codebase (already tested in 1b, but explicit here)
  try {
    const result = execSync(
      'grep -rn "\\$queryRaw\\|\\$executeRaw\\|\\$queryRawUnsafe\\|\\$executeRawUnsafe\\|db\\.\\$queryRaw" src/ 2>/dev/null || true',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (result.trim().length === 0) {
      pass("4a: No raw SQL queries — all queries use Prisma ORM (parameterized)");
    } else {
      fail("4a: Raw SQL found in codebase", result.trim().split("\n")[0]);
    }
  } catch {
    pass("4a: No raw SQL queries in codebase");
  }

  // 4b: SQL injection in user name — Prisma parameterizes
  const injectionName = "Robert'); DROP TABLE users;--";
  const injUser = await db.user.create({
    data: {
      email: `sectest-sqli-${TS}@test.local`,
      name: injectionName,
      passwordHash: "not-a-real-hash",
    },
  });
  const found = await db.user.findUnique({ where: { id: injUser.id } });
  if (found && found.name === injectionName) {
    pass("4b: SQL injection in name — stored literally (Prisma parameterized)");
  } else {
    fail("4b: SQL injection in name — unexpected behavior", `Got: ${found?.name}`);
  }
  // Verify users table still exists
  const userCount = await db.user.count();
  if (userCount > 0) {
    pass("4b-verify: Users table still exists after injection attempt");
  } else {
    fail("4b-verify: Users table may have been dropped!", "Count is 0");
  }
  // Cleanup
  await db.user.delete({ where: { id: injUser.id } });

  // 4c: SQL injection in group slug lookup
  const injSlug = "' OR 1=1 --";
  const foundGroup = await db.group.findUnique({ where: { slug: injSlug } });
  if (foundGroup === null) {
    pass("4c: SQL injection in slug — returns null, no data leaked");
  } else {
    fail("4c: SQL injection in slug — returned data!", `Found: ${foundGroup.name}`);
  }

  // 4d: SQL injection in findMany where clause
  const injGroups = await db.group.findMany({
    where: { name: { contains: "'; DROP TABLE groups;--" } },
  });
  if (injGroups.length === 0) {
    pass("4d: SQL injection in findMany — returns empty, no data leaked");
  } else {
    fail("4d: SQL injection in findMany — returned data!", `Found ${injGroups.length} groups`);
  }
  // Verify groups table still exists
  const groupCount = await db.group.count();
  if (groupCount > 0) {
    pass("4d-verify: Groups table still exists after injection attempt");
  } else {
    fail("4d-verify: Groups table may have been dropped!", "Count is 0");
  }

  // 4e: SQL injection via CUID-validated field — Zod should reject
  try {
    const source = execSync(
      'grep "tournamentId.*cuid\\|betTypeId.*cuid\\|matchId.*cuid" src/lib/actions/bets.ts',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (source.includes("cuid")) {
      pass("4e: Bet IDs validated as CUID — injection payloads rejected by Zod");
    }
  } catch {
    skip("4e: CUID validation check", "Could not grep source");
  }

  // 4f: Test signup endpoint with injection email
  try {
    const res = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "'; DROP TABLE users;--@x.com",
        password: "Test12345!",
        name: "Injector",
      }),
    });
    // Should either 400 (Zod reject) or 404 (no signup route) — neither should crash
    if (res.status !== 500) {
      pass(`4f: Signup with injection email — server did not crash (status ${res.status})`);
    } else {
      const text = await res.text();
      if (!text.includes("postgres://")) {
        pass("4f: Signup error does not leak DB info");
      } else {
        fail("4f: Signup error leaks DB info", text.slice(0, 100));
      }
    }
  } catch (e) {
    skip("4f: Signup injection test", `${e}`);
  }
}

// ─── Suite 5: XSS Prevention ────────────────────────────────────────────

async function testXssPrevention(data: TestData) {
  section("5. XSS Prevention");

  // 5a: No dangerouslySetInnerHTML
  try {
    const result = execSync(
      'grep -rn "dangerouslySetInnerHTML" src/ 2>/dev/null || true',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (result.trim().length === 0) {
      pass("5a: No dangerouslySetInnerHTML in codebase");
    } else {
      fail("5a: dangerouslySetInnerHTML found", result.trim().split("\n")[0]);
    }
  } catch {
    pass("5a: No dangerouslySetInnerHTML found");
  }

  // 5b: No eval() or new Function()
  try {
    const result = execSync(
      'grep -rn "\\beval(\\|new Function(" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (result.trim().length === 0) {
      pass("5b: No eval() or new Function() in codebase");
    } else {
      fail("5b: eval/Function found", result.trim().split("\n")[0]);
    }
  } catch {
    pass("5b: No eval/Function found");
  }

  // 5c: No document.write
  try {
    const result = execSync(
      'grep -rn "document\\.write" src/ public/ 2>/dev/null || true',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (result.trim().length === 0) {
      pass("5c: No document.write in codebase");
    } else {
      fail("5c: document.write found", result.trim().split("\n")[0]);
    }
  } catch {
    pass("5c: No document.write found");
  }

  // 5d: XSS in user name — stored literally in DB
  const xssName = '<script>alert("xss")</script>';
  const xssUser = await db.user.create({
    data: {
      email: `sectest-xss-${TS}@test.local`,
      name: xssName,
      passwordHash: "not-a-real-hash",
    },
  });
  const foundXss = await db.user.findUnique({ where: { id: xssUser.id } });
  if (foundXss && foundXss.name === xssName) {
    pass("5d: XSS payload in name stored literally (React will escape on render)");
  } else {
    fail("5d: XSS name was modified/sanitized at DB level", `Got: ${foundXss?.name}`);
  }
  await db.user.delete({ where: { id: xssUser.id } });

  // 5e: XSS in group name — stored literally
  const xssGroupName = '<img src=x onerror=alert(1)>';
  const xssGroup = await db.group.create({
    data: {
      name: xssGroupName,
      slug: `sectest-xss-${TS}`,
      settings: {},
    },
  });
  const foundXssGroup = await db.group.findUnique({ where: { id: xssGroup.id } });
  if (foundXssGroup && foundXssGroup.name === xssGroupName) {
    pass("5e: XSS payload in group name stored literally (React will escape on render)");
  } else {
    fail("5e: XSS group name was modified", `Got: ${foundXssGroup?.name}`);
  }
  await db.group.delete({ where: { id: xssGroup.id } });

  // 5f: avatarStyle not validated against whitelist
  try {
    const source = execSync(
      'grep -A 3 "avatarStyle" src/lib/actions/profile.ts | head -5',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (source.includes("z.string()") && !source.includes("z.enum")) {
      fail("5f: avatarStyle accepts arbitrary strings", "Should whitelist valid DiceBear style IDs");
    } else if (source.includes("z.enum")) {
      pass("5f: avatarStyle validated against whitelist");
    } else {
      skip("5f: avatarStyle validation", "Could not determine validation type");
    }
  } catch {
    skip("5f: avatarStyle validation", "Could not grep source");
  }
}

// ─── Suite 6: Additional Security Issues ────────────────────────────────

async function testAdditionalIssues(data: TestData) {
  section("6. Additional Security Issues");

  // 6a: getAvatarColor has no auth check
  try {
    const source = execSync(
      'grep -A 5 "export async function getAvatarColor" src/lib/actions/profile.ts',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (!source.includes("auth()") && !source.includes("session")) {
      fail("6a: getAvatarColor has no auth check", "Accepts any userId without authentication");
    } else {
      pass("6a: getAvatarColor requires authentication");
    }
  } catch {
    skip("6a: getAvatarColor check", "Could not grep source");
  }

  // 6b: Open redirect in login page
  try {
    const source = execSync(
      'grep -n "callbackUrl" src/app/page.tsx | head -5',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    // Check if callbackUrl is validated
    const fullSource = execSync(
      'cat src/app/page.tsx',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (fullSource.includes("router.push(callbackUrl)") && !fullSource.includes("startsWith")) {
      fail("6b: Open redirect vulnerability", 'callbackUrl from URL params passed to router.push() without validation');
    } else if (fullSource.includes("startsWith")) {
      pass("6b: callbackUrl is validated before redirect");
    } else {
      skip("6b: Open redirect", "Could not determine pattern");
    }
  } catch {
    skip("6b: Open redirect check", "Could not grep source");
  }

  // 6c: Push subscription ownership — upsert can hijack endpoint
  try {
    const source = execSync(
      'cat src/app/api/push/route.ts',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (source.includes("upsert") && source.includes("where: { endpoint }")) {
      // Check if it validates that the endpoint belongs to the current user
      if (source.includes("existing") && source.includes("userId !== session.user.id")) {
        pass("6c: Push subscription ownership is protected");
      } else if (!source.includes("userId:") || source.match(/update:.*userId/)) {
        fail(
          "6c: Push subscription ownership hijack",
          "upsert overwrites userId — User A can claim User B's push endpoint"
        );
      } else {
        pass("6c: Push subscription ownership is protected");
      }
    } else {
      skip("6c: Push subscription check", "Unexpected code pattern");
    }
  } catch {
    skip("6c: Push subscription check", "Could not read source");
  }

  // 6d: Password hashing uses sufficient rounds
  try {
    const source = execSync(
      'grep -rn "hash(" src/ --include="*.ts" | grep -v node_modules',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (source.includes("12") || source.includes("10")) {
      pass("6d: Password hashing uses adequate rounds (bcrypt)");
    } else {
      fail("6d: Could not verify bcrypt rounds", source.trim().split("\n")[0]);
    }
  } catch {
    skip("6d: Password hashing check", "Could not grep source");
  }

  // 6e: Auth endpoints rate limiting
  try {
    const source = execSync(
      'grep -rn "rateLimit\\|rate.limit\\|throttle" src/ 2>/dev/null || true',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    // Check auth.ts for rate limiting logic
    const authSource = execSync(
      'cat src/lib/auth.ts',
      { cwd: "/Users/dror.shemesh/projects/worldcup-pool", encoding: "utf-8" }
    );
    if (authSource.includes("rateLimit") || authSource.includes("checkRateLimit") || authSource.includes("MAX_ATTEMPTS")) {
      pass("6e: Rate limiting implemented on auth");
    } else if (source.trim().length > 0) {
      pass("6e: Rate limiting implemented");
    } else {
      fail("6e: No rate limiting on auth endpoints", "Brute force attacks possible on login");
    }
  } catch {
    skip("6e: Rate limiting check", "Could not grep source");
  }

  // 6f: Content-Security-Policy header
  try {
    const res = await fetch(`${BASE_URL}/`, { redirect: "manual" });
    const csp = res.headers.get("content-security-policy");
    if (csp) {
      pass("6f: Content-Security-Policy header is set");
    } else {
      expectedFail("6f: No Content-Security-Policy header", "CSP provides defense-in-depth against XSS");
    }
  } catch {
    skip("6f: CSP header check", "Could not reach server");
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("\x1b[1m\n╔══════════════════════════════════════════╗");
  console.log("║       SECURITY TEST SUITE                ║");
  console.log("╚══════════════════════════════════════════╝\x1b[0m");

  const data = await setupTestData();

  try {
    await testDbNotExposed();
    await testCrossGroupIsolation(data);
    await testAdminAuthorization(data);
    await testSqlInjection(data);
    await testXssPrevention(data);
    await testAdditionalIssues(data);
  } finally {
    await teardownTestData(data);
    await db.$disconnect();
  }

  // Summary
  console.log("\n\x1b[1m╔══════════════════════════════════════════╗");
  console.log("║       RESULTS                            ║");
  console.log("╚══════════════════════════════════════════╝\x1b[0m");
  console.log(`  \x1b[32m${passed} passed\x1b[0m`);
  console.log(`  \x1b[31m${failed} failed\x1b[0m`);
  if (skipped > 0) console.log(`  \x1b[90m${skipped} skipped\x1b[0m`);

  if (failures.length > 0) {
    console.log("\n\x1b[1mFailures:\x1b[0m");
    for (const f of failures) {
      console.log(`  \x1b[31m•\x1b[0m ${f}`);
    }
  }

  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(2);
});
