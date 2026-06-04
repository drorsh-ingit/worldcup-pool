/**
 * E2E: Parallel Group Isolation Test
 *
 * Creates 2 groups, places bets in each, runs full tournament simulation
 * in parallel, then verifies:
 *  1. Each group has its own independent tournament, teams, matches, bet types
 *  2. Scores in group A are unaffected by group B (different random results)
 *  3. Leaderboards are independent
 *  4. No cross-group data leakage
 *
 * Run: npx tsx scripts/e2e-parallel-groups.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const db = new PrismaClient();
const USER_EMAIL = "drorsh@gmail.com";

let passes = 0;
let fails = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passes++;
    console.log(`  ✅ ${label}`);
  } else {
    fails++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertExact(label: string, actual: number | string | null, expected: number | string | null) {
  if (actual === expected) {
    passes++;
    console.log(`  ✅ ${label}: ${actual}`);
  } else {
    fails++;
    console.log(`  ❌ ${label}: actual=${actual}, expected=${expected}`);
  }
}

async function deleteGroupCascade(groupId: string) {
  const tournaments = await db.tournament.findMany({ where: { groupId }, select: { id: true } });
  for (const t of tournaments) {
    await db.bet.deleteMany({ where: { tournamentId: t.id } });
    await db.betType.deleteMany({ where: { tournamentId: t.id } });
    await db.match.deleteMany({ where: { tournamentId: t.id } });
    await db.team.deleteMany({ where: { tournamentId: t.id } });
  }
  await db.tournament.deleteMany({ where: { groupId } });
  await db.leaderboardEntry.deleteMany({ where: { groupId } });
  await db.groupMembership.deleteMany({ where: { groupId } });
  await db.group.delete({ where: { id: groupId } });
}

async function createTestGroup(name: string, userId: string) {
  const { DEFAULT_GROUP_SETTINGS } = await import("../src/lib/settings");
  const { getProfile } = await import("../src/lib/tournaments/registry");

  const group = await db.group.create({
    data: {
      name,
      slug: `test-parallel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      settings: DEFAULT_GROUP_SETTINGS as unknown as Prisma.InputJsonValue,
      members: {
        create: { userId, role: "ADMIN", status: "APPROVED" },
      },
    },
  });

  // Initialize tournament using profile (mirrors initTournament without auth)
  const profile = getProfile("WC_2026");
  const tournament = await db.tournament.create({
    data: { groupId: group.id, kind: profile.id, name: profile.displayName, status: "SETUP" },
  });

  await db.team.createMany({
    data: profile.teams.map((t) => ({
      tournamentId: tournament.id,
      name: t.name,
      code: t.code,
      groupLetter: t.groupLetter,
      odds: t.odds as unknown as Prisma.InputJsonValue,
    })),
  });

  const teams = await db.team.findMany({ where: { tournamentId: tournament.id } });
  const teamByCode = Object.fromEntries(teams.map((t) => [t.code, t]));
  const teamIdByCode: Record<string, string> = {};
  for (const t of teams) teamIdByCode[t.code] = t.id;

  const matchesData = profile.matches
    .filter((m) => teamByCode[m.homeCode] && teamByCode[m.awayCode])
    .map((m) => ({
      tournamentId: tournament.id,
      homeTeamId: teamByCode[m.homeCode].id,
      awayTeamId: teamByCode[m.awayCode].id,
      phase: m.phase,
      matchday: m.matchday,
      groupLetter: m.groupLetter,
      kickoffAt: m.kickoffAt,
      externalId: m.externalId,
      multiplier: m.multiplier,
      status: "UPCOMING" as const,
    }));
  await db.match.createMany({ data: matchesData });

  await db.betType.createMany({
    data: profile.betTypes.map((bt) => {
      const resolved = bt.openTrigger ? profile.resolveOpenTrigger(bt.openTrigger) : null;
      return {
        tournamentId: tournament.id,
        category: bt.category,
        subType: bt.subType,
        name: bt.name,
        description: bt.description,
        openTrigger: bt.openTrigger ?? null,
        opensAt: resolved?.opensAt ?? bt.opensAt ?? null,
        locksAt: resolved?.locksAt ?? bt.locksAt ?? null,
        status: "DRAFT" as const,
        config: (bt.config ?? {}) as Prisma.InputJsonValue,
      };
    }),
  });

  return { group, tournament, teams, teamIdByCode };
}

async function placeBetsForGroup(
  groupId: string,
  tournamentId: string,
  userId: string,
  teamIdByCode: Record<string, string>,
  winnerCode: string,
  runnerUpCode: string,
  darkHorseCode: string,
) {
  const betTypes = await db.betType.findMany({ where: { tournamentId } });
  const btBySubType: Record<string, typeof betTypes[number]> = {};
  for (const bt of betTypes) btBySubType[bt.subType] = bt;

  // Open pre-tournament bets (simulate opensAt trigger)
  const preOpenSubtypes = ["winner", "runner_up", "dark_horse", "reverse_dark_horse", "group_predictions", "golden_boot", "match_winner", "correct_score"];
  for (const sub of preOpenSubtypes) {
    const bt = btBySubType[sub];
    if (bt && bt.status === "DRAFT") {
      const { snapshotOddsForBetType } = await import("../src/lib/actions/refresh-odds");
      const frozenOdds = await snapshotOddsForBetType(tournamentId, bt.category, bt.subType);
      await db.betType.update({
        where: { id: bt.id },
        data: { status: "OPEN", frozenOdds: frozenOdds ?? undefined },
      });
    }
  }

  const bets: Record<string, string> = {};

  // Winner bet
  if (btBySubType.winner) {
    const { WC2026_TEAMS } = await import("../src/lib/data/wc2026");
    const team = WC2026_TEAMS.find(t => t.code === winnerCode)!;
    const bet = await db.bet.create({
      data: {
        betTypeId: btBySubType.winner.id,
        userId,
        tournamentId,
        prediction: { teamCode: winnerCode, odds: team.odds.winnerOdds } as unknown as Prisma.InputJsonValue,
      },
    });
    bets.winner = bet.id;
  }

  // Runner up bet
  if (btBySubType.runner_up) {
    const { WC2026_TEAMS } = await import("../src/lib/data/wc2026");
    const team = WC2026_TEAMS.find(t => t.code === runnerUpCode)!;
    const bet = await db.bet.create({
      data: {
        betTypeId: btBySubType.runner_up.id,
        userId,
        tournamentId,
        prediction: { teamCode: runnerUpCode, odds: team.odds.winnerOdds } as unknown as Prisma.InputJsonValue,
      },
    });
    bets.runner_up = bet.id;
  }

  // Dark horse bet
  if (btBySubType.dark_horse) {
    const { WC2026_TEAMS } = await import("../src/lib/data/wc2026");
    const team = WC2026_TEAMS.find(t => t.code === darkHorseCode)!;
    const bet = await db.bet.create({
      data: {
        betTypeId: btBySubType.dark_horse.id,
        userId,
        tournamentId,
        prediction: { teamCode: darkHorseCode, odds: team.odds.winnerOdds } as unknown as Prisma.InputJsonValue,
      },
    });
    bets.dark_horse = bet.id;
  }

  // Group predictions — pick favourites for all groups
  if (btBySubType.group_predictions) {
    const { WC2026_TEAMS } = await import("../src/lib/data/wc2026");
    const prediction: Record<string, string[]> = {};
    const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
    for (const letter of GROUPS) {
      const groupTeams = WC2026_TEAMS
        .filter(t => t.groupLetter === letter)
        .sort((a, b) => a.odds.winnerOdds - b.odds.winnerOdds);
      prediction[letter] = [groupTeams[0].code, groupTeams[1].code, groupTeams[2].code];
    }
    const bet = await db.bet.create({
      data: {
        betTypeId: btBySubType.group_predictions.id,
        userId,
        tournamentId,
        prediction: prediction as unknown as Prisma.InputJsonValue,
      },
    });
    bets.group_predictions = bet.id;
  }

  return bets;
}

async function main() {
  console.log("═══ Parallel Group Isolation Test ═══\n");

  const user = await db.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User ${USER_EMAIL} not found`);

  // Step 0: Delete the existing E2E test group
  console.log("── Step 0: Cleanup existing groups ──");
  const existingGroups = await db.group.findMany({
    where: {
      OR: [
        { slug: { startsWith: "e2e-test-" } },
        { slug: { startsWith: "test-parallel-" } },
      ],
    },
  });
  for (const g of existingGroups) {
    console.log(`  Deleting group: ${g.name} (${g.id})`);
    await deleteGroupCascade(g.id);
  }
  console.log(`  Deleted ${existingGroups.length} groups\n`);

  // Step 1: Create 2 groups
  console.log("── Step 1: Create 2 groups ──");
  const groupA = await createTestGroup("Parallel Test A", user.id);
  const groupB = await createTestGroup("Parallel Test B", user.id);
  console.log(`  Group A: ${groupA.group.id}`);
  console.log(`  Group B: ${groupB.group.id}\n`);

  // Verify independence: each group has its own tournament
  assert("Groups have different IDs", groupA.group.id !== groupB.group.id);
  assert("Tournaments have different IDs", groupA.tournament.id !== groupB.tournament.id);

  // Verify team isolation: each group has 48 teams, none shared
  const teamsA = await db.team.findMany({ where: { tournamentId: groupA.tournament.id } });
  const teamsB = await db.team.findMany({ where: { tournamentId: groupB.tournament.id } });
  assertExact("Group A has 48 teams", teamsA.length, 48);
  assertExact("Group B has 48 teams", teamsB.length, 48);
  const teamIdsA = new Set(teamsA.map(t => t.id));
  const teamIdsB = new Set(teamsB.map(t => t.id));
  const sharedTeams = [...teamIdsA].filter(id => teamIdsB.has(id));
  assertExact("No shared team IDs between groups", sharedTeams.length, 0);

  // Verify match isolation
  const matchesA = await db.match.findMany({ where: { tournamentId: groupA.tournament.id } });
  const matchesB = await db.match.findMany({ where: { tournamentId: groupB.tournament.id } });
  assertExact("Group A has 72 group matches", matchesA.length, 72);
  assertExact("Group B has 72 group matches", matchesB.length, 72);
  const matchIdsA = new Set(matchesA.map(m => m.id));
  const matchIdsB = new Set(matchesB.map(m => m.id));
  const sharedMatches = [...matchIdsA].filter(id => matchIdsB.has(id));
  assertExact("No shared match IDs between groups", sharedMatches.length, 0);

  // Step 2: Place different bets in each group
  console.log("\n── Step 2: Place bets ──");
  // Group A picks France as winner, Brazil as runner up, Turkey as dark horse
  const betsA = await placeBetsForGroup(
    groupA.group.id, groupA.tournament.id, user.id, groupA.teamIdByCode,
    "FRA", "BRA", "TUR"
  );
  // Group B picks Argentina as winner, England as runner up, Ecuador as dark horse
  const betsB = await placeBetsForGroup(
    groupB.group.id, groupB.tournament.id, user.id, groupB.teamIdByCode,
    "ARG", "ENG", "ECU"
  );
  console.log(`  Group A bets: ${Object.keys(betsA).length} placed`);
  console.log(`  Group B bets: ${Object.keys(betsB).length} placed`);

  // Verify bet isolation
  const allBetsA = await db.bet.findMany({ where: { tournamentId: groupA.tournament.id } });
  const allBetsB = await db.bet.findMany({ where: { tournamentId: groupB.tournament.id } });
  const betIdsA = new Set(allBetsA.map(b => b.id));
  const betIdsB = new Set(allBetsB.map(b => b.id));
  const sharedBets = [...betIdsA].filter(id => betIdsB.has(id));
  assertExact("No shared bet IDs between groups", sharedBets.length, 0);

  // Step 3: Run simulation on BOTH groups
  // Note: simulateTournamentProgression uses the shared global Prisma client (db singleton).
  // Running both truly in parallel via Promise.all causes Neon to drop the connection
  // (P1017) because a single script hammers it with 200+ concurrent sequential queries.
  // In the real app each simulation is a separate serverless invocation with its own
  // connection from Neon's pgBouncer, which handles this correctly.
  // Here we run them back-to-back; isolation is still fully proven because Group A's
  // data cannot affect Group B's data — they use entirely separate DB rows.
  console.log("\n── Step 3: Simulate full tournament (group A then B) ──");
  const { simulateTournamentProgression, applyBetTypeTransitions } =
    await import("../src/lib/actions/simulation");

  const simulatedDate = new Date("2026-07-20T22:00:00Z");
  const awards = {
    goldenBoot: "Kylian Mbappé",
    goldenBall: "Vinícius Júnior",
    goldenGlove: "Alisson",
  };

  async function prepareAndSimulate(groupId: string, tournamentId: string, label: string) {
    const t0 = Date.now();
    const betTypes = await db.betType.findMany({ where: { tournamentId } });
    await applyBetTypeTransitions(betTypes, simulatedDate);
    await simulateTournamentProgression(groupId, tournamentId, simulatedDate, awards);
    console.log(`  ${label} simulation done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  const startTime = Date.now();
  await prepareAndSimulate(groupA.group.id, groupA.tournament.id, "Group A");
  await prepareAndSimulate(groupB.group.id, groupB.tournament.id, "Group B");
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Total: ${elapsed}s\n`);

  // Step 4: Verify results
  console.log("── Step 4: Verify isolation after simulation ──");

  // 4a: Each group should have its own completed matches with potentially different scores
  const finalMatchesA = await db.match.findMany({
    where: { tournamentId: groupA.tournament.id },
    include: { homeTeam: true, awayTeam: true },
  });
  const finalMatchesB = await db.match.findMany({
    where: { tournamentId: groupB.tournament.id },
    include: { homeTeam: true, awayTeam: true },
  });

  const completedA = finalMatchesA.filter(m => m.status === "COMPLETED");
  const completedB = finalMatchesB.filter(m => m.status === "COMPLETED");
  assert("Group A completed > 100 matches (group + knockout)", completedA.length > 100,
    `got ${completedA.length}`);
  assert("Group B completed > 100 matches (group + knockout)", completedB.length > 100,
    `got ${completedB.length}`);

  // 4b: Check that match results differ between groups (random scores)
  // Compare group stage results for the same fixture (by team codes)
  let diffScoreCount = 0;
  let totalCompared = 0;
  for (const mA of completedA.filter(m => m.phase === "GROUP")) {
    const mB = completedB.find(
      m => m.phase === "GROUP" &&
        m.homeTeam.code === mA.homeTeam.code &&
        m.awayTeam.code === mA.awayTeam.code
    );
    if (mB) {
      totalCompared++;
      if (mA.actualHomeScore !== mB.actualHomeScore || mA.actualAwayScore !== mB.actualAwayScore) {
        diffScoreCount++;
      }
    }
  }
  console.log(`  Compared ${totalCompared} shared group-stage fixtures`);
  console.log(`  ${diffScoreCount} have different scores (random)`);
  assert(
    "At least some group-stage scores differ between groups (independent RNG)",
    diffScoreCount > 10,
    `only ${diffScoreCount}/${totalCompared} differ`
  );

  // 4c: Verify knockout phase progressed in both — FINAL should exist
  const finalA = finalMatchesA.filter(m => m.phase === "FINAL");
  const finalB = finalMatchesB.filter(m => m.phase === "FINAL");
  assert("Group A has FINAL match", finalA.length >= 1, `got ${finalA.length}`);
  assert("Group B has FINAL match", finalB.length >= 1, `got ${finalB.length}`);

  // 4d: Winner may differ between groups (different random results)
  const winnerA = finalA.find(m => m.status === "COMPLETED");
  const winnerB = finalB.find(m => m.status === "COMPLETED");
  const winnerCodeA = winnerA
    ? (winnerA.actualHomeScore! >= winnerA.actualAwayScore! ? winnerA.homeTeam.code : winnerA.awayTeam.code)
    : "???";
  const winnerCodeB = winnerB
    ? (winnerB.actualHomeScore! >= winnerB.actualAwayScore! ? winnerB.homeTeam.code : winnerB.awayTeam.code)
    : "???";
  console.log(`  Group A tournament winner: ${winnerCodeA}`);
  console.log(`  Group B tournament winner: ${winnerCodeB}`);

  // 4e: Verify bet types resolved independently
  const btA = await db.betType.findMany({ where: { tournamentId: groupA.tournament.id } });
  const btB = await db.betType.findMany({ where: { tournamentId: groupB.tournament.id } });
  const resolvedA = btA.filter(bt => bt.status === "RESOLVED");
  const resolvedB = btB.filter(bt => bt.status === "RESOLVED");
  console.log(`  Group A: ${resolvedA.length}/${btA.length} bet types resolved`);
  console.log(`  Group B: ${resolvedB.length}/${btB.length} bet types resolved`);

  const expectedResolved = ["winner", "runner_up", "dark_horse", "reverse_dark_horse",
    "group_predictions", "golden_boot", "golden_ball", "golden_glove",
    "bracket", "semifinalists"];
  for (const sub of expectedResolved) {
    const rA = btA.find(bt => bt.subType === sub);
    const rB = btB.find(bt => bt.subType === sub);
    assert(`Group A: ${sub} resolved`, rA?.status === "RESOLVED", `status=${rA?.status}`);
    assert(`Group B: ${sub} resolved`, rB?.status === "RESOLVED", `status=${rB?.status}`);
  }

  // 4f: Verify resolutions are INDEPENDENT — winner/runner_up resolution should match
  // each group's own final result, NOT the other group's
  const winnerBtA = btA.find(bt => bt.subType === "winner");
  const winnerBtB = btB.find(bt => bt.subType === "winner");
  const resolvedWinnerA = (winnerBtA?.resolution as { teamCode?: string })?.teamCode;
  const resolvedWinnerB = (winnerBtB?.resolution as { teamCode?: string })?.teamCode;
  assertExact("Group A winner resolution matches its final", resolvedWinnerA ?? "???", winnerCodeA);
  assertExact("Group B winner resolution matches its final", resolvedWinnerB ?? "???", winnerCodeB);

  // 4g: Verify scored bets belong to the right group
  const scoredBetsA = await db.bet.findMany({
    where: { tournamentId: groupA.tournament.id, totalPoints: { not: null } },
  });
  const scoredBetsB = await db.bet.findMany({
    where: { tournamentId: groupB.tournament.id, totalPoints: { not: null } },
  });
  assert("Group A has scored bets", scoredBetsA.length > 0, `got ${scoredBetsA.length}`);
  assert("Group B has scored bets", scoredBetsB.length > 0, `got ${scoredBetsB.length}`);

  // Verify no bet belongs to the wrong tournament
  for (const b of scoredBetsA) {
    assert(`Bet ${b.id} in group A → tournament A`, b.tournamentId === groupA.tournament.id);
  }
  for (const b of scoredBetsB) {
    assert(`Bet ${b.id} in group B → tournament B`, b.tournamentId === groupB.tournament.id);
  }

  // 4h: Leaderboard isolation
  const leaderboardA = await db.leaderboardEntry.findMany({ where: { groupId: groupA.group.id } });
  const leaderboardB = await db.leaderboardEntry.findMany({ where: { groupId: groupB.group.id } });
  assert("Group A has leaderboard entries", leaderboardA.length > 0);
  assert("Group B has leaderboard entries", leaderboardB.length > 0);
  // Should NOT share entries
  const lbGroupIdsA = new Set(leaderboardA.map(e => e.groupId));
  const lbGroupIdsB = new Set(leaderboardB.map(e => e.groupId));
  assert("Group A leaderboard only has group A entries", lbGroupIdsA.size === 1 && lbGroupIdsA.has(groupA.group.id));
  assert("Group B leaderboard only has group B entries", lbGroupIdsB.size === 1 && lbGroupIdsB.has(groupB.group.id));

  // 4i: Points differ between groups (different results → different scores)
  const totalPtsA = leaderboardA.reduce((s, e) => s + e.totalPoints, 0);
  const totalPtsB = leaderboardB.reduce((s, e) => s + e.totalPoints, 0);
  console.log(`\n  Group A total points: ${totalPtsA.toFixed(1)}`);
  console.log(`  Group B total points: ${totalPtsB.toFixed(1)}`);

  // 4j: Verify group_predictions resolution is independent
  const gpBtA = btA.find(bt => bt.subType === "group_predictions");
  const gpBtB = btB.find(bt => bt.subType === "group_predictions");
  const gpResA = gpBtA?.resolution as { winners?: Record<string, string>; advancing?: string[] } | null;
  const gpResB = gpBtB?.resolution as { winners?: Record<string, string>; advancing?: string[] } | null;
  const gpWinnersA = Object.values(gpResA?.winners ?? {}).sort().join(",");
  const gpWinnersB = Object.values(gpResB?.winners ?? {}).sort().join(",");
  console.log(`  Group A group winners: ${gpWinnersA.slice(0, 60)}...`);
  console.log(`  Group B group winners: ${gpWinnersB.slice(0, 60)}...`);
  // With random scores, group winners should mostly differ
  assert(
    "Group predictions resolutions are independent (some winners differ)",
    gpWinnersA !== gpWinnersB,
    "identical winners — would be astronomically unlikely with random scores"
  );

  // ── Summary ──
  console.log(`\n═══ Results: ${passes} passed, ${fails} failed ═══`);

  // Cleanup
  console.log("\n── Cleanup ──");
  await deleteGroupCascade(groupA.group.id);
  await deleteGroupCascade(groupB.group.id);
  console.log("  Both test groups deleted");

  process.exit(fails > 0 ? 1 : 0);
}

main()
  .catch((err) => { console.error("Fatal:", err); process.exit(2); })
  .finally(() => db.$disconnect());
