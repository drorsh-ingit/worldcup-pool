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
 *  sqrt(1/p) gives meaningful spread without blowing out budgets for longshots.
 *  divisor tunes the magnitude: pre-tournament odds are in the hundreds (~30),
 *  per-game match odds are in the 2–25 range (~2). */
function oddsScaler(prob: number, thresholdOdds: number, divisor = 30): number {
  const p = clampedProb(prob, thresholdOdds);
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
  // Tournament/curated bets don't — picks are spread across many different teams/players.
  const scalerDivisor = tierKey === "perGame" ? 3 : 30;
  const scaler = oddsScaler(impliedProbability, threshold, scalerDivisor);
  // Floor the per-game bonus divisor at 5: in tiny groups (e.g., solo testing) the bonus would
  // otherwise inflate, since we're not actually splitting a pool across many pickers.
  const effectiveDivisor = tierKey === "perGame" ? Math.max(memberCount, 5) : 1;
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
    winner: "tournamentBets",
    runner_up: "tournamentBets",
    golden_boot: "tournamentBets",
    group_predictions: "tournamentBets",
    dark_horse: "tournamentBets",
    reverse_dark_horse: "tournamentBets",
    bracket: "tournamentBets",
    golden_glove: "tournamentBets",
    golden_ball: "tournamentBets",
    semifinalists: "tournamentBets",
    match_winner: "perGame",
    correct_score: "perGame",
    prop: "curated",
  };
  return map[subType] ?? null;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Score all bets for a specific match (per-game) or a specific betType (tournament/curated).
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
          const clampedHome = Math.min(Number(pred.homeScore), 6);
          const clampedAway = Math.min(Number(pred.awayScore), 6);
          const scoreKey = `${clampedHome}-${clampedAway}`;
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
    // Score tournament/curated bet type
    const betType = await db.betType.findUnique({ where: { id: betTypeId } });
    if (!betType || betType.status !== "RESOLVED" || !betType.resolution) return;

    const resolution = betType.resolution as Record<string, unknown>;
    const bets = await db.bet.findMany({
      where: { betTypeId, scoredAt: null },
      include: { match: true },
    });

    // Pre-fetch tournament teams when needed for per-slot scoring.
    const needsTeams =
      betType.subType === "group_predictions" || betType.subType === "bracket";
    const teams = needsTeams
      ? await db.team.findMany({ where: { tournamentId } })
      : [];
    // Prefer odds frozen at bet-type-open time (so future Team.odds refreshes
    // don't retroactively change resolved points). Fall back to live Team.odds.
    const frozenTeamOdds =
      (betType.frozenOdds as { teams?: Record<string, unknown> } | null)?.teams ?? {};
    const teamByCode: Record<string, typeof teams[number]> = {};
    for (const t of teams) {
      teamByCode[t.code] = { ...t, odds: frozenTeamOdds[t.code] ?? t.odds };
    }

    for (const bet of bets) {
      const pred = bet.prediction as Record<string, unknown>;
      const subType = betType.subType;

      let isCorrect = false;
      let basePoints = 0;
      let bonusPoints = 0;
      let totalPoints = 0;

      if (subType === "group_predictions") {
        const per = scoreGroupPredictionsPerSlot(
          pred as Record<string, string[]>,
          resolution as { winners?: Record<string, string>; advancing?: string[] },
          teamByCode,
          settings,
          totalPool,
          memberCount
        );
        isCorrect = per.totalPoints > 0;
        basePoints = per.basePoints;
        bonusPoints = per.bonusPoints;
        totalPoints = per.totalPoints;
      } else if (subType === "bracket") {
        const per = scoreBracketPerPick(
          pred as { picks?: Record<string, string> },
          resolution as { winners?: Record<string, string> },
          teamByCode,
          settings,
          totalPool,
          memberCount
        );
        isCorrect = per.totalPoints > 0;
        basePoints = per.basePoints;
        bonusPoints = per.bonusPoints;
        totalPoints = per.totalPoints;
      } else {
        const { isCorrect: ic, impliedProbability } = checkBetCorrectness(
          subType,
          pred,
          resolution,
          tournamentId
        );
        const pts = calculatePoints(ic, subType, impliedProbability, settings, "GROUP", totalPool, memberCount);
        isCorrect = ic;
        basePoints = pts.basePoints;
        bonusPoints = pts.bonusPoints;
        totalPoints = pts.totalPoints;
      }

      await db.bet.update({
        where: { id: bet.id },
        data: {
          isCorrect,
          basePoints,
          bonusPoints,
          totalPoints,
          scoredAt: new Date(),
        },
      });
    }
  }
}

/**
 * Per-slot additive scoring for group_predictions.
 * Each of 12 winner slots and up to 20 qualifier slots is scored independently.
 * Per-slot award (if correct) = potentialPoints(subType, slotOdds) * slotShare,
 * where slotShare = 0.6/12 for winners and 0.4/20 for qualifiers.
 * This matches the per-team display in the UI exactly, so the sum of visible
 * badges equals the awarded total.
 */
function scoreGroupPredictionsPerSlot(
  prediction: Record<string, string[]>,
  resolution: { winners?: Record<string, string>; advancing?: string[] },
  teamByCode: Record<string, { code: string; odds: unknown; groupLetter?: string } | undefined>,
  settings: GroupSettings,
  totalPool: number,
  memberCount: number
): { basePoints: number; bonusPoints: number; totalPoints: number } {
  const actualWinners = resolution.winners ?? {};
  const actualAdvancing = new Set(resolution.advancing ?? []);

  const groupLetters = new Set<string>();
  for (const t of Object.values(teamByCode)) {
    if (t?.groupLetter) groupLetters.add(t.groupLetter);
  }
  const WINNER_GROUPS = groupLetters.size || 12;
  const QUALIFIER_SLOTS = 20;
  const WINNER_SHARE = 0.6 / WINNER_GROUPS;
  const QUALIFIER_SHARE = 0.4 / QUALIFIER_SLOTS;

  let base = 0;
  let bonus = 0;
  let total = 0;

  for (const [letter, picks] of Object.entries(prediction)) {
    if (!picks || picks.length === 0) continue;

    const winnerPick = picks[0];
    const advancerPicks = picks.slice(1);

    if (winnerPick && actualWinners[letter] === winnerPick) {
      const odds = teamOddsForGroupWinner(teamByCode[winnerPick]?.odds);
      const pts = calculatePoints(true, "group_predictions", impliedProb(odds), settings, "GROUP", totalPool, memberCount);
      base += pts.basePoints * WINNER_SHARE;
      bonus += pts.bonusPoints * WINNER_SHARE;
      total += pts.totalPoints * WINNER_SHARE;
    }

    for (const code of advancerPicks) {
      if (!code) continue;
      if (actualAdvancing.has(code)) {
        const odds = teamOddsForQualify(teamByCode[code]?.odds);
        const pts = calculatePoints(true, "group_predictions", impliedProb(odds), settings, "GROUP", totalPool, memberCount);
        base += pts.basePoints * QUALIFIER_SHARE;
        bonus += pts.bonusPoints * QUALIFIER_SHARE;
        total += pts.totalPoints * QUALIFIER_SHARE;
      }
    }
  }

  const round = (n: number) => parseFloat(n.toFixed(2));
  return {
    basePoints: round(base),
    bonusPoints: round(bonus),
    totalPoints: round(total),
  };
}

function teamOddsForGroupWinner(odds: unknown): number {
  return (odds as { groupWinnerOdds?: number } | null)?.groupWinnerOdds ?? 300;
}
function teamOddsForQualify(odds: unknown): number {
  return (odds as { qualifyOdds?: number } | null)?.qualifyOdds ?? 150;
}
function teamOddsForWinner(odds: unknown): number {
  return (odds as { winnerOdds?: number } | null)?.winnerOdds ?? 1000;
}

// Phase weights for bracket per-pick scoring. Higher weight = a correct pick in that round
// is worth more (matches the spirit of knockout multipliers used by per-game bets).
export const BRACKET_PHASE_WEIGHTS: Record<string, number> = {
  R32: 1.2,
  R16: 1.3,
  QF: 1.5,
  SF: 1.7,
  FINAL: 2.0,
};
// 16·1.2 + 8·1.3 + 4·1.5 + 2·1.7 + 1·2.0 = 41.0 — used to normalize per-pick shares so the
// max bracket payout (every pick correct, all underdogs) stays within the tier allocation.
export const BRACKET_TOTAL_WEIGHT = 41.0;

export function bracketSlotShare(phase: string): number {
  return (BRACKET_PHASE_WEIGHTS[phase] ?? 1) / BRACKET_TOTAL_WEIGHT;
}

/**
 * Per-pick award for the bracket bet.
 *
 * The bracket has a fixed sub-pool (totalPool × tournamentBets weight × bracket sub-weight,
 * default 75 pts). That pool is split across the 31 knockout slots by phase weight (later
 * rounds worth more). Within a slot, the share is allocated as base + odds-scaled bonus,
 * with the bonus factor capped at 1 so the *maximum* possible bracket payout (every pick
 * correct, all longshots) equals the sub-pool — keeping the bracket within its admin allocation.
 */
function bracketPickAward(
  phase: string,
  teamWinnerOdds: number,
  settings: GroupSettings
): { basePoints: number; bonusPoints: number; totalPoints: number } {
  const tierKey = "tournamentBets" as const;
  const tierPool = (settings.totalPool ?? 1000) * settings.tierWeights[tierKey];
  const subWeight = (settings.subWeights[tierKey] as Record<string, number>).bracket ?? 0;
  const subPool = tierPool * subWeight;

  const perPickAllocation = subPool * bracketSlotShare(phase);
  const basePct = (settings.basePct as Record<string, number>).bracket ?? 0.25;
  const threshold = (settings.outlierThresholds as Record<string, number>).bracket ?? 100000;
  // Normalize the odds scaler against its value at the outlier threshold so bonusFactor ∈ [0, 1].
  // A team picked at threshold-or-longer odds maxes out the slot; favorites get only the base share.
  const scaler = oddsScaler(impliedProb(teamWinnerOdds), threshold, 30);
  const maxScaler = oddsScaler(1 / threshold, threshold, 30);
  const bonusFactor = Math.min(scaler / Math.max(maxScaler, 1e-6), 1);

  const basePoints = perPickAllocation * basePct;
  const bonusPoints = perPickAllocation * (1 - basePct) * bonusFactor;
  return {
    basePoints,
    bonusPoints,
    totalPoints: basePoints + bonusPoints,
  };
}

export function bracketPickPotential(
  phase: string,
  teamWinnerOdds: number,
  settings: GroupSettings,
  _totalPool: number,
  _memberCount: number
): number {
  return bracketPickAward(phase, teamWinnerOdds, settings).totalPoints;
}

/**
 * Per-pick additive scoring for bracket.
 * Each correct pick (slotKey -> teamCode) earns calculatePoints(odds_of_picked_team)
 * scaled by the phase weight share. Sum of all 31 max-bonus picks ≈ tournament tier
 * allocation, so longshots in late rounds dominate the leaderboard.
 */
export function scoreBracketPerPick(
  prediction: { picks?: Record<string, string> },
  resolution: { winners?: Record<string, string> },
  teamByCode: Record<string, { code: string; odds: unknown } | undefined>,
  settings: GroupSettings,
  _totalPool: number,
  _memberCount: number
): { basePoints: number; bonusPoints: number; totalPoints: number } {
  const picks = prediction.picks ?? {};
  const winners = resolution.winners ?? {};

  let base = 0;
  let bonus = 0;
  let total = 0;

  for (const [slotKey, winnerCode] of Object.entries(winners)) {
    const pickedCode = picks[slotKey];
    if (!pickedCode || pickedCode !== winnerCode) continue;
    const phase = slotKey.split("-")[0];
    const odds = teamOddsForWinner(teamByCode[pickedCode]?.odds);
    const pts = bracketPickAward(phase, odds, settings);
    base += pts.basePoints;
    bonus += pts.bonusPoints;
    total += pts.totalPoints;
  }

  const round = (n: number) => parseFloat(n.toFixed(2));
  return {
    basePoints: round(base),
    bonusPoints: round(bonus),
    totalPoints: round(total),
  };
}


/** Determine if a tournament bet is correct */
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
      // prediction.odds stores the team's qualifyOdds for this bet type.
      // A favourite has low qualifyOdds → invert so being knocked out is the long shot.
      const qualifyOdds = (prediction.odds as number) ?? 150;
      const invertedOdds = Math.max(1, 400000 / qualifyOdds);
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

    case "bracket": {
      // Bracket is scored per-pick via scoreBracketPerPick (uses team odds + phase weight).
      // This case is only reached if per-pick scoring isn't wired (e.g. legacy callers); keep
      // a partial-credit fallback so resolution still produces something sensible.
      const picks = (prediction.picks as Record<string, string>) ?? {};
      const winners = (resolution.winners as Record<string, string>) ?? {};
      let correct = 0;
      let total = 0;
      for (const [slotKey, winnerCode] of Object.entries(winners)) {
        total++;
        if (picks[slotKey] === winnerCode) correct++;
      }
      const partialScore = total > 0 ? correct / total : 0;
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
