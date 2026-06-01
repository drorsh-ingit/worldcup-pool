/**
 * E2E Simulation Test Script
 *
 * Sets up a fresh group with 3 users, initializes a WC 2026 tournament,
 * places random bets for all users, then drives the simulation forward
 * day-by-day, placing new bets as markets open, and verifying standings.
 *
 * Usage:
 *   npx tsx scripts/e2e-simulation-test.ts [phase]
 *
 * Phases:
 *   setup     — create users, group, tournament, pre-tournament bets (default)
 *   simulate  — run simulation day-by-day, placing bets + checking standings
 *   knockout  — place knockout-phase bets and finish the tournament
 *   all       — run everything end-to-end
 *   cleanup   — delete the test group and users
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─── Config ──────────────────────────────────────────────────────────────────

const ADMIN_USER_ID = "cmpmgy0ll0000cnqxshddx0js"; // test@matchday.com — already logged in
const TEST_PREFIX = "e2e-sim";

const TEST_USERS = [
  { email: "e2e-alice@matchday.com", name: "Alice Tester", password: "TestPass123!" },
  { email: "e2e-bob@matchday.com", name: "Bob Tester", password: "TestPass123!" },
  { email: "e2e-carol@matchday.com", name: "Carol Tester", password: "TestPass123!" },
];

const GROUP_NAME = "E2E Simulation Pool";

// ─── WC 2026 Static Data (imported inline to avoid path alias issues) ────────

// Teams by group (simplified — we'll use DB records)
const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

// Top teams for smart random bets
const FAVORITES = ["FRA", "ENG", "BRA", "ARG", "ESP", "GER", "POR", "NED"];
const MID_TIER = ["BEL", "URU", "USA", "COL", "JPN", "MAR", "SUI", "TUR", "NOR", "CRO"];
const DARK_HORSES = ["SEN", "ECU", "AUT", "SWE", "KOR", "CZE", "MEX", "PAR", "CIV", "EGY"];

const GOLDEN_BOOT_CANDIDATES = [
  "Mbappe", "Haaland", "Vinicius Jr", "Kane", "Lewandowski",
  "Salah", "Lautaro Martinez", "Yamal", "Bellingham", "Neymar",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomScore(): [number, number] {
  const weights = [25, 35, 22, 12, 4, 2]; // 0-5 goals
  const total = weights.reduce((a, b) => a + b, 0);
  function sample() {
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return 0;
  }
  return [sample(), sample()];
}

function log(msg: string) {
  console.log(`  ${msg}`);
}

function header(msg: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${msg}`);
  console.log(`${"═".repeat(60)}`);
}

// ─── Phase: Setup ────────────────────────────────────────────────────────────

async function setup() {
  header("SETUP: Creating users, group, tournament, and bets");

  // 1. Create test users
  log("Creating 3 test users...");
  const userIds: string[] = [];
  for (const u of TEST_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      log(`  User ${u.email} already exists (${existing.id})`);
      userIds.push(existing.id);
      continue;
    }
    const hash = await bcrypt.hash(u.password, 12);
    const user = await prisma.user.create({
      data: { email: u.email, name: u.name, passwordHash: hash },
    });
    log(`  Created ${u.name} (${user.id})`);
    userIds.push(user.id);
  }

  // 2. Create group (admin = ADMIN_USER_ID = test@matchday.com)
  log("Creating group...");
  let group = await prisma.group.findFirst({
    where: { name: GROUP_NAME },
  });

  if (group) {
    log(`  Group "${GROUP_NAME}" already exists (${group.id}) — cleaning up...`);
    // Delete tournament cascade
    const t = await prisma.tournament.findFirst({ where: { groupId: group.id } });
    if (t) {
      await prisma.leaderboardEntry.deleteMany({ where: { tournamentId: t.id } });
      await prisma.bet.deleteMany({ where: { tournamentId: t.id } });
      await prisma.tournament.delete({ where: { id: t.id } });
    }
    await prisma.groupMembership.deleteMany({ where: { groupId: group.id } });
    await prisma.group.delete({ where: { id: group.id } });
    log("  Cleaned up old group data");
  }

  const slug = `${TEST_PREFIX}-${Math.random().toString(36).slice(2, 6)}`;
  group = await prisma.group.create({
    data: {
      name: GROUP_NAME,
      slug,
      settings: {
        totalPool: 1000,
        tierWeights: { tournamentBets: 0.30, perGame: 0.55, curated: 0.15 },
        subWeights: {
          tournamentBets: {
            winner: 0.10, runnerUp: 0.07, goldenBoot: 0.06, groupPredictions: 0.25,
            darkHorse: 0.04, reverseDarkHorse: 0.04, bracket: 0.25,
            goldenGlove: 0.06, goldenBall: 0.06, semifinalists: 0.07,
          },
          perGame: { matchWinner: 0.55, correctScore: 0.45 },
          curated: { props: 1.0 },
        },
        basePct: {
          winner: 0.40, runnerUp: 0.40, goldenBoot: 0.40, groupPredictions: 0.20,
          darkHorse: 0.30, reverseDarkHorse: 0.30, matchWinner: 0.15,
          correctScore: 0.20, bracket: 0.25, goldenGlove: 0.25,
          goldenBall: 0.25, semifinalists: 0.25, props: 0.15,
        },
        outlierThresholds: {
          winner: 25000, runnerUp: 20000, goldenBoot: 8000,
          groupPredictions: 5000, darkHorse: 35000, reverseDarkHorse: 10000,
          matchWinner: 100000, correctScore: 100000, bracket: 100000,
          goldenGlove: 3000, goldenBall: 3000, semifinalists: 5000, props: 5000,
        },
        knockoutMultipliers: { GROUP: 1.0, R32: 1.2, R16: 1.3, QF: 1.5, SF: 1.7, FINAL: 2.0 },
      } as unknown as Prisma.InputJsonValue,
    },
  });
  log(`  Created group "${GROUP_NAME}" (${group.id}), slug: ${slug}`);

  // 3. Add memberships (admin + 3 test users)
  log("Adding memberships...");
  await prisma.groupMembership.create({
    data: { userId: ADMIN_USER_ID, groupId: group.id, role: "ADMIN", status: "APPROVED" },
  });
  log("  Added admin (test@matchday.com)");

  for (let i = 0; i < userIds.length; i++) {
    await prisma.groupMembership.create({
      data: { userId: userIds[i], groupId: group.id, role: "MEMBER", status: "APPROVED" },
    });
    log(`  Added ${TEST_USERS[i].name}`);
  }

  // 4. Initialize tournament (replicating initTournament logic)
  log("Initializing WC 2026 tournament...");

  // We need the tournament profile data. Import it dynamically.
  // Since we can't use @/ aliases in tsx, let's use the raw data from prisma.
  // Actually, let's just call the data directly from the data file.
  const teamData = (await import("../src/lib/data/wc2026.js")).WC2026_TEAMS;
  const matchData = (await import("../src/lib/data/wc2026.js")).WC2026_GROUP_MATCHES;
  const betTypeData = (await import("../src/lib/data/wc2026.js")).TOURNAMENT_BET_TYPES;
  const resolveOpenTriggerFn = (await import("../src/lib/data/wc2026.js")).resolveOpenTrigger;

  const tournament = await prisma.tournament.create({
    data: {
      groupId: group.id,
      kind: "WC_2026",
      name: "FIFA World Cup 2026",
      status: "SETUP",
    },
  });
  log(`  Tournament created (${tournament.id})`);

  // Create teams
  await prisma.team.createMany({
    data: teamData.map((t: any) => ({
      tournamentId: tournament.id,
      name: t.name,
      code: t.code,
      groupLetter: t.groupLetter,
      odds: t.odds as unknown as Prisma.InputJsonValue,
    })),
  });
  log(`  Created ${teamData.length} teams`);

  // Create group-stage matches
  const teams = await prisma.team.findMany({ where: { tournamentId: tournament.id } });
  const teamByCode: Record<string, typeof teams[0]> = {};
  for (const t of teams) teamByCode[t.code] = t;

  const TOURNAMENT_START = new Date("2026-06-11T00:00:00Z");
  const PER_GAME_OPENS = new Date(TOURNAMENT_START.getTime() - 24 * 60 * 60 * 1000);

  await prisma.match.createMany({
    data: matchData
      .filter((m: any) => teamByCode[m.homeCode] && teamByCode[m.awayCode])
      .map((m: any) => ({
        tournamentId: tournament.id,
        homeTeamId: teamByCode[m.homeCode].id,
        awayTeamId: teamByCode[m.awayCode].id,
        phase: "GROUP" as const,
        matchday: m.matchday,
        groupLetter: m.groupLetter,
        kickoffAt: new Date(m.kickoffAt),
        externalId: String(m.externalId),
        multiplier: 1.0,
        status: "UPCOMING" as const,
      })),
  });
  log(`  Created ${matchData.length} group-stage matches`);

  // Create bet types
  const allBetTypeDefs = [
    ...betTypeData.map((bt: any) => {
      const resolved = resolveOpenTriggerFn(bt.openTrigger);
      return {
        tournamentId: tournament.id,
        category: "TOURNAMENT" as const,
        subType: bt.subType,
        name: bt.name,
        description: bt.description,
        openTrigger: bt.openTrigger,
        opensAt: resolved.opensAt,
        locksAt: resolved.locksAt,
        status: "DRAFT" as const,
        config: {} as Prisma.InputJsonValue,
      };
    }),
    {
      tournamentId: tournament.id,
      category: "PER_GAME" as const,
      subType: "match_winner",
      name: "Match Result",
      description: "Predict the result of each match.",
      openTrigger: null,
      opensAt: PER_GAME_OPENS,
      locksAt: null,
      status: "DRAFT" as const,
      config: {} as Prisma.InputJsonValue,
    },
    {
      tournamentId: tournament.id,
      category: "PER_GAME" as const,
      subType: "correct_score",
      name: "Correct Score",
      description: "Predict the exact final score.",
      openTrigger: null,
      opensAt: PER_GAME_OPENS,
      locksAt: null,
      status: "DRAFT" as const,
      config: {} as Prisma.InputJsonValue,
    },
  ];

  await prisma.betType.createMany({ data: allBetTypeDefs });
  log(`  Created ${allBetTypeDefs.length} bet types`);

  // 5. Place pre-tournament bets for all users
  log("\nPlacing pre-tournament bets...");
  const betTypes = await prisma.betType.findMany({ where: { tournamentId: tournament.id } });
  const betTypeBySubType: Record<string, typeof betTypes[0]> = {};
  for (const bt of betTypes) betTypeBySubType[bt.subType] = bt;

  const allUserIds = [ADMIN_USER_ID, ...userIds];
  const matches = await prisma.match.findMany({
    where: { tournamentId: tournament.id, phase: "GROUP" },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "asc" },
  });

  // Group teams by group letter for group predictions
  const teamsByGroup: Record<string, typeof teams> = {};
  for (const t of teams) {
    if (!teamsByGroup[t.groupLetter]) teamsByGroup[t.groupLetter] = [];
    teamsByGroup[t.groupLetter].push(t);
  }

  const betsToCreate: any[] = [];

  for (const userId of allUserIds) {
    const userName = userId === ADMIN_USER_ID ? "Admin" :
      TEST_USERS[userIds.indexOf(userId)]?.name ?? "Unknown";

    // Winner bet — each user picks a different favorite
    const winnerTeam = pick([...FAVORITES]);
    betsToCreate.push({
      userId,
      tournamentId: tournament.id,
      betTypeId: betTypeBySubType["winner"].id,
      matchId: null,
      prediction: { teamCode: winnerTeam } as unknown as Prisma.InputJsonValue,
    });

    // Runner up — different from winner
    const runnerUpPool = FAVORITES.filter(c => c !== winnerTeam);
    betsToCreate.push({
      userId,
      tournamentId: tournament.id,
      betTypeId: betTypeBySubType["runner_up"].id,
      matchId: null,
      prediction: { teamCode: pick(runnerUpPool) } as unknown as Prisma.InputJsonValue,
    });

    // Golden Boot
    betsToCreate.push({
      userId,
      tournamentId: tournament.id,
      betTypeId: betTypeBySubType["golden_boot"].id,
      matchId: null,
      prediction: { playerName: pick(GOLDEN_BOOT_CANDIDATES) } as unknown as Prisma.InputJsonValue,
    });

    // Dark Horse — pick from non-favorites (odds > 20/1)
    betsToCreate.push({
      userId,
      tournamentId: tournament.id,
      betTypeId: betTypeBySubType["dark_horse"].id,
      matchId: null,
      prediction: { teamCode: pick(DARK_HORSES) } as unknown as Prisma.InputJsonValue,
    });

    // Reverse Dark Horse — pick a favorite to crash out
    betsToCreate.push({
      userId,
      tournamentId: tournament.id,
      betTypeId: betTypeBySubType["reverse_dark_horse"].id,
      matchId: null,
      prediction: { teamCode: pick(FAVORITES) } as unknown as Prisma.InputJsonValue,
    });

    // Group Predictions — for each group, pick 1st and 2 advancing
    const groupPredictions: Record<string, string[]> = {};
    for (const letter of GROUP_LETTERS) {
      const groupTeams = teamsByGroup[letter];
      if (!groupTeams || groupTeams.length < 3) continue;
      const shuffled = [...groupTeams].sort(() => Math.random() - 0.5);
      // Pick winner (1st) + 1 more advancing team
      groupPredictions[letter] = [shuffled[0].code, shuffled[1].code];
    }
    betsToCreate.push({
      userId,
      tournamentId: tournament.id,
      betTypeId: betTypeBySubType["group_predictions"].id,
      matchId: null,
      prediction: groupPredictions as unknown as Prisma.InputJsonValue,
    });

    // Per-game bets for all group stage matches
    for (const match of matches) {
      // Match winner prediction (home/draw/away)
      const outcomes = ["home", "draw", "away"];
      betsToCreate.push({
        userId,
        tournamentId: tournament.id,
        betTypeId: betTypeBySubType["match_winner"].id,
        matchId: match.id,
        prediction: { outcome: pick(outcomes) } as unknown as Prisma.InputJsonValue,
      });

      // Correct score prediction
      const [h, a] = randomScore();
      betsToCreate.push({
        userId,
        tournamentId: tournament.id,
        betTypeId: betTypeBySubType["correct_score"].id,
        matchId: match.id,
        prediction: { homeScore: h, awayScore: a } as unknown as Prisma.InputJsonValue,
      });
    }

    log(`  Placed ${6 + matches.length * 2} bets for ${userName}`);
  }

  // Batch insert all bets
  await prisma.bet.createMany({ data: betsToCreate });
  log(`  Total bets created: ${betsToCreate.length}`);

  // Output summary
  header("SETUP COMPLETE");
  log(`Group ID: ${group.id}`);
  log(`Group slug: ${slug}`);
  log(`Tournament ID: ${tournament.id}`);
  log(`Admin: test@matchday.com (already logged in)`);
  log(`Users: ${TEST_USERS.map(u => u.name).join(", ")}`);
  log(`Total bets placed: ${betsToCreate.length}`);
  log(`\nNext steps:`);
  log(`1. Navigate to: /group/${group.id}/admin`);
  log(`2. Set simulation date to 2026-06-09 and activate`);
  log(`3. Run: npx tsx scripts/e2e-simulation-test.ts simulate ${group.id}`);

  return { groupId: group.id, tournamentId: tournament.id, userIds: allUserIds };
}

// ─── Phase: Simulate ─────────────────────────────────────────────────────────

async function simulate(groupId: string) {
  header("SIMULATE: Running day-by-day simulation");

  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Error(`Group ${groupId} not found`);

  const tournament = await prisma.tournament.findFirst({ where: { groupId } });
  if (!tournament) throw new Error("No tournament found");

  // Check current simulation state
  const settings = group.settings as any;
  if (!settings?.simulation?.enabled) {
    log("ERROR: Simulation is not active. Activate it from the admin panel first.");
    log(`Navigate to /group/${groupId}/admin and set date to 2026-06-09`);
    return;
  }

  const currentDate = new Date(settings.simulation.simulatedDate);
  log(`Current simulation date: ${currentDate.toISOString().split("T")[0]}`);

  // Get all matches
  const allMatches = await prisma.match.findMany({
    where: { tournamentId: tournament.id },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "asc" },
  });

  // Get leaderboard
  const leaderboard = await prisma.leaderboardEntry.findMany({
    where: { groupId, tournamentId: tournament.id },
    orderBy: { totalPoints: "desc" },
  });

  // Get user names
  const userMap = new Map<string, string>();
  const users = await prisma.user.findMany({
    where: { id: { in: leaderboard.map(l => l.userId) } },
    select: { id: true, name: true },
  });
  for (const u of users) userMap.set(u.id, u.name);

  // Show match results
  const completed = allMatches.filter(m => m.status === "COMPLETED");
  const upcoming = allMatches.filter(m => m.status === "UPCOMING");

  log(`\nMatches completed: ${completed.length}`);
  log(`Matches upcoming: ${upcoming.length}`);

  // Show last 5 completed matches
  if (completed.length > 0) {
    log("\nRecent results:");
    const recent = completed.slice(-5);
    for (const m of recent) {
      log(`  ${m.homeTeam.code} ${m.actualHomeScore} - ${m.actualAwayScore} ${m.awayTeam.code} (${m.phase})`);
    }
  }

  // Show standings
  if (leaderboard.length > 0) {
    log("\n── STANDINGS ──");
    for (const entry of leaderboard) {
      const name = userMap.get(entry.userId) ?? "Unknown";
      log(`  #${entry.rank} ${name.padEnd(15)} ${entry.totalPoints.toFixed(1)} pts (T:${entry.tournamentPts.toFixed(1)} G:${entry.perGamePts.toFixed(1)} C:${entry.curatedPts.toFixed(1)}) ${entry.correctBets}/${entry.totalBets} correct`);
    }
  } else {
    log("\nNo standings yet — simulation may not have scored any matches.");
  }

  // Show bet type statuses
  const betTypes = await prisma.betType.findMany({
    where: { tournamentId: tournament.id },
    orderBy: { category: "asc" },
  });
  log("\n── BET TYPE STATUS ──");
  for (const bt of betTypes) {
    const resolution = bt.resolution ? " ✓" : "";
    log(`  ${bt.name.padEnd(25)} ${bt.status.padEnd(10)} ${bt.category}${resolution}`);
  }

  // Check for bet types that need bets placed (OPEN but no bets from our users)
  const allUserIds = await prisma.groupMembership.findMany({
    where: { groupId, status: "APPROVED" },
    select: { userId: true },
  }).then(ms => ms.map(m => m.userId));

  const openBetTypes = betTypes.filter(bt => bt.status === "OPEN");
  for (const bt of openBetTypes) {
    if (bt.category === "TOURNAMENT") {
      const existingBets = await prisma.bet.count({
        where: { betTypeId: bt.id },
      });
      if (existingBets === 0) {
        log(`\n⚠ Open tournament bet "${bt.name}" has no bets placed!`);
        log(`  Run: npx tsx scripts/e2e-simulation-test.ts knockout ${groupId}`);
      }
    }
  }

  // Show next matches to be played
  if (upcoming.length > 0) {
    log("\nNext 5 upcoming matches:");
    for (const m of upcoming.slice(0, 5)) {
      log(`  ${m.homeTeam.code} vs ${m.awayTeam.code} — ${m.kickoffAt.toISOString().split("T")[0]} (${m.phase})`);
    }
  }
}

// ─── Phase: Place Knockout Bets ──────────────────────────────────────────────

async function placeKnockoutBets(groupId: string) {
  header("KNOCKOUT: Placing bets on knockout-phase markets");

  const tournament = await prisma.tournament.findFirst({ where: { groupId } });
  if (!tournament) throw new Error("No tournament found");

  const betTypes = await prisma.betType.findMany({
    where: { tournamentId: tournament.id },
  });
  const betTypeBySubType: Record<string, typeof betTypes[0]> = {};
  for (const bt of betTypes) betTypeBySubType[bt.subType] = bt;

  const allUserIds = await prisma.groupMembership.findMany({
    where: { groupId, status: "APPROVED" },
    select: { userId: true },
  }).then(ms => ms.map(m => m.userId));

  const teams = await prisma.team.findMany({ where: { tournamentId: tournament.id } });
  const teamCodes = teams.map(t => t.code);

  let totalBets = 0;

  // Bracket bet
  const bracketBt = betTypeBySubType["bracket"];
  if (bracketBt && bracketBt.status === "OPEN") {
    const knockoutMatches = await prisma.match.findMany({
      where: { tournamentId: tournament.id, phase: { not: "GROUP" } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: [{ phase: "asc" }, { kickoffAt: "asc" }],
    });

    for (const userId of allUserIds) {
      const existing = await prisma.bet.findFirst({
        where: { userId, betTypeId: bracketBt.id, matchId: null },
      });
      if (existing) continue;

      // Build bracket picks — for each KO match, pick a random winner
      const picks: Record<string, string> = {};
      const PHASES_ORDER = ["R32", "R16", "QF", "SF", "FINAL"];
      for (const phase of PHASES_ORDER) {
        const phaseMatches = knockoutMatches
          .filter(m => m.phase === phase)
          .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());
        phaseMatches.forEach((m, i) => {
          picks[`${phase}-${i}`] = Math.random() > 0.5 ? m.homeTeam.code : m.awayTeam.code;
        });
      }

      await prisma.bet.create({
        data: {
          userId,
          tournamentId: tournament.id,
          betTypeId: bracketBt.id,
          matchId: null,
          prediction: { picks } as unknown as Prisma.InputJsonValue,
        },
      });
      totalBets++;
    }
    log(`  Placed bracket bets`);
  }

  // Golden Ball
  const goldenBallBt = betTypeBySubType["golden_ball"];
  if (goldenBallBt && goldenBallBt.status === "OPEN") {
    for (const userId of allUserIds) {
      const existing = await prisma.bet.findFirst({
        where: { userId, betTypeId: goldenBallBt.id, matchId: null },
      });
      if (existing) continue;
      await prisma.bet.create({
        data: {
          userId,
          tournamentId: tournament.id,
          betTypeId: goldenBallBt.id,
          matchId: null,
          prediction: { playerName: pick(GOLDEN_BOOT_CANDIDATES) } as unknown as Prisma.InputJsonValue,
        },
      });
      totalBets++;
    }
    log(`  Placed golden ball bets`);
  }

  // Golden Glove
  const goldenGloveBt = betTypeBySubType["golden_glove"];
  if (goldenGloveBt && goldenGloveBt.status === "OPEN") {
    const goalkeepers = ["Donnarumma", "Courtois", "Alisson", "Neuer", "Dibu Martinez",
      "De Gea", "Oblak", "ter Stegen", "Pickford", "Maignan"];
    for (const userId of allUserIds) {
      const existing = await prisma.bet.findFirst({
        where: { userId, betTypeId: goldenGloveBt.id, matchId: null },
      });
      if (existing) continue;
      await prisma.bet.create({
        data: {
          userId,
          tournamentId: tournament.id,
          betTypeId: goldenGloveBt.id,
          matchId: null,
          prediction: { playerName: pick(goalkeepers) } as unknown as Prisma.InputJsonValue,
        },
      });
      totalBets++;
    }
    log(`  Placed golden glove bets`);
  }

  // Semifinalists
  const semiBt = betTypeBySubType["semifinalists"];
  if (semiBt && semiBt.status === "OPEN") {
    for (const userId of allUserIds) {
      const existing = await prisma.bet.findFirst({
        where: { userId, betTypeId: semiBt.id, matchId: null },
      });
      if (existing) continue;
      // Pick 4 random teams from R16 participants
      const r16Matches = await prisma.match.findMany({
        where: { tournamentId: tournament.id, phase: "R16" },
        include: { homeTeam: true, awayTeam: true },
      });
      const r16Teams = [...new Set(r16Matches.flatMap(m => [m.homeTeam.code, m.awayTeam.code]))];
      const sfPicks = pickN(r16Teams.length > 4 ? r16Teams : [...FAVORITES, ...MID_TIER], 4);
      await prisma.bet.create({
        data: {
          userId,
          tournamentId: tournament.id,
          betTypeId: semiBt.id,
          matchId: null,
          prediction: { teams: sfPicks } as unknown as Prisma.InputJsonValue,
        },
      });
      totalBets++;
    }
    log(`  Placed semifinalist bets`);
  }

  // Per-game bets on knockout matches (that don't have bets yet)
  const matchWinnerBt = betTypeBySubType["match_winner"];
  const correctScoreBt = betTypeBySubType["correct_score"];

  if (matchWinnerBt && correctScoreBt) {
    const koMatches = await prisma.match.findMany({
      where: {
        tournamentId: tournament.id,
        phase: { not: "GROUP" },
        status: "UPCOMING",
      },
      include: { homeTeam: true, awayTeam: true },
    });

    for (const match of koMatches) {
      for (const userId of allUserIds) {
        // Match winner
        const existingMW = await prisma.bet.findFirst({
          where: { userId, betTypeId: matchWinnerBt.id, matchId: match.id },
        });
        if (!existingMW) {
          await prisma.bet.create({
            data: {
              userId,
              tournamentId: tournament.id,
              betTypeId: matchWinnerBt.id,
              matchId: match.id,
              prediction: { outcome: pick(["home", "draw", "away"]) } as unknown as Prisma.InputJsonValue,
            },
          });
          totalBets++;
        }

        // Correct score
        const existingCS = await prisma.bet.findFirst({
          where: { userId, betTypeId: correctScoreBt.id, matchId: match.id },
        });
        if (!existingCS) {
          const [h, a] = randomScore();
          await prisma.bet.create({
            data: {
              userId,
              tournamentId: tournament.id,
              betTypeId: correctScoreBt.id,
              matchId: match.id,
              prediction: { homeScore: h, awayScore: a } as unknown as Prisma.InputJsonValue,
            },
          });
          totalBets++;
        }
      }
    }
    log(`  Placed per-game bets on ${koMatches.length} knockout matches`);
  }

  log(`\nTotal new bets placed: ${totalBets}`);
}

// ─── Phase: Cleanup ──────────────────────────────────────────────────────────

async function cleanup() {
  header("CLEANUP: Removing test data");

  const group = await prisma.group.findFirst({ where: { name: GROUP_NAME } });
  if (group) {
    const t = await prisma.tournament.findFirst({ where: { groupId: group.id } });
    if (t) {
      await prisma.leaderboardEntry.deleteMany({ where: { tournamentId: t.id } });
      await prisma.bet.deleteMany({ where: { tournamentId: t.id } });
      await prisma.tournament.delete({ where: { id: t.id } });
    }
    await prisma.groupMembership.deleteMany({ where: { groupId: group.id } });
    await prisma.group.delete({ where: { id: group.id } });
    log("Deleted group and tournament data");
  }

  for (const u of TEST_USERS) {
    const user = await prisma.user.findUnique({ where: { email: u.email } });
    if (user) {
      await prisma.user.delete({ where: { id: user.id } });
      log(`Deleted user ${u.email}`);
    }
  }

  log("Cleanup complete");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const phase = process.argv[2] ?? "setup";
  const groupId = process.argv[3];

  try {
    switch (phase) {
      case "setup":
        await setup();
        break;
      case "simulate":
        if (!groupId) {
          console.error("Usage: npx tsx scripts/e2e-simulation-test.ts simulate <groupId>");
          process.exit(1);
        }
        await simulate(groupId);
        break;
      case "knockout":
        if (!groupId) {
          console.error("Usage: npx tsx scripts/e2e-simulation-test.ts knockout <groupId>");
          process.exit(1);
        }
        await placeKnockoutBets(groupId);
        break;
      case "cleanup":
        await cleanup();
        break;
      case "all":
        const result = await setup();
        log("\n⚠ To continue, activate simulation in the browser, then run:");
        log(`  npx tsx scripts/e2e-simulation-test.ts simulate ${result.groupId}`);
        break;
      default:
        console.error(`Unknown phase: ${phase}`);
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
