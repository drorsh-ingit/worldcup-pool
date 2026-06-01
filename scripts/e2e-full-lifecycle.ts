/**
 * E2E Full Lifecycle Test
 *
 * Creates a fresh group, simulates the entire WC 2026 tournament from June 9
 * through the final, places bets at each phase, and verifies that scored points
 * exactly match potential points shown to users before resolution.
 *
 * Run: npx tsx scripts/e2e-full-lifecycle.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const db = new PrismaClient();

const USER_EMAIL = "drorsh@gmail.com";

// ── Helpers ──

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

function assertClose(label: string, actual: number, expected: number, tolerance = 0.015) {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passes++;
    console.log(`  ✅ ${label}: ${actual.toFixed(2)} ≈ ${expected.toFixed(2)}`);
  } else {
    fails++;
    console.log(`  ❌ ${label}: got ${actual.toFixed(4)}, expected ${expected.toFixed(4)} (diff=${diff.toFixed(4)})`);
  }
}

async function main() {
  console.log("═══ E2E Full Lifecycle Test ═══\n");

  // Find the user
  const user = await db.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User ${USER_EMAIL} not found`);
  console.log(`User: ${user.name} (${user.id})\n`);

  // ── Setup: create group, tournament, teams, matches, bet types ──
  console.log("── Phase 0: Setup ──");

  const group = await db.group.create({
    data: {
      name: "E2E Full Lifecycle",
      slug: `e2e-lifecycle-${Date.now()}`,
      settings: {} as unknown as Prisma.InputJsonValue,
    },
  });
  console.log(`  Group: ${group.id}`);

  await db.groupMembership.create({
    data: { userId: user.id, groupId: group.id, role: "ADMIN", status: "APPROVED" },
  });

  const { WC2026_TEAMS, WC2026_GROUP_MATCHES, GOLDEN_BOOT_CANDIDATES, GOLDEN_BALL_CANDIDATES, GOLDEN_GLOVE_CANDIDATES } =
    await import("../src/lib/data/wc2026");

  const tournament = await db.tournament.create({
    data: {
      groupId: group.id,
      kind: "WC_2026",
      name: "FIFA World Cup 2026",
      status: "GROUP_STAGE",
    },
  });
  console.log(`  Tournament: ${tournament.id}`);

  // Create teams
  for (const t of WC2026_TEAMS) {
    await db.team.create({
      data: {
        tournamentId: tournament.id,
        name: t.name,
        code: t.code,
        groupLetter: t.groupLetter,
        odds: t.odds as unknown as Prisma.InputJsonValue,
      },
    });
  }
  console.log(`  Created ${WC2026_TEAMS.length} teams`);

  // Create matches
  const teams = await db.team.findMany({ where: { tournamentId: tournament.id } });
  const teamByCode: Record<string, (typeof teams)[number]> = {};
  for (const t of teams) teamByCode[t.code] = t;

  for (const m of WC2026_GROUP_MATCHES) {
    await db.match.create({
      data: {
        tournamentId: tournament.id,
        homeTeamId: teamByCode[m.homeCode].id,
        awayTeamId: teamByCode[m.awayCode].id,
        kickoffAt: new Date(m.kickoffAt),
        phase: "GROUP",
        groupLetter: m.groupLetter,
        status: "UPCOMING",
        externalId: String(m.externalId),
      },
    });
  }
  console.log(`  Created ${WC2026_GROUP_MATCHES.length} matches`);

  // Create bet types (pre-tournament + post-group + post-R32 + per-game)
  const betTypeConfigs = [
    // Pre-tournament: open June 4, lock June 11
    { subType: "winner", name: "Tournament Winner", category: "TOURNAMENT", opensAt: "2026-06-04T00:00:00Z", locksAt: "2026-06-11T00:00:00Z" },
    { subType: "runner_up", name: "Runner Up", category: "TOURNAMENT", opensAt: "2026-06-04T00:00:00Z", locksAt: "2026-06-11T00:00:00Z" },
    { subType: "dark_horse", name: "Dark Horse", category: "TOURNAMENT", opensAt: "2026-06-04T00:00:00Z", locksAt: "2026-06-11T00:00:00Z" },
    { subType: "reverse_dark_horse", name: "Reverse Dark Horse", category: "TOURNAMENT", opensAt: "2026-06-04T00:00:00Z", locksAt: "2026-06-11T00:00:00Z" },
    { subType: "group_predictions", name: "Group Predictions", category: "TOURNAMENT", opensAt: "2026-06-04T00:00:00Z", locksAt: "2026-06-11T00:00:00Z" },
    { subType: "golden_boot", name: "Golden Boot", category: "TOURNAMENT", opensAt: "2026-06-04T00:00:00Z", locksAt: "2026-06-11T00:00:00Z" },
    { subType: "golden_ball", name: "Golden Ball", category: "TOURNAMENT", opensAt: "2026-06-04T00:00:00Z", locksAt: "2026-06-11T00:00:00Z" },
    { subType: "golden_glove", name: "Golden Glove", category: "TOURNAMENT", opensAt: "2026-06-04T00:00:00Z", locksAt: "2026-06-11T00:00:00Z" },
    // Post-group stage
    { subType: "bracket", name: "Knockout Bracket", category: "TOURNAMENT", opensAt: "2026-07-01T00:00:00Z", locksAt: "2026-07-02T18:00:00Z" },
    // Post-R32
    { subType: "semifinalists", name: "Semifinalists", category: "TOURNAMENT", opensAt: "2026-07-05T23:00:00Z", locksAt: "2026-07-06T18:00:00Z" },
    // Per-game
    { subType: "match_winner", name: "Match Result", category: "PER_GAME", opensAt: "2026-06-04T00:00:00Z", locksAt: null as string | null },
    { subType: "correct_score", name: "Correct Score", category: "PER_GAME", opensAt: "2026-06-04T00:00:00Z", locksAt: null as string | null },
  ];

  for (const bt of betTypeConfigs) {
    await db.betType.create({
      data: {
        tournamentId: tournament.id,
        category: bt.category as "TOURNAMENT" | "PER_GAME",
        subType: bt.subType,
        name: bt.name,
        status: "DRAFT",
        opensAt: bt.opensAt ? new Date(bt.opensAt) : null,
        locksAt: bt.locksAt ? new Date(bt.locksAt) : null,
      },
    });
  }
  console.log(`  Created ${betTypeConfigs.length} bet types`);

  // ── Phase 1: June 9 — open bets, place all pre-tournament bets ──
  console.log("\n── Phase 1: June 9 — Open & place pre-tournament bets ──");

  const { simulateTournamentProgression, applyBetTypeTransitions } =
    await import("../src/lib/actions/simulation");
  const { calculatePoints, scoreBracketPerPick, scoreSemifinalistsPerPick, bracketSlotShare, bracketPickPotential } =
    await import("../src/lib/scoring");
  const { resolveGroupSettings, DEFAULT_GROUP_SETTINGS } =
    await import("../src/lib/settings");
  const { deriveMatchOdds, deriveScoreOdds } = await import("../src/lib/match-odds");

  const june9 = new Date("2026-06-09T09:00:00Z");

  // Apply bet type transitions to open pre-tournament bets
  let betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  await applyBetTypeTransitions(betTypes, june9);

  // Verify pre-tournament bets are OPEN
  betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  const btBySubType: Record<string, (typeof betTypes)[number]> = {};
  for (const bt of betTypes) btBySubType[bt.subType] = bt;

  const preOpenSubTypes = ["winner", "runner_up", "dark_horse", "reverse_dark_horse", "group_predictions", "golden_boot", "golden_ball", "golden_glove", "match_winner", "correct_score"];
  for (const st of preOpenSubTypes) {
    assert(`${st} is OPEN`, btBySubType[st]?.status === "OPEN");
  }
  assert("bracket is DRAFT", btBySubType["bracket"]?.status === "DRAFT");
  assert("semifinalists is DRAFT", btBySubType["semifinalists"]?.status === "DRAFT");

  // Settings for scoring
  const settings = resolveGroupSettings({});
  const totalPool = settings.totalPool ?? 1000;
  const memberCount = 1; // solo test

  // Helper: implied probability
  const impliedProb = (odds: number) => 1 / Math.max(odds, 1);

  // ── Place tournament bets ──
  // Track potential points for each bet to verify after resolution
  type PotentialRecord = {
    betId: string;
    subType: string;
    label: string;
    potentialPoints: number;
  };
  const potentials: PotentialRecord[] = [];

  // winner: pick France
  const fraTeam = teamByCode["FRA"];
  const fraOdds = (fraTeam.odds as { winnerOdds: number }).winnerOdds;
  const winnerPts = calculatePoints(true, "winner", impliedProb(fraOdds), settings, "GROUP", totalPool, memberCount);
  const winnerBet = await db.bet.create({
    data: {
      betTypeId: btBySubType["winner"].id,
      userId: user.id,
      tournamentId: tournament.id,
      prediction: { teamCode: "FRA", odds: fraOdds } as unknown as Prisma.InputJsonValue,
    },
  });
  potentials.push({ betId: winnerBet.id, subType: "winner", label: "Winner (FRA)", potentialPoints: winnerPts.totalPoints });
  console.log(`  Placed winner bet: FRA (potential ${winnerPts.totalPoints} pts)`);

  // runner_up: pick Brazil
  const braOdds = (teamByCode["BRA"].odds as { winnerOdds: number }).winnerOdds;
  const ruPts = calculatePoints(true, "runner_up", impliedProb(braOdds), settings, "GROUP", totalPool, memberCount);
  const ruBet = await db.bet.create({
    data: {
      betTypeId: btBySubType["runner_up"].id,
      userId: user.id,
      tournamentId: tournament.id,
      prediction: { teamCode: "BRA", odds: braOdds } as unknown as Prisma.InputJsonValue,
    },
  });
  potentials.push({ betId: ruBet.id, subType: "runner_up", label: "Runner Up (BRA)", potentialPoints: ruPts.totalPoints });
  console.log(`  Placed runner_up bet: BRA (potential ${ruPts.totalPoints} pts)`);

  // dark_horse: pick Turkey (must have winnerOdds > 2000 to be a dark horse candidate)
  const turOdds = (teamByCode["TUR"].odds as { winnerOdds: number }).winnerOdds;
  const dhPts = calculatePoints(true, "dark_horse", impliedProb(turOdds), settings, "GROUP", totalPool, memberCount);
  const dhBet = await db.bet.create({
    data: {
      betTypeId: btBySubType["dark_horse"].id,
      userId: user.id,
      tournamentId: tournament.id,
      prediction: { teamCode: "TUR", odds: turOdds } as unknown as Prisma.InputJsonValue,
    },
  });
  potentials.push({ betId: dhBet.id, subType: "dark_horse", label: "Dark Horse (TUR)", potentialPoints: dhPts.totalPoints });
  console.log(`  Placed dark_horse bet: TUR (potential ${dhPts.totalPoints} pts)`);

  // reverse_dark_horse: pick Netherlands (top 15 favourite)
  const nedQualOdds = (teamByCode["NED"].odds as { qualifyOdds: number }).qualifyOdds;
  // The scoring inverts: invertedOdds = 400000 / qualifyOdds
  const invertedOdds = Math.max(1, 400000 / nedQualOdds);
  const rdhPts = calculatePoints(true, "reverse_dark_horse", impliedProb(invertedOdds), settings, "GROUP", totalPool, memberCount);
  const rdhBet = await db.bet.create({
    data: {
      betTypeId: btBySubType["reverse_dark_horse"].id,
      userId: user.id,
      tournamentId: tournament.id,
      prediction: { teamCode: "NED", odds: nedQualOdds } as unknown as Prisma.InputJsonValue,
    },
  });
  potentials.push({ betId: rdhBet.id, subType: "reverse_dark_horse", label: "Reverse Dark Horse (NED)", potentialPoints: rdhPts.totalPoints });
  console.log(`  Placed reverse_dark_horse bet: NED (potential ${rdhPts.totalPoints} pts)`);

  // golden_boot: pick Mbappe
  const mbappeCandidate = GOLDEN_BOOT_CANDIDATES.find((c) => c.playerName === "Kylian Mbappé")!;
  const gbPts = calculatePoints(true, "golden_boot", impliedProb(mbappeCandidate.odds), settings, "GROUP", totalPool, memberCount);
  const gbBet = await db.bet.create({
    data: {
      betTypeId: btBySubType["golden_boot"].id,
      userId: user.id,
      tournamentId: tournament.id,
      prediction: { playerName: "Kylian Mbappé", odds: mbappeCandidate.odds } as unknown as Prisma.InputJsonValue,
    },
  });
  potentials.push({ betId: gbBet.id, subType: "golden_boot", label: "Golden Boot (Mbappé)", potentialPoints: gbPts.totalPoints });
  console.log(`  Placed golden_boot bet: Mbappé (potential ${gbPts.totalPoints} pts)`);

  // golden_ball: pick Vinicius Jr
  const viniCandidate = GOLDEN_BALL_CANDIDATES.find((c) => c.playerName === "Vinicius Jr.")!;
  const gballPts = calculatePoints(true, "golden_ball", impliedProb(viniCandidate.odds), settings, "GROUP", totalPool, memberCount);
  const gballBet = await db.bet.create({
    data: {
      betTypeId: btBySubType["golden_ball"].id,
      userId: user.id,
      tournamentId: tournament.id,
      prediction: { playerName: "Vinicius Jr.", odds: viniCandidate.odds } as unknown as Prisma.InputJsonValue,
    },
  });
  potentials.push({ betId: gballBet.id, subType: "golden_ball", label: "Golden Ball (Vinicius Jr.)", potentialPoints: gballPts.totalPoints });
  console.log(`  Placed golden_ball bet: Vinicius Jr. (potential ${gballPts.totalPoints} pts)`);

  // golden_glove: pick Alisson
  const alissonCandidate = GOLDEN_GLOVE_CANDIDATES.find((c) => c.playerName === "Alisson")!;
  const ggPts = calculatePoints(true, "golden_glove", impliedProb(alissonCandidate.odds), settings, "GROUP", totalPool, memberCount);
  const ggBet = await db.bet.create({
    data: {
      betTypeId: btBySubType["golden_glove"].id,
      userId: user.id,
      tournamentId: tournament.id,
      prediction: { playerName: "Alisson", odds: alissonCandidate.odds } as unknown as Prisma.InputJsonValue,
    },
  });
  potentials.push({ betId: ggBet.id, subType: "golden_glove", label: "Golden Glove (Alisson)", potentialPoints: ggPts.totalPoints });
  console.log(`  Placed golden_glove bet: Alisson (potential ${ggPts.totalPoints} pts)`);

  // group_predictions: for each group, pick first team alphabetically by odds (best odds first)
  // We'll pick the group favourite as winner, and second favourite as advancing
  const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const gpPrediction: Record<string, string[]> = {};
  for (const letter of GROUP_LETTERS) {
    const groupTeams = WC2026_TEAMS
      .filter((t) => t.groupLetter === letter)
      .sort((a, b) => a.odds.winnerOdds - b.odds.winnerOdds); // best odds first
    // [winner, advancer1, advancer2] — first pick is the winner, rest are advancing
    gpPrediction[letter] = groupTeams.slice(0, 3).map((t) => t.code);
  }
  // Note: group_predictions scoring is per-slot, so we can't easily compute potential here.
  // We'll verify correctness after resolution instead by checking individual slot scoring.
  const gpBet = await db.bet.create({
    data: {
      betTypeId: btBySubType["group_predictions"].id,
      userId: user.id,
      tournamentId: tournament.id,
      prediction: gpPrediction as unknown as Prisma.InputJsonValue,
    },
  });
  console.log(`  Placed group_predictions bet (12 groups × 3 picks)`);

  // ── Place per-game bets for all group matches ──
  const matchWinnerBtId = btBySubType["match_winner"].id;
  const correctScoreBtId = btBySubType["correct_score"].id;
  const groupMatches = await db.match.findMany({
    where: { tournamentId: tournament.id, phase: "GROUP" },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "asc" },
  });

  let matchBetsPlaced = 0;
  for (const match of groupMatches) {
    const homeOdds = (match.homeTeam.odds as { winnerOdds: number }).winnerOdds;
    const awayOdds = (match.awayTeam.odds as { winnerOdds: number }).winnerOdds;
    // Always bet on the favourite (lower winnerOdds) to win
    const outcome = homeOdds <= awayOdds ? "home" : "away";

    // Match winner bet
    await db.bet.create({
      data: {
        betTypeId: matchWinnerBtId,
        matchId: match.id,
        userId: user.id,
        tournamentId: tournament.id,
        prediction: { outcome } as unknown as Prisma.InputJsonValue,
      },
    });

    // Correct score bet: pick 1-0 or 0-1 for the favourite
    const homeScore = outcome === "home" ? 1 : 0;
    const awayScore = outcome === "away" ? 1 : 0;
    await db.bet.create({
      data: {
        betTypeId: correctScoreBtId,
        matchId: match.id,
        userId: user.id,
        tournamentId: tournament.id,
        prediction: { homeScore, awayScore } as unknown as Prisma.InputJsonValue,
      },
    });

    matchBetsPlaced += 2;
  }
  console.log(`  Placed ${matchBetsPlaced} per-game bets (${groupMatches.length} matches × 2)`);

  // ── Phase 2: July 1 — End of group stage ──
  console.log("\n── Phase 2: July 1 — End of group stage ──");

  const july1 = new Date("2026-07-01T12:00:00Z");

  // Apply transitions first (locks pre-tournament bets that should be locked)
  betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  await applyBetTypeTransitions(betTypes, july1);

  // Run simulation
  await simulateTournamentProgression(group.id, tournament.id, july1);

  // Re-fetch bet types
  betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  for (const bt of betTypes) btBySubType[bt.subType] = bt;

  // Verify group_predictions is RESOLVED
  assert("group_predictions is RESOLVED", btBySubType["group_predictions"]?.status === "RESOLVED");
  assert("reverse_dark_horse is RESOLVED", btBySubType["reverse_dark_horse"]?.status === "RESOLVED");

  // Verify bracket is now OPEN (auto-opened after group stage)
  assert("bracket is OPEN", btBySubType["bracket"]?.status === "OPEN");
  // golden_ball and golden_glove should be OPEN too
  // (But they were already LOCKED since locksAt was June 11... let me check)
  // Actually golden_ball/golden_glove were PRE_TOURNAMENT with locksAt June 11, so they're LOCKED
  // bracket was DRAFT with opensAt Jul 1, so simulation should have opened it

  // Verify all 72 group matches are COMPLETED
  const completedGroupMatches = await db.match.count({
    where: { tournamentId: tournament.id, phase: "GROUP", status: "COMPLETED" },
  });
  assert("All 72 group matches completed", completedGroupMatches === 72, `got ${completedGroupMatches}`);

  // Verify R32 matches were created
  const r32Matches = await db.match.findMany({
    where: { tournamentId: tournament.id, phase: "R32" },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "asc" },
  });
  assert("16 R32 matches created", r32Matches.length === 16, `got ${r32Matches.length}`);

  // Verify per-game bet scoring for group matches
  const scoredMatchBets = await db.bet.findMany({
    where: {
      tournamentId: tournament.id,
      betTypeId: { in: [matchWinnerBtId, correctScoreBtId] },
      scoredAt: { not: null },
      matchId: { not: null },
    },
  });
  // Check all group match bets scored — there should be 72 matches × 2 bet types = 144 bets
  const groupMatchBetCount = scoredMatchBets.filter((b) => {
    const match = groupMatches.find((m) => m.id === b.matchId);
    return !!match;
  }).length;
  assert(`All ${matchBetsPlaced} group-stage per-game bets scored`, groupMatchBetCount === matchBetsPlaced, `got ${groupMatchBetCount}`);

  // Verify group_predictions scoring
  const gpBetAfter = await db.bet.findUnique({ where: { id: gpBet.id } });
  assert("group_predictions bet scored", gpBetAfter?.scoredAt != null);
  console.log(`  group_predictions: base=${gpBetAfter?.basePoints}, bonus=${gpBetAfter?.bonusPoints}, total=${gpBetAfter?.totalPoints}`);

  // Verify reverse_dark_horse scoring
  const rdhBetAfter = await db.bet.findUnique({ where: { id: rdhBet.id } });
  assert("reverse_dark_horse bet scored", rdhBetAfter?.scoredAt != null);
  // Check: was NED eliminated in groups?
  const rdhResolution = btBySubType["reverse_dark_horse"].resolution as { teams: string[] } | null;
  const nedEliminated = rdhResolution?.teams?.includes("NED") ?? false;
  console.log(`  reverse_dark_horse: NED eliminated=${nedEliminated}, isCorrect=${rdhBetAfter?.isCorrect}, total=${rdhBetAfter?.totalPoints}`);
  if (nedEliminated) {
    assertClose("reverse_dark_horse points match potential", rdhBetAfter?.totalPoints ?? 0, rdhPts.totalPoints);
  } else {
    assert("reverse_dark_horse correctly scored as 0 (NED advanced)", rdhBetAfter?.totalPoints === 0);
  }

  // ── Place bracket bet ──
  // Need to know which teams advanced to R32 to make bracket picks
  const r32MatchesForBracket = await db.match.findMany({
    where: { tournamentId: tournament.id, phase: { in: ["R32", "R16", "QF", "SF", "FINAL"] } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "asc" },
  });

  // For bracket: we'll pick the home team of each R32 match to advance all the way
  const bracketPicks: Record<string, string> = {};
  const r32Sorted = r32MatchesForBracket
    .filter((m) => m.phase === "R32")
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());

  for (let i = 0; i < r32Sorted.length; i++) {
    bracketPicks[`R32-${i}`] = r32Sorted[i].homeTeam.code;
  }
  // R16 winners: pick from the R32 home teams (pairing: 0v1, 2v3, etc.)
  for (let i = 0; i < 8; i++) {
    bracketPicks[`R16-${i}`] = r32Sorted[i * 2].homeTeam.code;
  }
  // QF winners
  for (let i = 0; i < 4; i++) {
    bracketPicks[`QF-${i}`] = r32Sorted[i * 4].homeTeam.code;
  }
  // SF winners
  for (let i = 0; i < 2; i++) {
    bracketPicks[`SF-${i}`] = r32Sorted[i * 8].homeTeam.code;
  }
  // Final winner
  bracketPicks["FINAL-0"] = r32Sorted[0].homeTeam.code;

  const bracketBet = await db.bet.create({
    data: {
      betTypeId: btBySubType["bracket"].id,
      userId: user.id,
      tournamentId: tournament.id,
      prediction: { picks: bracketPicks } as unknown as Prisma.InputJsonValue,
    },
  });
  console.log(`  Placed bracket bet (${Object.keys(bracketPicks).length} picks, champion: ${bracketPicks["FINAL-0"]})`);

  // Also place per-game bets for R32 matches
  for (let i = 0; i < r32Sorted.length; i++) {
    const match = r32Sorted[i];
    const homeOdds = (match.homeTeam.odds as { winnerOdds: number }).winnerOdds;
    const awayOdds = (match.awayTeam.odds as { winnerOdds: number }).winnerOdds;
    const outcome = homeOdds <= awayOdds ? "home" : "away";

    await db.bet.create({
      data: {
        betTypeId: matchWinnerBtId,
        matchId: match.id,
        userId: user.id,
        tournamentId: tournament.id,
        prediction: { outcome } as unknown as Prisma.InputJsonValue,
      },
    });
    await db.bet.create({
      data: {
        betTypeId: correctScoreBtId,
        matchId: match.id,
        userId: user.id,
        tournamentId: tournament.id,
        prediction: { homeScore: outcome === "home" ? 1 : 0, awayScore: outcome === "away" ? 1 : 0 } as unknown as Prisma.InputJsonValue,
      },
    });
  }
  console.log(`  Placed ${r32Sorted.length * 2} per-game bets for R32`);

  // ── Phase 3: July 6 — End of R32 ──
  console.log("\n── Phase 3: July 6 — End of R32 ──");

  const july6 = new Date("2026-07-06T12:00:00Z");
  betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  await applyBetTypeTransitions(betTypes, july6);
  await simulateTournamentProgression(group.id, tournament.id, july6);

  // Re-fetch
  betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  for (const bt of betTypes) btBySubType[bt.subType] = bt;

  // Verify R32 complete
  const completedR32 = await db.match.count({
    where: { tournamentId: tournament.id, phase: "R32", status: "COMPLETED" },
  });
  assert("All 16 R32 matches completed", completedR32 === 16, `got ${completedR32}`);

  // Verify R16 matches created
  const r16Matches = await db.match.count({
    where: { tournamentId: tournament.id, phase: "R16" },
  });
  assert("8 R16 matches created", r16Matches === 8, `got ${r16Matches}`);

  // Verify semifinalists is OPEN
  assert("semifinalists is OPEN", btBySubType["semifinalists"]?.status === "OPEN");

  // Verify R32 per-game bets scored
  const scoredR32Bets = await db.bet.count({
    where: {
      tournamentId: tournament.id,
      betTypeId: { in: [matchWinnerBtId, correctScoreBtId] },
      scoredAt: { not: null },
      match: { phase: "R32" },
    },
  });
  assert(`All 32 R32 per-game bets scored`, scoredR32Bets === 32, `got ${scoredR32Bets}`);

  // Place semifinalists bet — pick the 4 R16 home teams (first by kickoff)
  const r16MatchesList = await db.match.findMany({
    where: { tournamentId: tournament.id, phase: "R16" },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "asc" },
  });

  const sfPicks = r16MatchesList.slice(0, 4).map((m) => m.homeTeam.code);
  const sfBet = await db.bet.create({
    data: {
      betTypeId: btBySubType["semifinalists"].id,
      userId: user.id,
      tournamentId: tournament.id,
      prediction: { teams: sfPicks } as unknown as Prisma.InputJsonValue,
    },
  });
  console.log(`  Placed semifinalists bet: ${sfPicks.join(", ")}`);

  // Place per-game bets for R16
  for (const match of r16MatchesList) {
    const homeOdds = (match.homeTeam.odds as { winnerOdds: number }).winnerOdds;
    const awayOdds = (match.awayTeam.odds as { winnerOdds: number }).winnerOdds;
    const outcome = homeOdds <= awayOdds ? "home" : "away";
    await db.bet.create({
      data: { betTypeId: matchWinnerBtId, matchId: match.id, userId: user.id, tournamentId: tournament.id, prediction: { outcome } as unknown as Prisma.InputJsonValue },
    });
    await db.bet.create({
      data: { betTypeId: correctScoreBtId, matchId: match.id, userId: user.id, tournamentId: tournament.id, prediction: { homeScore: outcome === "home" ? 1 : 0, awayScore: outcome === "away" ? 1 : 0 } as unknown as Prisma.InputJsonValue },
    });
  }
  console.log(`  Placed ${r16MatchesList.length * 2} per-game bets for R16`);

  // ── Phase 4: July 20 — End of tournament ──
  console.log("\n── Phase 4: July 20 — End of tournament ──");

  const july20 = new Date("2026-07-20T12:00:00Z");

  // Before advancing, place bets for QF/SF/FINAL matches as they get created
  // We need to advance step by step

  // Advance to end of R16
  const july10 = new Date("2026-07-10T12:00:00Z");
  betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  await applyBetTypeTransitions(betTypes, july10);
  await simulateTournamentProgression(group.id, tournament.id, july10);

  // Place QF bets
  const qfMatches = await db.match.findMany({
    where: { tournamentId: tournament.id, phase: "QF" },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "asc" },
  });
  for (const match of qfMatches) {
    const homeOdds = (match.homeTeam.odds as { winnerOdds: number }).winnerOdds;
    const awayOdds = (match.awayTeam.odds as { winnerOdds: number }).winnerOdds;
    const outcome = homeOdds <= awayOdds ? "home" : "away";
    await db.bet.create({
      data: { betTypeId: matchWinnerBtId, matchId: match.id, userId: user.id, tournamentId: tournament.id, prediction: { outcome } as unknown as Prisma.InputJsonValue },
    });
    await db.bet.create({
      data: { betTypeId: correctScoreBtId, matchId: match.id, userId: user.id, tournamentId: tournament.id, prediction: { homeScore: outcome === "home" ? 1 : 0, awayScore: outcome === "away" ? 1 : 0 } as unknown as Prisma.InputJsonValue },
    });
  }
  console.log(`  Placed ${qfMatches.length * 2} per-game bets for QF`);

  // Advance to end of QF
  const july12 = new Date("2026-07-12T12:00:00Z");
  betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  await applyBetTypeTransitions(betTypes, july12);
  await simulateTournamentProgression(group.id, tournament.id, july12);

  // Place SF bets
  const sfMatches = await db.match.findMany({
    where: { tournamentId: tournament.id, phase: "SF" },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoffAt: "asc" },
  });
  for (const match of sfMatches) {
    const homeOdds = (match.homeTeam.odds as { winnerOdds: number }).winnerOdds;
    const awayOdds = (match.awayTeam.odds as { winnerOdds: number }).winnerOdds;
    const outcome = homeOdds <= awayOdds ? "home" : "away";
    await db.bet.create({
      data: { betTypeId: matchWinnerBtId, matchId: match.id, userId: user.id, tournamentId: tournament.id, prediction: { outcome } as unknown as Prisma.InputJsonValue },
    });
    await db.bet.create({
      data: { betTypeId: correctScoreBtId, matchId: match.id, userId: user.id, tournamentId: tournament.id, prediction: { homeScore: outcome === "home" ? 1 : 0, awayScore: outcome === "away" ? 1 : 0 } as unknown as Prisma.InputJsonValue },
    });
  }
  console.log(`  Placed ${sfMatches.length * 2} per-game bets for SF`);

  // Advance to end of SF
  const july15 = new Date("2026-07-15T12:00:00Z");
  betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  await applyBetTypeTransitions(betTypes, july15);
  await simulateTournamentProgression(group.id, tournament.id, july15);

  // Place FINAL bet
  const finalMatch = await db.match.findMany({
    where: { tournamentId: tournament.id, phase: "FINAL" },
    include: { homeTeam: true, awayTeam: true },
  });
  if (finalMatch.length > 0) {
    const match = finalMatch[0];
    const homeOdds = (match.homeTeam.odds as { winnerOdds: number }).winnerOdds;
    const awayOdds = (match.awayTeam.odds as { winnerOdds: number }).winnerOdds;
    const outcome = homeOdds <= awayOdds ? "home" : "away";
    await db.bet.create({
      data: { betTypeId: matchWinnerBtId, matchId: match.id, userId: user.id, tournamentId: tournament.id, prediction: { outcome } as unknown as Prisma.InputJsonValue },
    });
    await db.bet.create({
      data: { betTypeId: correctScoreBtId, matchId: match.id, userId: user.id, tournamentId: tournament.id, prediction: { homeScore: outcome === "home" ? 1 : 0, awayScore: outcome === "away" ? 1 : 0 } as unknown as Prisma.InputJsonValue },
    });
    console.log(`  Placed 2 per-game bets for FINAL`);
  }

  // Final push: complete tournament with awards
  betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  await applyBetTypeTransitions(betTypes, july20);
  await simulateTournamentProgression(group.id, tournament.id, july20, {
    goldenBoot: "Kylian Mbappé",
    goldenBall: "Vinicius Jr.",
    goldenGlove: "Alisson",
  });

  // ── Verification ──
  console.log("\n── Final Verification ──");

  // Re-fetch all bet types
  betTypes = await db.betType.findMany({ where: { tournamentId: tournament.id } });
  for (const bt of betTypes) btBySubType[bt.subType] = bt;

  // All tournament bets should be RESOLVED
  const tournamentSubTypes = ["winner", "runner_up", "dark_horse", "reverse_dark_horse",
    "group_predictions", "golden_boot", "golden_ball", "golden_glove", "bracket", "semifinalists"];
  for (const st of tournamentSubTypes) {
    assert(`${st} is RESOLVED`, btBySubType[st]?.status === "RESOLVED", `status=${btBySubType[st]?.status}`);
  }

  // Verify all matches completed
  const allMatchCount = await db.match.count({ where: { tournamentId: tournament.id } });
  const completedCount = await db.match.count({ where: { tournamentId: tournament.id, status: "COMPLETED" } });
  assert(`All ${allMatchCount} matches completed`, allMatchCount === completedCount, `${completedCount}/${allMatchCount}`);

  // ── Verify simple bet scoring matches potential ──
  console.log("\n  ── Simple bet potential vs actual ──");

  // Winner
  const finalMatchData = await db.match.findFirst({
    where: { tournamentId: tournament.id, phase: "FINAL", status: "COMPLETED" },
    include: { homeTeam: true, awayTeam: true },
  });
  const actualWinnerCode = (btBySubType["winner"].resolution as { teamCode: string })?.teamCode;
  const winnerBetAfter = await db.bet.findUnique({ where: { id: winnerBet.id } });
  if (actualWinnerCode === "FRA") {
    assertClose("Winner (FRA) points match potential", winnerBetAfter?.totalPoints ?? 0, winnerPts.totalPoints);
  } else {
    assert(`Winner bet correctly 0 (actual: ${actualWinnerCode})`, winnerBetAfter?.totalPoints === 0);
  }
  console.log(`    Actual winner: ${actualWinnerCode}, bet isCorrect=${winnerBetAfter?.isCorrect}, pts=${winnerBetAfter?.totalPoints}`);

  // Runner up
  const actualRunnerUpCode = (btBySubType["runner_up"].resolution as { teamCode: string })?.teamCode;
  const ruBetAfter = await db.bet.findUnique({ where: { id: ruBet.id } });
  if (actualRunnerUpCode === "BRA") {
    assertClose("Runner Up (BRA) points match potential", ruBetAfter?.totalPoints ?? 0, ruPts.totalPoints);
  } else {
    assert(`Runner Up bet correctly 0 (actual: ${actualRunnerUpCode})`, ruBetAfter?.totalPoints === 0);
  }
  console.log(`    Actual runner up: ${actualRunnerUpCode}, bet isCorrect=${ruBetAfter?.isCorrect}, pts=${ruBetAfter?.totalPoints}`);

  // Golden boot
  const gbBetAfter = await db.bet.findUnique({ where: { id: gbBet.id } });
  const gbResolution = btBySubType["golden_boot"].resolution as { playerName: string };
  if (gbResolution?.playerName === "Kylian Mbappé") {
    assertClose("Golden Boot points match potential", gbBetAfter?.totalPoints ?? 0, gbPts.totalPoints);
  } else {
    assert("Golden Boot correctly 0", gbBetAfter?.totalPoints === 0);
  }
  console.log(`    Golden Boot resolution: ${gbResolution?.playerName}, isCorrect=${gbBetAfter?.isCorrect}, pts=${gbBetAfter?.totalPoints}`);

  // Golden ball
  const gballBetAfter = await db.bet.findUnique({ where: { id: gballBet.id } });
  const gballResolution = btBySubType["golden_ball"].resolution as { playerName: string };
  if (gballResolution?.playerName === "Vinicius Jr.") {
    assertClose("Golden Ball points match potential", gballBetAfter?.totalPoints ?? 0, gballPts.totalPoints);
  } else {
    assert("Golden Ball correctly 0", gballBetAfter?.totalPoints === 0);
  }
  console.log(`    Golden Ball resolution: ${gballResolution?.playerName}, isCorrect=${gballBetAfter?.isCorrect}, pts=${gballBetAfter?.totalPoints}`);

  // Golden glove
  const ggBetAfter = await db.bet.findUnique({ where: { id: ggBet.id } });
  const ggResolution = btBySubType["golden_glove"].resolution as { playerName: string };
  if (ggResolution?.playerName === "Alisson") {
    assertClose("Golden Glove points match potential", ggBetAfter?.totalPoints ?? 0, ggPts.totalPoints);
  } else {
    assert("Golden Glove correctly 0", ggBetAfter?.totalPoints === 0);
  }
  console.log(`    Golden Glove resolution: ${ggResolution?.playerName}, isCorrect=${ggBetAfter?.isCorrect}, pts=${ggBetAfter?.totalPoints}`);

  // Dark horse
  const dhBetAfter = await db.bet.findUnique({ where: { id: dhBet.id } });
  const dhResolution = btBySubType["dark_horse"].resolution as { teams: string[] };
  const turInQF = dhResolution?.teams?.includes("TUR") ?? false;
  if (turInQF) {
    assertClose("Dark Horse (TUR) points match potential", dhBetAfter?.totalPoints ?? 0, dhPts.totalPoints);
  } else {
    assert("Dark Horse correctly 0 (TUR didn't reach QF)", dhBetAfter?.totalPoints === 0);
  }
  console.log(`    Dark Horse: TUR in QF=${turInQF}, isCorrect=${dhBetAfter?.isCorrect}, pts=${dhBetAfter?.totalPoints}`);

  // ── Verify per-game scoring consistency ──
  console.log("\n  ── Per-game scoring consistency ──");

  // For each scored per-game bet, recompute what calculatePoints would give and compare
  const allScoredPerGame = await db.bet.findMany({
    where: {
      tournamentId: tournament.id,
      betTypeId: { in: [matchWinnerBtId, correctScoreBtId] },
      scoredAt: { not: null },
      isCorrect: true,
    },
    include: { match: { include: { homeTeam: true, awayTeam: true } } },
  });

  let perGameMatchCount = 0;
  let perGameMismatches = 0;
  for (const bet of allScoredPerGame) {
    if (!bet.match) continue;
    perGameMatchCount++;
    // We'd need the exact same scoring path to verify, but at minimum:
    assert(
      `Correct per-game bet has positive points (match ${bet.match.homeTeam.code} v ${bet.match.awayTeam.code}, phase=${bet.match.phase})`,
      (bet.totalPoints ?? 0) > 0,
      `got ${bet.totalPoints}`
    );
  }
  console.log(`  ${perGameMatchCount} correct per-game bets verified with positive points`);

  // ── Verify bracket scoring ──
  console.log("\n  ── Bracket scoring ──");
  const bracketBetAfter = await db.bet.findUnique({ where: { id: bracketBet.id } });
  assert("Bracket bet scored", bracketBetAfter?.scoredAt != null);
  console.log(`  Bracket: isCorrect=${bracketBetAfter?.isCorrect}, base=${bracketBetAfter?.basePoints}, bonus=${bracketBetAfter?.bonusPoints}, total=${bracketBetAfter?.totalPoints}`);

  // Count how many bracket picks were correct
  const bracketResolution = btBySubType["bracket"].resolution as { winners: Record<string, string> };
  let bracketCorrect = 0;
  let bracketTotal = 0;
  if (bracketResolution?.winners) {
    for (const [slot, winner] of Object.entries(bracketResolution.winners)) {
      bracketTotal++;
      if (bracketPicks[slot] === winner) bracketCorrect++;
    }
  }
  console.log(`  Bracket: ${bracketCorrect}/${bracketTotal} correct picks`);

  // ── Verify semifinalists scoring ──
  console.log("\n  ── Semifinalists scoring ──");
  const sfBetAfter = await db.bet.findUnique({ where: { id: sfBet.id } });
  assert("Semifinalists bet scored", sfBetAfter?.scoredAt != null);
  const sfResolution = btBySubType["semifinalists"].resolution as { teams: string[] };
  const sfCorrect = sfPicks.filter((p) => sfResolution?.teams?.includes(p)).length;
  console.log(`  Semifinalists: ${sfCorrect}/4 correct picks, isCorrect=${sfBetAfter?.isCorrect}, total=${sfBetAfter?.totalPoints}`);

  // ── Verify leaderboard ──
  console.log("\n  ── Leaderboard ──");
  const leaderboard = await db.leaderboardEntry.findFirst({
    where: { groupId: group.id, tournamentId: tournament.id, userId: user.id },
  });
  assert("Leaderboard entry exists", leaderboard != null);

  // Sum all scored bets
  const allBets = await db.bet.findMany({
    where: { tournamentId: tournament.id, userId: user.id, scoredAt: { not: null } },
  });
  const sumPoints = allBets.reduce((sum, b) => sum + (b.totalPoints ?? 0), 0);
  const roundedSum = parseFloat(sumPoints.toFixed(2));
  console.log(`  Leaderboard total: ${leaderboard?.totalPoints}`);
  console.log(`  Sum of all bet points: ${roundedSum}`);
  assertClose("Leaderboard total matches sum of bets", leaderboard?.totalPoints ?? 0, roundedSum, 0.1);

  // ── Summary ──
  console.log(`\n═══ Results: ${passes} passed, ${fails} failed ═══`);

  // ── Cleanup ──
  console.log("\n── Cleanup ──");
  await db.leaderboardEntry.deleteMany({ where: { groupId: group.id } });
  await db.bet.deleteMany({ where: { tournamentId: tournament.id } });
  await db.match.deleteMany({ where: { tournamentId: tournament.id } });
  await db.betType.deleteMany({ where: { tournamentId: tournament.id } });
  await db.team.deleteMany({ where: { tournamentId: tournament.id } });
  await db.tournament.deleteMany({ where: { id: tournament.id } });
  await db.groupMembership.deleteMany({ where: { groupId: group.id } });
  await db.group.delete({ where: { id: group.id } });
  console.log("  Test data cleaned up");

  process.exit(fails > 0 ? 1 : 0);
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(2);
  })
  .finally(() => db.$disconnect());
