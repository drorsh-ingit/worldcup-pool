/**
 * E2E: Potential Points vs Actual Scored Points
 *
 * Verifies that the potential points shown in the UI (via bets-page-data.ts)
 * EXACTLY match the points scored when the bet is resolved correctly.
 *
 * Strategy: For every bet type, we compute potential using the same code path
 * the UI uses (calculatePoints / bracketPickPotential), place the bet, then
 * resolve the bet to make it correct, score it, and compare.
 *
 * Run: npx tsx scripts/e2e-potential-vs-actual.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const db = new PrismaClient();
const USER_EMAIL = "drorsh@gmail.com";

let passes = 0;
let fails = 0;

function assertExact(label: string, actual: number | null, expected: number) {
  const a = actual ?? 0;
  if (a === expected) {
    passes++;
    console.log(`  ✅ ${label}: ${a}`);
  } else {
    fails++;
    console.log(`  ❌ ${label}: actual=${a}, expected=${expected} (diff=${(a - expected).toFixed(6)})`);
  }
}

async function main() {
  console.log("═══ Potential Points vs Actual Scored Points ═══\n");

  const user = await db.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User ${USER_EMAIL} not found`);

  // ── Setup ──
  const { WC2026_TEAMS, WC2026_GROUP_MATCHES, GOLDEN_BOOT_CANDIDATES, GOLDEN_BALL_CANDIDATES, GOLDEN_GLOVE_CANDIDATES } =
    await import("../src/lib/data/wc2026");
  const { calculatePoints, scoreBets, bracketPickPotential, scoreBracketPerPick, scoreSemifinalistsPerPick } =
    await import("../src/lib/scoring");
  const { resolveGroupSettings, DEFAULT_GROUP_SETTINGS } = await import("../src/lib/settings");
  const { deriveMatchOdds, deriveScoreOdds } = await import("../src/lib/match-odds");
  const { snapshotOddsForBetType } = await import("../src/lib/actions/refresh-odds");

  const group = await db.group.create({
    data: { name: "Potential vs Actual Test", slug: `pot-test-${Date.now()}`, settings: {} as unknown as Prisma.InputJsonValue },
  });
  await db.groupMembership.create({
    data: { userId: user.id, groupId: group.id, role: "ADMIN", status: "APPROVED" },
  });

  const tournament = await db.tournament.create({
    data: { groupId: group.id, kind: "WC_2026", name: "WC 2026", status: "GROUP_STAGE" },
  });

  for (const t of WC2026_TEAMS) {
    await db.team.create({
      data: {
        tournamentId: tournament.id,
        name: t.name, code: t.code, groupLetter: t.groupLetter,
        odds: t.odds as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const teams = await db.team.findMany({ where: { tournamentId: tournament.id } });
  const teamByCode: Record<string, (typeof teams)[number]> = {};
  for (const t of teams) teamByCode[t.code] = t;

  // Create a few group matches for per-game testing
  const testMatchData = WC2026_GROUP_MATCHES.slice(0, 3);
  for (const m of testMatchData) {
    await db.match.create({
      data: {
        tournamentId: tournament.id,
        homeTeamId: teamByCode[m.homeCode].id,
        awayTeamId: teamByCode[m.awayCode].id,
        kickoffAt: new Date(m.kickoffAt),
        phase: "GROUP", groupLetter: m.groupLetter, status: "UPCOMING",
        externalId: String(m.externalId),
      },
    });
  }

  const settings = resolveGroupSettings({});
  const totalPool = settings.totalPool ?? 1000;
  const memberCount = 1; // single member

  const impliedProb = (odds: number) => 1 / Math.max(odds, 1);

  // ── Snapshot frozen odds (mimic what promotion does) ──
  // This is what the UI reads from and what scoring reads from
  const frozenOdds = await snapshotOddsForBetType(tournament.id, "TOURNAMENT", "winner");

  // Helper: compute UI potential the same way bets-page-data.ts does
  function uiPotential(subType: string, odds: number): number {
    return calculatePoints(true, subType, impliedProb(odds), settings, "GROUP", totalPool, Math.max(memberCount, 1)).totalPoints;
  }

  // ── Test 1: Simple team bets (winner, runner_up, dark_horse) ──
  console.log("── 1. Simple team bets ──");

  const simpleBets: Array<{ subType: string; teamCode: string; oddsField: "winnerOdds" }> = [
    { subType: "winner", teamCode: "FRA", oddsField: "winnerOdds" },
    { subType: "runner_up", teamCode: "BRA", oddsField: "winnerOdds" },
    { subType: "dark_horse", teamCode: "TUR", oddsField: "winnerOdds" },
  ];

  for (const { subType, teamCode, oddsField } of simpleBets) {
    const bt = await db.betType.create({
      data: {
        tournamentId: tournament.id, category: "TOURNAMENT", subType, name: subType,
        status: "OPEN", frozenOdds: frozenOdds,
      },
    });

    // Get odds from frozen snapshot (same as UI's teamOddsFor())
    const frozenTeams = (frozenOdds as { teams?: Record<string, { winnerOdds?: number }> })?.teams ?? {};
    const odds = frozenTeams[teamCode]?.winnerOdds ?? (teamByCode[teamCode].odds as { winnerOdds: number }).winnerOdds;

    // UI potential
    const potential = uiPotential(subType, odds);

    // Place bet (same as UI does: stores odds in prediction)
    const bet = await db.bet.create({
      data: {
        betTypeId: bt.id, userId: user.id, tournamentId: tournament.id,
        prediction: { teamCode, odds } as unknown as Prisma.InputJsonValue,
      },
    });

    // Resolve to make bet correct
    const resolution = subType === "dark_horse"
      ? { teams: [teamCode] }
      : { teamCode };
    await db.betType.update({
      where: { id: bt.id },
      data: { status: "RESOLVED", resolution: resolution as unknown as Prisma.InputJsonValue, resolvedAt: new Date() },
    });

    // Score
    await scoreBets(group.id, tournament.id, null, bt.id);

    // Verify
    const scored = await db.bet.findUnique({ where: { id: bet.id } });
    assertExact(`${subType} (${teamCode}) totalPoints`, scored?.totalPoints ?? 0, potential);
    assertExact(`${subType} (${teamCode}) basePoints`, scored?.basePoints ?? 0,
      calculatePoints(true, subType, impliedProb(odds), settings, "GROUP", totalPool, Math.max(memberCount, 1)).basePoints);
    assertExact(`${subType} (${teamCode}) bonusPoints`, scored?.bonusPoints ?? 0,
      calculatePoints(true, subType, impliedProb(odds), settings, "GROUP", totalPool, Math.max(memberCount, 1)).bonusPoints);
  }

  // ── Test 2: Reverse dark horse ──
  console.log("\n── 2. Reverse dark horse ──");
  {
    const bt = await db.betType.create({
      data: {
        tournamentId: tournament.id, category: "TOURNAMENT", subType: "reverse_dark_horse", name: "Reverse Dark Horse",
        status: "OPEN", frozenOdds: frozenOdds,
      },
    });

    const frozenTeams = (frozenOdds as { teams?: Record<string, { qualifyOdds?: number }> })?.teams ?? {};
    const qualifyOdds = frozenTeams["NED"]?.qualifyOdds ?? (teamByCode["NED"].odds as { qualifyOdds: number }).qualifyOdds;

    // UI computes effectiveOdds = 400000/qualifyOdds for display
    const effectiveOdds = Math.max(1, 400000 / qualifyOdds);
    const potential = uiPotential("reverse_dark_horse", effectiveOdds);

    // Bet stores raw qualifyOdds (same as teamPickerOdds)
    const bet = await db.bet.create({
      data: {
        betTypeId: bt.id, userId: user.id, tournamentId: tournament.id,
        prediction: { teamCode: "NED", odds: qualifyOdds } as unknown as Prisma.InputJsonValue,
      },
    });

    // Resolve: NED eliminated in groups
    await db.betType.update({
      where: { id: bt.id },
      data: { status: "RESOLVED", resolution: { teams: ["NED"] } as unknown as Prisma.InputJsonValue, resolvedAt: new Date() },
    });

    await scoreBets(group.id, tournament.id, null, bt.id);
    const scored = await db.bet.findUnique({ where: { id: bet.id } });
    assertExact("reverse_dark_horse (NED) totalPoints", scored?.totalPoints ?? 0, potential);
  }

  // ── Test 3: Player awards (golden_boot, golden_ball, golden_glove) ──
  console.log("\n── 3. Player awards ──");

  const playerBets = [
    { subType: "golden_boot", playerName: "Kylian Mbappé", candidates: GOLDEN_BOOT_CANDIDATES },
    { subType: "golden_ball", playerName: "Vinicius Jr.", candidates: GOLDEN_BALL_CANDIDATES },
    { subType: "golden_glove", playerName: "Alisson", candidates: GOLDEN_GLOVE_CANDIDATES },
  ] as const;

  for (const { subType, playerName, candidates } of playerBets) {
    const candidate = candidates.find((c) => c.playerName === playerName)!;
    const frozenPlayerOdds = await snapshotOddsForBetType(tournament.id, "TOURNAMENT", subType);

    const bt = await db.betType.create({
      data: {
        tournamentId: tournament.id, category: "TOURNAMENT", subType, name: subType,
        status: "OPEN", frozenOdds: frozenPlayerOdds,
      },
    });

    // UI potential: potentialPoints(subType, candidate.odds)
    const potential = uiPotential(subType, candidate.odds);

    const bet = await db.bet.create({
      data: {
        betTypeId: bt.id, userId: user.id, tournamentId: tournament.id,
        prediction: { playerName, teamCode: candidate.teamCode, odds: candidate.odds } as unknown as Prisma.InputJsonValue,
      },
    });

    await db.betType.update({
      where: { id: bt.id },
      data: { status: "RESOLVED", resolution: { playerName } as unknown as Prisma.InputJsonValue, resolvedAt: new Date() },
    });

    await scoreBets(group.id, tournament.id, null, bt.id);
    const scored = await db.bet.findUnique({ where: { id: bet.id } });
    assertExact(`${subType} (${playerName}) totalPoints`, scored?.totalPoints ?? 0, potential);
  }

  // ── Test 4: Per-game match_winner ──
  console.log("\n── 4. Per-game match_winner ──");
  {
    const mwBt = await db.betType.create({
      data: {
        tournamentId: tournament.id, category: "PER_GAME", subType: "match_winner", name: "Match Result",
        status: "OPEN",
      },
    });

    const matches = await db.match.findMany({
      where: { tournamentId: tournament.id },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "asc" },
    });

    for (const match of matches) {
      const homeOdds = (match.homeTeam.odds as { winnerOdds: number }).winnerOdds;
      const awayOdds = (match.awayTeam.odds as { winnerOdds: number }).winnerOdds;

      // UI derives odds same way
      const derived = deriveMatchOdds(homeOdds, awayOdds);

      // We'll bet "home" and set the result to home win to guarantee correctness
      const outcome = "home";
      const potential = uiPotential("match_winner", match.oddsData
        ? ((match.oddsData as { homeWin?: number }).homeWin ?? derived.homeWin)
        : derived.homeWin);

      // Place bet
      const bet = await db.bet.create({
        data: {
          betTypeId: mwBt.id, matchId: match.id, userId: user.id, tournamentId: tournament.id,
          prediction: { outcome } as unknown as Prisma.InputJsonValue,
        },
      });

      // Complete match with home win (2-1)
      await db.match.update({
        where: { id: match.id },
        data: { actualHomeScore: 2, actualAwayScore: 1, status: "COMPLETED" },
      });

      // Score
      await scoreBets(group.id, tournament.id, match.id);

      const scored = await db.bet.findUnique({ where: { id: bet.id } });
      assertExact(
        `match_winner home (${match.homeTeam.code} v ${match.awayTeam.code})`,
        scored?.totalPoints ?? 0, potential
      );
    }
  }

  // ── Test 5: Per-game correct_score ──
  console.log("\n── 5. Per-game correct_score ──");
  {
    const csBt = await db.betType.create({
      data: {
        tournamentId: tournament.id, category: "PER_GAME", subType: "correct_score", name: "Correct Score",
        status: "OPEN",
      },
    });

    // Reset matches to UPCOMING for correct_score testing
    const matches = await db.match.findMany({
      where: { tournamentId: tournament.id },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "asc" },
    });

    for (const match of matches) {
      // Reset match
      await db.match.update({ where: { id: match.id }, data: { actualHomeScore: null, actualAwayScore: null, status: "UPCOMING" } });

      const homeOdds = (match.homeTeam.odds as { winnerOdds: number }).winnerOdds;
      const awayOdds = (match.awayTeam.odds as { winnerOdds: number }).winnerOdds;

      // We'll predict 2-1 and set actual to 2-1
      const scoreKey = "2-1";
      const storedScoreOdds = (match.oddsData as { correctScores?: Record<string, number> } | null)?.correctScores;
      const derivedOdds = deriveScoreOdds(homeOdds, awayOdds);
      const scoreOdds = storedScoreOdds?.[scoreKey] ?? derivedOdds[scoreKey] ?? 1500;

      const potential = uiPotential("correct_score", scoreOdds);

      const bet = await db.bet.create({
        data: {
          betTypeId: csBt.id, matchId: match.id, userId: user.id, tournamentId: tournament.id,
          prediction: { homeScore: 2, awayScore: 1 } as unknown as Prisma.InputJsonValue,
        },
      });

      await db.match.update({
        where: { id: match.id },
        data: { actualHomeScore: 2, actualAwayScore: 1, status: "COMPLETED" },
      });

      await scoreBets(group.id, tournament.id, match.id);

      const scored = await db.bet.findUnique({ where: { id: bet.id } });
      assertExact(
        `correct_score 2-1 (${match.homeTeam.code} v ${match.awayTeam.code})`,
        scored?.totalPoints ?? 0, potential
      );
    }
  }

  // ── Test 6: Group predictions per-slot ──
  console.log("\n── 6. Group predictions per-slot ──");
  {
    const bt = await db.betType.create({
      data: {
        tournamentId: tournament.id, category: "TOURNAMENT", subType: "group_predictions", name: "Group Predictions",
        status: "OPEN", frozenOdds: frozenOdds,
      },
    });

    const frozenTeams = (frozenOdds as { teams?: Record<string, { groupWinnerOdds?: number; qualifyOdds?: number }> })?.teams ?? {};
    const WINNER_GROUPS = 12;
    const QUALIFIER_SLOTS = 20;

    // Pick winner = best team per group, qualifier = second best
    // For simplicity, test just Group A
    const groupATeams = WC2026_TEAMS.filter(t => t.groupLetter === "A").sort((a, b) => a.odds.winnerOdds - b.odds.winnerOdds);
    const winnerCode = groupATeams[0].code; // CZE (lowest winnerOdds in group A)
    const qualifierCode = groupATeams[1].code;

    // Compute UI potential for the winner pick
    const winnerOdds = frozenTeams[winnerCode]?.groupWinnerOdds ?? groupATeams[0].odds.groupWinnerOdds;
    const uiWinnerPotential = parseFloat((uiPotential("group_predictions", winnerOdds) * 0.6 / WINNER_GROUPS).toFixed(1));
    // Compute UI potential for the qualifier pick
    const qualOdds = frozenTeams[qualifierCode]?.qualifyOdds ?? groupATeams[1].odds.qualifyOdds;
    const uiQualPotential = parseFloat((uiPotential("group_predictions", qualOdds) * 0.4 / QUALIFIER_SLOTS).toFixed(1));

    const totalUiPotential = parseFloat((uiWinnerPotential + uiQualPotential).toFixed(1));

    // Place bet: just group A with winner + 1 qualifier
    const prediction: Record<string, string[]> = {
      A: [winnerCode, qualifierCode],
    };

    const bet = await db.bet.create({
      data: {
        betTypeId: bt.id, userId: user.id, tournamentId: tournament.id,
        prediction: prediction as unknown as Prisma.InputJsonValue,
      },
    });

    // Resolve: our picks are correct
    await db.betType.update({
      where: { id: bt.id },
      data: {
        status: "RESOLVED",
        resolution: {
          winners: { A: winnerCode },
          advancing: [winnerCode, qualifierCode],
        } as unknown as Prisma.InputJsonValue,
        resolvedAt: new Date(),
      },
    });

    await scoreBets(group.id, tournament.id, null, bt.id);
    const scored = await db.bet.findUnique({ where: { id: bet.id } });
    assertExact("group_predictions (1 winner + 1 qualifier)", scored?.totalPoints ?? 0, totalUiPotential);
  }

  // ── Test 7: Bracket per-pick ──
  console.log("\n── 7. Bracket per-pick ──");
  {
    const bt = await db.betType.create({
      data: {
        tournamentId: tournament.id, category: "TOURNAMENT", subType: "bracket", name: "Bracket",
        status: "OPEN", frozenOdds: frozenOdds,
      },
    });

    const frozenTeams = (frozenOdds as { teams?: Record<string, { winnerOdds?: number }> })?.teams ?? {};

    // Test 3 picks: R32-0 (FRA), R16-0 (BRA), QF-0 (ESP)
    const picks: Record<string, string> = {
      "R32-0": "FRA",
      "R16-0": "BRA",
      "QF-0": "ESP",
    };

    // UI potential per pick
    let expectedTotal = 0;
    for (const [slot, code] of Object.entries(picks)) {
      const phase = slot.split("-")[0];
      const winnerOdds = frozenTeams[code]?.winnerOdds ?? (teamByCode[code].odds as { winnerOdds: number }).winnerOdds;
      const pickPotential = bracketPickPotential(phase, winnerOdds, settings, totalPool, Math.max(memberCount, 1));
      expectedTotal += pickPotential;
    }
    expectedTotal = parseFloat(expectedTotal.toFixed(1));

    const bet = await db.bet.create({
      data: {
        betTypeId: bt.id, userId: user.id, tournamentId: tournament.id,
        prediction: { picks } as unknown as Prisma.InputJsonValue,
      },
    });

    // Resolve: all 3 picks are correct
    await db.betType.update({
      where: { id: bt.id },
      data: {
        status: "RESOLVED",
        resolution: { winners: picks } as unknown as Prisma.InputJsonValue,
        resolvedAt: new Date(),
      },
    });

    await scoreBets(group.id, tournament.id, null, bt.id);
    const scored = await db.bet.findUnique({ where: { id: bet.id } });
    assertExact("bracket (3 picks: R32+R16+QF)", scored?.totalPoints ?? 0, expectedTotal);
  }

  // ── Test 8: Semifinalists per-pick ──
  console.log("\n── 8. Semifinalists per-pick ──");
  {
    const bt = await db.betType.create({
      data: {
        tournamentId: tournament.id, category: "TOURNAMENT", subType: "semifinalists", name: "Semifinalists",
        status: "OPEN", frozenOdds: frozenOdds,
      },
    });

    const frozenTeams = (frozenOdds as { teams?: Record<string, { winnerOdds?: number }> })?.teams ?? {};

    const sfPicks = ["FRA", "BRA", "ESP", "ENG"];

    // UI potential: sum of (potentialPoints("semifinalists", winnerOdds) / 4) per pick
    let expectedTotal = 0;
    for (const code of sfPicks) {
      const winnerOdds = frozenTeams[code]?.winnerOdds ?? (teamByCode[code].odds as { winnerOdds: number }).winnerOdds;
      expectedTotal += parseFloat((uiPotential("semifinalists", winnerOdds) / 4).toFixed(1));
    }
    expectedTotal = parseFloat(expectedTotal.toFixed(1));

    const bet = await db.bet.create({
      data: {
        betTypeId: bt.id, userId: user.id, tournamentId: tournament.id,
        prediction: { teams: sfPicks } as unknown as Prisma.InputJsonValue,
      },
    });

    // Resolve: all 4 picks correct
    await db.betType.update({
      where: { id: bt.id },
      data: {
        status: "RESOLVED",
        resolution: { teams: sfPicks } as unknown as Prisma.InputJsonValue,
        resolvedAt: new Date(),
      },
    });

    await scoreBets(group.id, tournament.id, null, bt.id);
    const scored = await db.bet.findUnique({ where: { id: bet.id } });
    assertExact("semifinalists (4/4 correct)", scored?.totalPoints ?? 0, expectedTotal);
  }

  // ── Summary ──
  console.log(`\n═══ Results: ${passes} passed, ${fails} failed ═══`);

  // ── Cleanup ──
  console.log("\n── Cleanup ──");
  await db.bet.deleteMany({ where: { tournamentId: tournament.id } });
  await db.match.deleteMany({ where: { tournamentId: tournament.id } });
  await db.betType.deleteMany({ where: { tournamentId: tournament.id } });
  await db.team.deleteMany({ where: { tournamentId: tournament.id } });
  await db.tournament.deleteMany({ where: { id: tournament.id } });
  await db.groupMembership.deleteMany({ where: { groupId: group.id } });
  await db.group.delete({ where: { id: group.id } });
  console.log("  Cleaned up");

  process.exit(fails > 0 ? 1 : 0);
}

main()
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(2);
  })
  .finally(() => db.$disconnect());
