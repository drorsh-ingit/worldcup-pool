/**
 * Scoring Engine for World Cup Pool
 *
 * Architecture:
 *  - Each group has configurable tier weights, sub-weights, base%, outlierThresholds, knockoutMultipliers
 *  - For each resolved bet: basePoints + bonusPoints = totalPoints
 *  - Base: guaranteed floor points for a correct pick = subWeight * tierAllocation * basePct
 *  - Bonus: odds-scaled points = subWeight * tierAllocation * (1 - basePct) * oddsScaler
 *  - Outlier clamping: cap implied probability at outlierThreshold basis points
 *  - Per-game multipliers applied for knockout rounds
 */

import { db } from "@/lib/db";
import { DEFAULT_GROUP_SETTINGS, resolveGroupSettings, type GroupSettings } from "@/lib/settings";
import { deriveMatchOdds } from "@/lib/match-odds";

/** Implied probability from decimal odds (e.g., 500 → 1/500 = 0.002) */
function impliedProb(decimalOdds: number): number {
  return 1 / Math.max(decimalOdds, 1);
}

/** Clamp implied probability so longshots don't compress the pool.
 *  thresholdOdds is the max odds beyond which all picks get the same bonus.
 *  e.g., 25000 means anything beyond 250/1 is treated as 250/1. */
function clampedProb(prob: number, thresholdOdds: number): number {
  const floor = 1 / Math.max(thresholdOdds, 1); // odds → implied probability floor
  return Math.max(prob, floor);
}

/** Scale odds bonus: uses implied prob, capped, normalized. Returns bounded scaler.
 *  divisor tunes the magnitude: pre-tournament odds are in the hundreds (use ~100),
 *  per-game match odds are in the 2–25 range (use ~5). */
function oddsScaler(prob: number, thresholdOdds: number, divisor = 100): number {
  const p = clampedProb(prob, thresholdOdds);
  // Inverse probability gives the bonus magnitude; normalize to keep reasonable range
  // We use sqrt to soften extreme values
  return Math.sqrt(1 / p) / divisor;
}

/**
 * Calculate points for a single bet.
 * @param isCorrect whether the bet is correct
 * @param subType bet subType (e.g., "winner", "matchWinner")
 * @param impliedProbability bet's implied probability (1 / decimal odds)
 * @param settings group settings
 * @param phase match phase (for per-game multiplier)
 * @param totalPool total pool for the group
 * @param memberCount number of members in the group
 */
export function calculatePoints(
  isCorrect: boolean,
  subType: string,
  impliedProbability: number,
  settings: GroupSettings,
  phase: keyof typeof DEFAULT_GROUP_SETTINGS["knockoutMultipliers"] = "GROUP",
  totalPool = 1000,
  memberCount = 10
): { basePoints: number; bonusPoints: number; totalPoints: number } {
  if (!isCorrect) return { basePoints: 0, bonusPoints: 0, totalPoints: 0 };

  // Determine tier and sub-weight
  const tierKey = getTierForSubType(subType);
  if (!tierKey) return { basePoints: 0, bonusPoints: 0, totalPoints: 0 };

  const tierWeight = settings.tierWeights[tierKey];
  const tierPool = totalPool * tierWeight;

  const subWeightMap = settings.subWeights[tierKey] as Record<string, number>;
  const camelKey = snakeToCamel(subType);
  const subWeight = subWeightMap[camelKey] ?? 0;
  const subPool = tierPool * subWeight;

  const basePct = (settings.basePct as Record<string, number>)[camelKey] ?? 0.2;
  const threshold = (settings.outlierThresholds as Record<string, number>)[camelKey] ?? 99999;

  // Per-game subPool must be spread across all matches to keep the tier cap honest.
  // We use "match equivalents" — the weighted sum of all group + knockout matches
  // after knockout multipliers — so a perfect season's total stays near the tier allocation.
  const matchDivisor = tierKey === "perGame" ? (settings.perGameMatchEquivalents ?? 77) : 1;

  const basePoints = (subPool * basePct) / matchDivisor;

  // Bonus: scaled by oddsScaler.
  // Per-game bets divide by memberCount (many players pile onto the obvious pick, so cap the bonus).
  // Pre-tournament/milestone/curated bets don't — picks are spread across many different teams/players.
  const scalerDivisor = tierKey === "perGame" ? 5 : 100;
  const scaler = oddsScaler(impliedProbability, threshold, scalerDivisor);
  const effectiveDivisor = tierKey === "perGame" ? memberCount : 1;
  const bonusPoints = (subPool * (1 - basePct) * Math.min(scaler, 5)) / effectiveDivisor / matchDivisor;

  // Apply knockout multiplier for per-game bets
  const multiplier =
    tierKey === "perGame" ? (settings.knockoutMultipliers[phase] ?? 1.0) : 1.0;

  return {
    basePoints: parseFloat((basePoints * multiplier).toFixed(2)),
    bonusPoints: parseFloat((bonusPoints * multiplier).toFixed(2)),
    totalPoints: parseFloat(((basePoints + bonusPoints) * multiplier).toFixed(2)),
  };
}

function getTierForSubType(subType: string): keyof GroupSettings["tierWeights"] | null {
  const map: Record<string, keyof GroupSettings["tierWeights"]> = {
    winner: "preTournament",
    runner_up: "preTournament",
    golden_boot: "preTournament",
    group_predictions: "preTournament",
    dark_horse: "preTournament",
    reverse_dark_horse: "preTournament",
    match_winner: "perGame",
    correct_score: "perGame",
    bracket: "milestone",
    golden_glove: "milestone",
    golden_ball: "milestone",
    semifinalists: "milestone",
    prop: "curated",
  };
  return map[subType] ?? null;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Score all bets for a specific match (per-game) or a specific betType (pre-tournament/milestone/curated).
 * Writes isCorrect, basePoints, bonusPoints, totalPoints, scoredAt to each Bet row.
 */
export async function scoreBets(
  groupId: string,
  tournamentId: string,
  matchId: string | null,
  betTypeId?: string
) {
  const group = await db.group.findUnique({ where: { id: groupId } });
  const settings = resolveGroupSettings(group?.settings);

  const members = await db.groupMembership.findMany({
    where: { groupId, status: "APPROVED" },
  });
  const memberCount = members.length;

  const totalPool = settings.totalPool ?? 1000;

  if (matchId) {
    // Score per-game bets for this match
    const match = await db.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true },
    });
    if (!match || match.actualHomeScore == null || match.actualAwayScore == null) return;

    const actualHome = match.actualHomeScore;
    const actualAway = match.actualAwayScore;

    // Find per-game bet types for this tournament
    const perGameBetTypes = await db.betType.findMany({
      where: { tournamentId, category: "PER_GAME" },
    });

    for (const bt of perGameBetTypes) {
      const bets = await db.bet.findMany({
        where: { betTypeId: bt.id, matchId, scoredAt: null },
      });

      for (const bet of bets) {
        const pred = bet.prediction as Record<string, unknown>;
        let isCorrect = false;
        let impliedProbability = 0.1;
        let subType = "";

        if (bt.subType === "match_winner") {
          subType = "match_winner";
          const actualOutcome =
            actualHome > actualAway ? "home" : actualAway > actualHome ? "away" : "draw";
          isCorrect = pred.outcome === actualOutcome;
          // odds from match oddsData; fall back to odds derived from team winnerOdds
          const oddsData = match.oddsData as Record<string, number>;
          const oddsKey = actualOutcome === "home" ? "homeWin" : actualOutcome === "away" ? "awayWin" : "draw";
          const homeOdds = (match.homeTeam.odds as { winnerOdds?: number } | null)?.winnerOdds ?? 1000;
          const awayOdds = (match.awayTeam.odds as { winnerOdds?: number } | null)?.winnerOdds ?? 1000;
          const derived = deriveMatchOdds(homeOdds, awayOdds);
          const fallback = oddsKey === "homeWin" ? derived.homeWin : oddsKey === "awayWin" ? derived.awayWin : derived.draw;
          impliedProbability = impliedProb(oddsData[oddsKey] ?? fallback);
        } else if (bt.subType === "correct_score") {
          subType = "correct_score";
          isCorrect =
            Number(pred.homeScore) === actualHome &&
            Number(pred.awayScore) === actualAway;
          // correct score odds can be very long; use a default
          const oddsData = match.oddsData as Record<string, Record<string, number>>;
          const scoreKey = `${pred.homeScore}-${pred.awayScore}`;
          const rawOdds = oddsData.correctScores?.[scoreKey] ?? 1500;
          impliedProbability = impliedProb(rawOdds);
        }

        const phase = match.phase as keyof typeof DEFAULT_GROUP_SETTINGS["knockoutMultipliers"];
        const pts = calculatePoints(isCorrect, subType, impliedProbability, settings, phase, totalPool, memberCount);

        await db.bet.update({
          where: { id: bet.id },
          data: {
            isCorrect,
            basePoints: pts.basePoints,
            bonusPoints: pts.bonusPoints,
            totalPoints: pts.totalPoints,
            scoredAt: new Date(),
          },
        });
      }
    }
  }

  if (betTypeId) {
    // Score pre-tournament/milestone/curated bet type
    const betType = await db.betType.findUnique({ where: { id: betTypeId } });
    if (!betType || betType.status !== "RESOLVED" || !betType.resolution) return;

    const resolution = betType.resolution as Record<string, unknown>;
    const bets = await db.bet.findMany({
      where: { betTypeId, scoredAt: null },
      include: { match: true },
    });

    for (const bet of bets) {
      const pred = bet.prediction as Record<string, unknown>;
      const { isCorrect, impliedProbability } = checkBetCorrectness(
        betType.subType,
        pred,
        resolution,
        tournamentId
      );

      const subType = betType.subType;
      const pts = calculatePoints(isCorrect, subType, impliedProbability, settings, "GROUP", totalPool, memberCount);

      await db.bet.update({
        where: { id: bet.id },
        data: {
          isCorrect,
          basePoints: pts.basePoints,
          bonusPoints: pts.bonusPoints,
          totalPoints: pts.totalPoints,
          scoredAt: new Date(),
        },
      });
    }
  }
}

/** Determine if a pre-tournament/milestone bet is correct */
function checkBetCorrectness(
  subType: string,
  prediction: Record<string, unknown>,
  resolution: Record<string, unknown>,
  _tournamentId: string
): { isCorrect: boolean; impliedProbability: number } {
  switch (subType) {
    case "winner":
    case "runner_up": {
      const isCorrect = prediction.teamCode === resolution.teamCode;
      const odds = (prediction.odds as number) ?? 1000;
      return { isCorrect, impliedProbability: impliedProb(odds) };
    }

    case "dark_horse": {
      const teams: string[] = (resolution.teams as string[]) ?? [];
      const isCorrect = teams.includes(prediction.teamCode as string);
      const odds = (prediction.odds as number) ?? 1000;
      return { isCorrect, impliedProbability: impliedProb(odds) };
    }

    case "reverse_dark_horse": {
      const teams: string[] = (resolution.teams as string[]) ?? [];
      const isCorrect = teams.includes(prediction.teamCode as string);
      const odds = (prediction.odds as number) ?? 1000;
      // Invert: bigger favourite (lower odds) = bigger upset = lower implied probability = more points
      const invertedOdds = Math.max(1, 4000000 / odds);
      return { isCorrect, impliedProbability: impliedProb(invertedOdds) };
    }

    case "golden_boot":
    case "golden_glove":
    case "golden_ball": {
      const isCorrect =
        (prediction.playerName as string)?.toLowerCase() ===
        (resolution.playerName as string)?.toLowerCase();
      const odds = (prediction.odds as number) ?? 500;
      return { isCorrect, impliedProbability: impliedProb(odds) };
    }

    case "group_predictions": {
      // prediction: { A: ["FRA", "MEX"], B: ["USA", "URU", "BOL"], ... }
      //   first element = group winner, rest = advancing teams
      // resolution: { winners: { A: "FRA", ... }, advancing: ["FRA", "MEX", "USA", ...] }
      const pred = prediction as Record<string, string[]>;
      const res = resolution as { winners: Record<string, string>; advancing: string[] };
      const resAdvancing = new Set(res.advancing ?? []);
      let correctWinners = 0;
      let totalGroups = 0;
      let correctAdvancing = 0;
      let totalAdvancing = 0;
      for (const [group, picks] of Object.entries(pred)) {
        if (!picks || picks.length === 0) continue;
        // Score winner (first pick)
        totalGroups++;
        if (picks[0] === res.winners?.[group]) correctWinners++;
        // Score advancing (all picks including winner)
        for (const team of picks) {
          totalAdvancing++;
          if (resAdvancing.has(team)) correctAdvancing++;
        }
      }
      const winnerScore = totalGroups > 0 ? correctWinners / totalGroups : 0;
      const advancingScore = totalAdvancing > 0 ? correctAdvancing / totalAdvancing : 0;
      // Combined score weighted toward winners (60%) and advancing (40%)
      const combined = winnerScore * 0.6 + advancingScore * 0.4;
      return { isCorrect: combined > 0, impliedProbability: Math.max(combined, 0.05) };
    }

    case "semifinalists": {
      // prediction: { teams: ["FRA", "ENG", "BRA", "ARG"] }
      const predTeams = new Set((prediction.teams as string[]) ?? []);
      const resTeams = new Set((resolution.teams as string[]) ?? []);
      let correct = 0;
      for (const t of resTeams) {
        if (predTeams.has(t)) correct++;
      }
      const partialScore = correct / 4;
      return { isCorrect: partialScore > 0, impliedProbability: Math.max(partialScore, 0.05) };
    }

    case "prop": {
      const isCorrect = prediction.option === resolution.option;
      const options = (resolution.totalOptions as number) ?? 4;
      return { isCorrect, impliedProbability: 1 / options };
    }

    default:
      return { isCorrect: false, impliedProbability: 0.1 };
  }
}
