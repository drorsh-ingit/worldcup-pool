import { db } from "@/lib/db";
import { resolveGroupSettings } from "@/lib/settings";
import { getEffectiveDate } from "@/lib/simulation";
import { calculatePoints, bracketPickPotential } from "@/lib/scoring";
import { deriveMatchOdds, deriveScoreOdds } from "@/lib/match-odds";
import { GOLDEN_BOOT_CANDIDATES, GOLDEN_BALL_CANDIDATES, GOLDEN_GLOVE_CANDIDATES } from "@/lib/data/wc2026";
import { promoteBetTypeGlobally, refreshOddsForBetType, refreshAllMatchOdds } from "@/lib/actions/refresh-odds";
import { Prisma } from "@prisma/client";

export const PHASE_LABELS: Record<string, string> = {
  GROUP: "Group Stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-Finals",
  SF: "Semi-Finals",
  FINAL: "Final",
};
export const PHASE_ORDER = ["GROUP", "R32", "R16", "QF", "SF", "FINAL"];

export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase;
}

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

/** Shared data loader for /matches and /bets pages. Returns null if tournament missing. */
export async function loadBetsPageData(groupId: string, userId: string) {
  const group = await db.group.findUnique({ where: { id: groupId } });
  const groupSettings = resolveGroupSettings(group?.settings);
  const effectiveNow = getEffectiveDate(groupSettings);

  const tournament = await db.tournament.findFirst({
    where: { groupId },
    include: {
      teams: { orderBy: [{ groupLetter: "asc" }, { name: "asc" }] },
      betTypes: {
        where: {
          OR: [
            { status: { not: "DRAFT" } },
            { status: "DRAFT", opensAt: { lte: effectiveNow } },
          ],
        },
        orderBy: { category: "asc" },
      },
      matches: {
        include: { homeTeam: true, awayTeam: true },
        orderBy: { kickoffAt: "asc" },
      },
    },
  });

  if (!tournament) return null;

  // Simulation mode: effectiveNow is a fake date set by the admin.
  // In that case, promotions must be isolated to this group only — we must not
  // open bets on real groups just because a test group has fast-forwarded in time.
  const isSimulated = !!groupSettings?.simulation?.enabled;

  // Auto-promote bet types whose opensAt has passed but DB still says DRAFT.
  const toPromote = tournament.betTypes.filter(
    (bt) => bt.status === "DRAFT" && bt.opensAt != null && effectiveNow >= bt.opensAt && bt.frozenOdds == null
  );

  if (toPromote.length > 0) {
    // Pre-refresh odds ONCE before promoting any bet types (avoids redundant API calls).
    // Skip for simulated groups — use whatever odds are already in the DB.
    const hasTournamentBets = toPromote.some((bt) => bt.category === "TOURNAMENT");
    const hasPerGameBets = toPromote.some((bt) => bt.category === "PER_GAME");
    if (!isSimulated) {
      if (hasTournamentBets) {
        await refreshOddsForBetType(tournament.id, "TOURNAMENT", "winner").catch(() => null);
      }
      if (hasPerGameBets) {
        await refreshAllMatchOdds(tournament.id).catch(() => null);
      }
    }

    for (const bt of toPromote) {
      await promoteBetTypeGlobally(tournament.id, tournament.kind, bt, {
        skipRefresh: true,
        isolated: isSimulated, // simulated groups only affect their own tournament
      });

      // Refresh local state so the rest of this page load sees the updated values.
      const updated = await db.betType.findUnique({ where: { id: bt.id } });
      if (updated) {
        bt.status = updated.status;
        bt.frozenOdds = updated.frozenOdds;
      }
    }
  }

  const betTypesWithEffectiveStatus = tournament.betTypes.map((bt) => ({
    ...bt,
    effectiveStatus:
      bt.status === "DRAFT" && bt.opensAt && effectiveNow >= bt.opensAt
        ? bt.locksAt && effectiveNow >= bt.locksAt
          ? ("LOCKED" as const)
          : ("OPEN" as const)
        : (bt.status as "DRAFT" | "OPEN" | "LOCKED" | "RESOLVED"),
  }));

  const userBets = await db.bet.findMany({
    where: { userId, tournamentId: tournament.id },
    include: { betType: true },
  });

  const betByTypeId: Record<string, (typeof userBets)[number]> = {};
  const betByTypeAndMatch: Record<string, (typeof userBets)[number]> = {};
  for (const bet of userBets) {
    if (bet.matchId) betByTypeAndMatch[`${bet.betTypeId}:${bet.matchId}`] = bet;
    else betByTypeId[bet.betTypeId] = bet;
  }

  const teamsByGroup: Record<string, typeof tournament.teams> = {};
  for (const team of tournament.teams) {
    if (!teamsByGroup[team.groupLetter]) teamsByGroup[team.groupLetter] = [];
    teamsByGroup[team.groupLetter].push(team);
  }

  const memberCount = await db.groupMembership.count({
    where: { groupId, status: "APPROVED" },
  });
  const totalPool = groupSettings.totalPool ?? 1000;

  function potentialPoints(
    subType: string,
    odds: number,
    phase: "GROUP" | "R32" | "R16" | "QF" | "SF" | "FINAL" = "GROUP"
  ): number {
    return calculatePoints(
      true,
      subType,
      1 / Math.max(odds, 1),
      groupSettings,
      phase,
      totalPool,
      Math.max(memberCount, 1)
    ).totalPoints;
  }

  const teamWinnerOdds: Record<string, number> = {};
  const teamQualifyOdds: Record<string, number> = {};
  for (const team of tournament.teams) {
    const o = team.odds as { winnerOdds?: number; qualifyOdds?: number } | null;
    teamWinnerOdds[team.code] = o?.winnerOdds ?? 1000;
    teamQualifyOdds[team.code] = o?.qualifyOdds ?? 150;
  }

  /**
   * Resolve odds for a given bet type — prefers the snapshot frozen at open time,
   * falls back to live Team.odds for DRAFT bet types.
   */
  const teamsList = tournament.teams;
  function teamOddsFor(
    betType: { frozenOdds: Prisma.JsonValue | null } | undefined,
    code: string
  ): { winnerOdds: number; groupWinnerOdds: number; qualifyOdds: number } {
    const frozen = (betType?.frozenOdds as { teams?: Record<string, unknown> } | null)?.teams?.[code] as
      | { winnerOdds?: number; groupWinnerOdds?: number; qualifyOdds?: number }
      | undefined;
    const live = teamsList.find((t) => t.code === code)?.odds as
      | { winnerOdds?: number; groupWinnerOdds?: number; qualifyOdds?: number }
      | null;
    return {
      winnerOdds: frozen?.winnerOdds ?? live?.winnerOdds ?? 1000,
      groupWinnerOdds: frozen?.groupWinnerOdds ?? live?.groupWinnerOdds ?? 300,
      qualifyOdds: frozen?.qualifyOdds ?? live?.qualifyOdds ?? 150,
    };
  }

  const perGameBetTypeOpen =
    !!(betTypesWithEffectiveStatus.find((bt) => bt.subType === "match_winner")?.effectiveStatus === "OPEN") ||
    !!(betTypesWithEffectiveStatus.find((bt) => bt.subType === "correct_score")?.effectiveStatus === "OPEN");

  // Display order on the bets page — tied to bet identity, not when it opens.
  const TOURNAMENT_BET_ORDER = [
    "winner",
    "runner_up",
    "golden_boot",
    "dark_horse",
    "reverse_dark_horse",
    "group_predictions",
    "bracket",
    "golden_ball",
    "golden_glove",
    "semifinalists",
  ];
  const tournamentBets = betTypesWithEffectiveStatus
    .filter((bt) => bt.category === "TOURNAMENT")
    .sort((a, b) => {
      const ai = TOURNAMENT_BET_ORDER.indexOf(a.subType);
      const bi = TOURNAMENT_BET_ORDER.indexOf(b.subType);
      const aRank = ai === -1 ? TOURNAMENT_BET_ORDER.length : ai;
      const bRank = bi === -1 ? TOURNAMENT_BET_ORDER.length : bi;
      if (aRank !== bRank) return aRank - bRank;
      return (a.opensAt?.getTime() ?? 0) - (b.opensAt?.getTime() ?? 0);
    });
  const curatedBets = betTypesWithEffectiveStatus.filter((bt) => bt.category === "CURATED");
  const perGameBets = betTypesWithEffectiveStatus.filter((bt) => bt.category === "PER_GAME");
  const matchWinnerBetType = perGameBets.find((bt) => bt.subType === "match_winner");
  const correctScoreBetType = perGameBets.find((bt) => bt.subType === "correct_score");

  // Tournament-bets points maps — read odds from each bet type's frozen snapshot when available.
  const teamPointsMap: Record<string, Record<string, number>> = {};
  // Frozen-aware odds maps for the team picker — ensures prediction.odds matches the
  // frozen snapshot used for display and scoring (not the live Team.odds which could drift).
  const teamPickerOdds: Record<string, Record<string, number>> = {};
  for (const subType of ["winner", "runner_up", "dark_horse", "reverse_dark_horse"] as const) {
    teamPointsMap[subType] = {};
    teamPickerOdds[subType] = {};
    const bt = tournament.betTypes.find((b) => b.subType === subType);
    for (const team of tournament.teams) {
      const odds = teamOddsFor(bt, team.code);
      // reverse_dark_horse rewards picking a favourite to be knocked out in groups.
      // Use qualifyOdds inverted: a team more likely to qualify gives more points when knocked out.
      const effectiveOdds =
        subType === "reverse_dark_horse"
          ? Math.max(1, 400000 / odds.qualifyOdds)
          : odds.winnerOdds;
      teamPointsMap[subType][team.code] = potentialPoints(subType, effectiveOdds);
      // Store the raw odds value that will be saved in prediction.odds at placement time.
      // This must match the value used in scoring (checkBetCorrectness reads prediction.odds).
      teamPickerOdds[subType][team.code] =
        subType === "reverse_dark_horse" ? odds.qualifyOdds : odds.winnerOdds;
    }
  }
  // The groupPredictions bet is a bundle of 12 winner picks + up to 20 qualifier picks,
  // scored holistically. Display each cell as its marginal per-pick contribution:
  //  - winners carry 60% of the combined score, split across 12 groups
  //  - qualifiers carry 40%, split across 20 slots
  const WINNER_GROUPS = Object.keys(teamsByGroup).length || 12;
  const QUALIFIER_SLOTS = 20;
  const groupPredictionPoints: Record<string, number> = {};
  const groupQualifierPoints: Record<string, number> = {};
  const groupPredBt = tournament.betTypes.find((b) => b.subType === "group_predictions");
  for (const team of tournament.teams) {
    const odds = teamOddsFor(groupPredBt, team.code);
    groupPredictionPoints[team.code] = parseFloat(
      (potentialPoints("group_predictions", odds.groupWinnerOdds) * 0.6 / WINNER_GROUPS).toFixed(1));
    groupQualifierPoints[team.code] = parseFloat(
      (potentialPoints("group_predictions", odds.qualifyOdds) * 0.4 / QUALIFIER_SLOTS).toFixed(1));
  }
  const semifinalistPointsMap: Record<string, number> = {};
  const semifinalistBt = tournament.betTypes.find((b) => b.subType === "semifinalists");
  for (const team of tournament.teams) {
    const odds = teamOddsFor(semifinalistBt, team.code);
    // Each of the 4 semi picks is scored by winner odds — reflects how likely
    // the team is to go deep in the tournament. qualifyOdds would be meaningless
    // here since this bet opens after the group stage.
    semifinalistPointsMap[team.code] = parseFloat(
      (potentialPoints("semifinalists", odds.winnerOdds) / 4).toFixed(1));
  }

  const goldenBootPoints: Record<string, number> = {};
  for (const c of GOLDEN_BOOT_CANDIDATES) {
    goldenBootPoints[`${c.playerName}|${c.teamCode}`] = potentialPoints("golden_boot", c.odds);
  }
  const goldenBallPoints: Record<string, number> = {};
  for (const c of GOLDEN_BALL_CANDIDATES) {
    goldenBallPoints[`${c.playerName}|${c.teamCode}`] = potentialPoints("golden_ball", c.odds);
  }
  const goldenGlovePoints: Record<string, number> = {};
  for (const c of GOLDEN_GLOVE_CANDIDATES) {
    goldenGlovePoints[`${c.playerName}|${c.teamCode}`] = potentialPoints("golden_glove", c.odds);
  }

  // Bracket: each of 31 knockout picks is scored individually using the picked team's
  // winnerOdds and a phase weight (R32=1.2 → FINAL=2.0, normalized by total weight 41.0).
  // Higher odds + later phase = bigger payout, mirroring the rest of the tournament tier.
  const bracketBt = tournament.betTypes.find((b) => b.subType === "bracket");
  const BRACKET_PHASES = ["R32", "R16", "QF", "SF", "FINAL"] as const;
  const bracketPickPoints: Record<string, number> = {};
  for (const team of tournament.teams) {
    const odds = teamOddsFor(bracketBt, team.code);
    for (const phase of BRACKET_PHASES) {
      bracketPickPoints[`${phase}|${team.code}`] = bracketPickPotential(
        phase,
        odds.winnerOdds,
        groupSettings,
        totalPool,
        Math.max(memberCount, 1)
      );
    }
  }
  const PHASE_COUNTS = { R32: 16, R16: 8, QF: 4, SF: 2, FINAL: 1 } as const;
  // Max bracket points if every pick is correct AND every winner is the longest shot
  // available — useful as a ceiling display.
  const bracketMaxPoints = (() => {
    let max = 0;
    for (const phase of BRACKET_PHASES) {
      let bestForPhase = 0;
      for (const team of tournament.teams) {
        const v = bracketPickPoints[`${phase}|${team.code}`] ?? 0;
        if (v > bestForPhase) bestForPhase = v;
      }
      max += bestForPhase * PHASE_COUNTS[phase];
    }
    return parseFloat(max.toFixed(1));
  })();

  return {
    tournament,
    effectiveNow,
    betTypesWithEffectiveStatus,
    betByTypeId,
    betByTypeAndMatch,
    teamsByGroup,
    teamWinnerOdds,
    teamQualifyOdds,
    perGameBetTypeOpen,
    tournamentBets,
    curatedBets,
    matchWinnerBetType,
    correctScoreBetType,
    teamPointsMap,
    teamPickerOdds,
    semifinalistPointsMap,
    groupPredictionPoints,
    groupQualifierPoints,
    goldenBootPoints,
    goldenBallPoints,
    goldenGlovePoints,
    bracketMaxPoints,
    bracketPickPoints,
    potentialPoints,
  };
}

export type BetsPageData = NonNullable<Awaited<ReturnType<typeof loadBetsPageData>>>;

/** Per-match card data builder — reusable between matches page and any other match renderer. */
export function buildMatchCardProps(
  data: BetsPageData,
  match: BetsPageData["tournament"]["matches"][number]
) {
  const {
    matchWinnerBetType,
    correctScoreBetType,
    betByTypeAndMatch,
    teamWinnerOdds,
    perGameBetTypeOpen,
    effectiveNow,
    potentialPoints,
  } = data;

  const mwBetId = matchWinnerBetType?.id ?? null;
  const csBetId = correctScoreBetType?.id ?? null;
  const mwBet = mwBetId ? betByTypeAndMatch[`${mwBetId}:${match.id}`] : null;
  const csBet = csBetId ? betByTypeAndMatch[`${csBetId}:${match.id}`] : null;
  const inBettingWindow =
    effectiveNow.getTime() >= new Date(match.kickoffAt).getTime() - FORTY_EIGHT_HOURS;
  const betsOpen = perGameBetTypeOpen && inBettingWindow;

  const storedOdds = match.oddsData as { homeWin?: number; draw?: number; awayWin?: number } | null;
  const derived = deriveMatchOdds(
    teamWinnerOdds[match.homeTeam.code] ?? 1000,
    teamWinnerOdds[match.awayTeam.code] ?? 1000
  );
  const phase = match.phase as "GROUP" | "R32" | "R16" | "QF" | "SF" | "FINAL";
  const matchOutcomePoints = {
    home: potentialPoints("match_winner", storedOdds?.homeWin ?? derived.homeWin, phase),
    draw: potentialPoints("match_winner", storedOdds?.draw ?? derived.draw, phase),
    away: potentialPoints("match_winner", storedOdds?.awayWin ?? derived.awayWin, phase),
  };
  const storedScoreOdds = (match.oddsData as { correctScores?: Record<string, number> } | null)?.correctScores;
  const derivedScoreOdds = deriveScoreOdds(
    teamWinnerOdds[match.homeTeam.code] ?? 1000,
    teamWinnerOdds[match.awayTeam.code] ?? 1000
  );
  const scorePointsMap: Record<string, number> = {};
  for (const [key, odds] of Object.entries(storedScoreOdds ?? derivedScoreOdds)) {
    scorePointsMap[key] = potentialPoints("correct_score", odds, phase);
  }

  return {
    mwBetId,
    csBetId,
    mwBet,
    csBet,
    betsOpen,
    matchOutcomePoints,
    scorePointsMap,
  };
}
