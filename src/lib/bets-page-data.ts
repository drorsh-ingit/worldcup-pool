import { db } from "@/lib/db";
import { resolveGroupSettings } from "@/lib/settings";
import { getEffectiveDate } from "@/lib/simulation";
import { calculatePoints } from "@/lib/scoring";
import { deriveMatchOdds, deriveScoreOdds } from "@/lib/match-odds";
import { GOLDEN_BOOT_CANDIDATES } from "@/lib/data/wc2026";

export const PHASE_LABELS: Record<string, string> = {
  GROUP: "Group Stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-Finals",
  SF: "Semi-Finals",
  FINAL: "Final",
};
export const PHASE_ORDER = ["GROUP", "R32", "R16", "QF", "SF", "FINAL"];

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
  for (const team of tournament.teams) {
    teamWinnerOdds[team.code] = (team.odds as { winnerOdds?: number } | null)?.winnerOdds ?? 1000;
  }

  const perGameBetTypeOpen =
    !!(betTypesWithEffectiveStatus.find((bt) => bt.subType === "match_winner")?.effectiveStatus === "OPEN") ||
    !!(betTypesWithEffectiveStatus.find((bt) => bt.subType === "correct_score")?.effectiveStatus === "OPEN");

  const preTournamentBets = betTypesWithEffectiveStatus.filter((bt) => bt.category === "PRE_TOURNAMENT");
  const milestoneBets = betTypesWithEffectiveStatus.filter((bt) => bt.category === "MILESTONE");
  const curatedBets = betTypesWithEffectiveStatus.filter((bt) => bt.category === "CURATED");
  const perGameBets = betTypesWithEffectiveStatus.filter((bt) => bt.category === "PER_GAME");
  const matchWinnerBetType = perGameBets.find((bt) => bt.subType === "match_winner");
  const correctScoreBetType = perGameBets.find((bt) => bt.subType === "correct_score");

  // Tournament-bets points maps
  const teamPointsMap: Record<string, Record<string, number>> = {};
  for (const subType of ["winner", "runner_up", "dark_horse", "reverse_dark_horse"] as const) {
    teamPointsMap[subType] = {};
    for (const team of tournament.teams) {
      const odds = teamWinnerOdds[team.code];
      const effectiveOdds = subType === "reverse_dark_horse" ? Math.max(1, 4000000 / odds) : odds;
      teamPointsMap[subType][team.code] = potentialPoints(subType, effectiveOdds);
    }
  }
  const groupPredictionPoints: Record<string, number> = {};
  for (const team of tournament.teams) {
    const odds = (team.odds as { groupWinnerOdds?: number } | null)?.groupWinnerOdds ?? 300;
    groupPredictionPoints[team.code] = potentialPoints("group_predictions", odds);
  }
  const goldenBootPoints: Record<string, number> = {};
  for (const c of GOLDEN_BOOT_CANDIDATES) {
    goldenBootPoints[`${c.playerName}|${c.teamCode}`] = potentialPoints("golden_boot", c.odds);
  }

  return {
    tournament,
    effectiveNow,
    betTypesWithEffectiveStatus,
    betByTypeId,
    betByTypeAndMatch,
    teamsByGroup,
    teamWinnerOdds,
    perGameBetTypeOpen,
    preTournamentBets,
    milestoneBets,
    curatedBets,
    matchWinnerBetType,
    correctScoreBetType,
    teamPointsMap,
    groupPredictionPoints,
    goldenBootPoints,
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
