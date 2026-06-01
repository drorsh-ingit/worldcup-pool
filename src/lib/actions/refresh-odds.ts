"use server";

import { db } from "@/lib/db";
import { Prisma, BetCategory } from "@prisma/client";
import { fetchTournamentWinnerOdds, fetchMatchOdds, isConfigured } from "@/lib/odds-api";
import { deriveScoreOdds, impliedTotalGoals } from "@/lib/match-odds";
import { WC2026_API_NAME_TO_CODE, GOLDEN_BALL_CANDIDATES, GOLDEN_GLOVE_CANDIDATES, GOLDEN_BOOT_CANDIDATES } from "@/lib/data/wc2026";

interface RefreshResult {
  refreshed: boolean;
  reason?: string;
  updated?: number;
}

/**
 * Pull tournament-winner odds from The Odds API and update Team.odds.winnerOdds
 * for every team in the tournament. Silently no-ops if API key is missing or
 * the market isn't posted yet.
 */
export async function refreshTournamentWinnerOdds(tournamentId: string): Promise<RefreshResult> {
  if (!isConfigured()) return { refreshed: false, reason: "ODDS_API_KEY not set" };

  const live = await fetchTournamentWinnerOdds();
  if (!live) return { refreshed: false, reason: "No outright market available yet" };

  const teams = await db.team.findMany({ where: { tournamentId } });
  let updated = 0;

  // Build reverse lookup: API team name → decimal odds
  // API names sometimes differ from our team.name — WC2026_API_NAME_TO_CODE handles those.
  const liveByCode: Record<string, number> = {};
  for (const [apiName, decimalOdds] of Object.entries(live)) {
    const code = WC2026_API_NAME_TO_CODE[apiName] ?? null;
    if (code) {
      liveByCode[code] = decimalOdds;
    } else {
      // Fall back to exact name match (most teams match directly)
      liveByCode[`name:${apiName}`] = decimalOdds;
    }
  }

  // First pass: update winnerOdds from live API data
  const teamsWithLive = teams.map((team) => {
    const liveOdds = liveByCode[team.code] ?? liveByCode[`name:${team.name}`] ?? null;
    const existing = (team.odds as Record<string, unknown>) ?? {};
    if (liveOdds != null) {
      updated++;
      return { ...team, odds: { ...existing, winnerOdds: Math.round(liveOdds * 100) } };
    }
    return { ...team, odds: existing };
  });

  // Second pass: derive groupWinnerOdds and qualifyOdds using Bradley-Terry model.
  // Groups teams by groupLetter, computes relative strengths, then simulates
  // group-stage outcomes to get win-group and qualify (top-2-in-group) probabilities.
  const derived = deriveGroupOdds(teamsWithLive);

  // Update teams individually (no wrapping transaction) to avoid deadlocks when
  // concurrent page loads both trigger odds refresh. Each update is idempotent
  // so partial completion is harmless.
  for (const team of teamsWithLive) {
    const groupOdds = derived[team.code];
    const merged = {
      ...team.odds,
      ...(groupOdds ?? {}),
    };
    await db.team.update({
      where: { id: team.id },
      data: { odds: merged as unknown as Prisma.InputJsonValue },
    });
  }

  return { refreshed: true, updated };
}

/**
 * Bradley-Terry derivation of groupWinnerOdds and qualifyOdds from winnerOdds.
 *
 * The Odds API only provides tournament-winner outright odds. We derive the
 * two group-stage odds (win group, qualify from group) by:
 *  1. Computing a relative "strength" for each team: s_i = (100 / winnerOdds_i)^α
 *     where α = 0.5 flattens the power gap (a 100x favourite isn't 100x stronger in a group).
 *  2. Within each 4-team group, running a round-robin simulation using pairwise
 *     Bradley-Terry win probabilities: P(i beats j) = s_i / (s_i + s_j).
 *  3. Enumerating all possible group outcomes (3^6 = 729 for 6 matches between 4 teams)
 *     to compute P(win group) and P(top 2 = qualify) for each team.
 *  4. Converting probabilities back to odds × 100 format.
 *
 * This produces reasonable odds that move in lockstep with the live winner market.
 */
function deriveGroupOdds(
  teams: { code: string; groupLetter: string; odds: Record<string, unknown> }[]
): Record<string, { groupWinnerOdds: number; qualifyOdds: number }> {
  const ALPHA = 0.5;
  const result: Record<string, { groupWinnerOdds: number; qualifyOdds: number }> = {};

  // Group teams by letter
  const groups: Record<string, typeof teams> = {};
  for (const t of teams) {
    if (!t.groupLetter) continue;
    if (!groups[t.groupLetter]) groups[t.groupLetter] = [];
    groups[t.groupLetter].push(t);
  }

  for (const groupTeams of Object.values(groups)) {
    if (groupTeams.length < 2) continue;

    // Compute strengths
    const strengths: Record<string, number> = {};
    for (const t of groupTeams) {
      const wo = (t.odds.winnerOdds as number) ?? 100000;
      strengths[t.code] = Math.pow(100 / Math.max(wo, 1), ALPHA);
    }

    // For a 4-team group, enumerate all 3^6 = 729 outcomes of 6 pairwise matches.
    // Each match has 3 outcomes: team i wins, draw, team j wins.
    // Points: win=3, draw=1, loss=0.
    const codes = groupTeams.map((t) => t.code);
    const n = codes.length;
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairs.push([i, j]);
      }
    }

    // Pairwise probabilities: P(i beats j), P(draw), P(j beats i)
    // Draw probability ~ 25% for group matches, adjusted slightly by strength gap
    const pairProbs: { pWin: number; pDraw: number; pLoss: number }[] = [];
    for (const [i, j] of pairs) {
      const si = strengths[codes[i]];
      const sj = strengths[codes[j]];
      const rawP = si / (si + sj); // Bradley-Terry P(i beats j)
      // Allocate ~25% base draw probability, slightly less for lopsided matchups
      const gap = Math.abs(rawP - 0.5);
      const drawProb = Math.max(0.15, 0.28 - 0.3 * gap);
      const pWin = rawP * (1 - drawProb);
      const pLoss = (1 - rawP) * (1 - drawProb);
      pairProbs.push({ pWin, pDraw: drawProb, pLoss });
    }

    // Accumulate probabilities for each team finishing in each position
    const winGroupProb: Record<string, number> = {};
    const qualifyProb: Record<string, number> = {};
    for (const code of codes) {
      winGroupProb[code] = 0;
      qualifyProb[code] = 0;
    }

    // Enumerate all outcomes: each match has 3 possible results
    const totalCombos = Math.pow(3, pairs.length);
    for (let combo = 0; combo < totalCombos; combo++) {
      // Decode combo into per-match outcomes (0=i wins, 1=draw, 2=j wins)
      const points = new Array(n).fill(0);
      let prob = 1;
      let temp = combo;
      for (let m = 0; m < pairs.length; m++) {
        const outcome = temp % 3;
        temp = Math.floor(temp / 3);
        const [i, j] = pairs[m];
        const pp = pairProbs[m];
        if (outcome === 0) {
          points[i] += 3;
          prob *= pp.pWin;
        } else if (outcome === 1) {
          points[i] += 1;
          points[j] += 1;
          prob *= pp.pDraw;
        } else {
          points[j] += 3;
          prob *= pp.pLoss;
        }
      }

      if (prob < 1e-12) continue; // skip negligible

      // Rank by points (ties broken by strength as proxy for goal difference)
      const ranked = codes
        .map((code, idx) => ({ code, pts: points[idx], str: strengths[code] }))
        .sort((a, b) => b.pts - a.pts || b.str - a.str);

      winGroupProb[ranked[0].code] += prob;
      // Top 2 qualify (FIFA 2026: top 2 from each group of 4, plus best 3rds — we approximate as top 2)
      qualifyProb[ranked[0].code] += prob;
      qualifyProb[ranked[1].code] += prob;
    }

    // Convert to odds × 100 format: odds = 100 / probability
    for (const t of groupTeams) {
      const wp = winGroupProb[t.code];
      const qp = qualifyProb[t.code];
      result[t.code] = {
        groupWinnerOdds: Math.round(100 / Math.max(wp, 0.005)),
        qualifyOdds: Math.round(100 / Math.max(qp, 0.005)),
      };
    }
  }

  return result;
}

/**
 * Pull match h2h odds from The Odds API and update Match.oddsData for every
 * match in the tournament that we can match by team name + kickoff date.
 * Also derives correct-score odds from the refreshed h2h prices.
 */
export async function refreshAllMatchOdds(tournamentId: string): Promise<RefreshResult> {
  if (!isConfigured()) return { refreshed: false, reason: "ODDS_API_KEY not set" };

  const live = await fetchMatchOdds();
  if (!live) return { refreshed: false, reason: "No match odds available yet" };

  const matches = await db.match.findMany({
    where: { tournamentId, status: "UPCOMING" },
    include: { homeTeam: true, awayTeam: true },
  });

  let updated = 0;

  for (const m of matches) {
    const key = `${m.homeTeam.name}__${m.awayTeam.name}`;
    const live1 = live[key];
    if (!live1) continue;

    // Sanity check kickoff within 24h so we don't cross-wire a future rematch.
    const apiTime = new Date(live1.commenceTime).getTime();
    if (Math.abs(apiTime - m.kickoffAt.getTime()) > 24 * 60 * 60 * 1000) continue;

    // Back expected-total-goals out of the over/under line if we have one;
    // otherwise fall back to the static WC-average 2.6.
    const avgGoals =
      live1.overUnderLine != null && live1.overProb != null
        ? impliedTotalGoals(live1.overUnderLine, live1.overProb)
        : undefined;

    const correctScores = deriveScoreOdds(live1.homeWin, live1.awayWin, 6, avgGoals);

    const oddsData = {
      homeWin: Math.round(live1.homeWin * 100) / 100,
      draw: Math.round(live1.draw * 100) / 100,
      awayWin: Math.round(live1.awayWin * 100) / 100,
      expectedGoals: avgGoals != null ? Math.round(avgGoals * 100) / 100 : null,
      correctScores,
      source: "the-odds-api",
      fetchedAt: new Date().toISOString(),
    };

    await db.match.update({
      where: { id: m.id },
      data: { oddsData: oddsData as unknown as Prisma.InputJsonValue },
    });
    updated++;
  }

  return { refreshed: true, updated };
}

/**
 * Snapshot relevant odds for a bet type at the moment it opens.
 * Result is stored on BetType.frozenOdds and used for display + scoring,
 * so that future Team.odds refreshes don't change points for bets already in flight.
 *
 * For tournament bets: snapshots all team odds (winnerOdds, groupWinnerOdds, qualifyOdds).
 * For per-game / curated: returns null — those use per-Match oddsData / per-bet captured odds.
 */
export async function snapshotOddsForBetType(
  tournamentId: string,
  category: string,
  subType?: string
): Promise<Prisma.InputJsonValue | null> {
  if (category !== "TOURNAMENT") return null;

  // For player-award bets, snapshot the current candidate list sorted by odds.
  // There is no live API for these markets, so we freeze the static list at open time
  // so future edits to the data file don't affect already-open bets.
  if (subType === "golden_ball") {
    const candidates = [...GOLDEN_BALL_CANDIDATES].sort((a, b) => a.odds - b.odds);
    return { candidates } as unknown as Prisma.InputJsonValue;
  }
  if (subType === "golden_glove") {
    const candidates = [...GOLDEN_GLOVE_CANDIDATES].sort((a, b) => a.odds - b.odds);
    return { candidates } as unknown as Prisma.InputJsonValue;
  }
  if (subType === "golden_boot") {
    const candidates = [...GOLDEN_BOOT_CANDIDATES].sort((a, b) => a.odds - b.odds);
    return { candidates } as unknown as Prisma.InputJsonValue;
  }

  const teams = await db.team.findMany({
    where: { tournamentId },
    select: { code: true, odds: true },
  });

  const teamsByCode: Record<string, unknown> = {};
  for (const t of teams) {
    teamsByCode[t.code] = t.odds;
  }

  return { teams: teamsByCode } as unknown as Prisma.InputJsonValue;
}

/**
 * Called before a bet type transitions to OPEN. Refreshes the odds most
 * relevant to that bet type's market. Never throws — odds refresh is
 * best-effort; callers proceed even on failure.
 */
export async function refreshOddsForBetType(
  tournamentId: string,
  category: string,
  subType: string
): Promise<RefreshResult> {
  try {
    // All TOURNAMENT bet types ultimately depend on team odds (winnerOdds,
    // groupWinnerOdds, qualifyOdds), so refresh the outright market for any
    // tournament-level bet — not just "winner". The derivation step inside
    // refreshTournamentWinnerOdds computes group/qualify odds from the live
    // winner market, benefiting group_predictions, semifinalists, dark_horse, etc.
    if (category === "TOURNAMENT") {
      return await refreshTournamentWinnerOdds(tournamentId);
    }
    if (category === "PER_GAME") {
      return await refreshAllMatchOdds(tournamentId);
    }
    return { refreshed: false, reason: "No odds source for this bet type" };
  } catch (err) {
    console.error("[refresh-odds] failed:", err);
    return { refreshed: false, reason: "Refresh threw — see logs" };
  }
}

/**
 * Atomically promote a bet subType across ALL groups running the same tournament kind.
 *
 * Flow:
 *  1. Fetch live odds (one API call, cached for 30 min)
 *  2. Snapshot/freeze the odds for this bet subType
 *  3. Mark every matching DRAFT bet type as OPEN with the frozen snapshot
 *
 * This ensures all groups see identical frozen odds and open at the same time,
 * regardless of which group's page load triggered the promotion.
 */
export async function promoteBetTypeGlobally(
  triggeringTournamentId: string,
  tournamentKind: string,
  betType: { category: string; subType: string; opensAt: Date | null },
  options?: { skipRefresh?: boolean }
): Promise<void> {
  let frozen: Prisma.InputJsonValue | null = null;

  if (betType.category === "TOURNAMENT") {
    if (!options?.skipRefresh) {
      // Refresh odds on the triggering tournament's teams (API fetch + Bradley-Terry derivation).
      await refreshOddsForBetType(triggeringTournamentId, betType.category, betType.subType).catch(() => null);
    }
    // Snapshot the refreshed odds.
    frozen = await snapshotOddsForBetType(triggeringTournamentId, betType.category, betType.subType);
  } else if (betType.category === "PER_GAME") {
    if (!options?.skipRefresh) {
      // Match odds are per-tournament (different groups may have different match schedules
      // in theory), so refresh each tournament's matches individually.
      const tournaments = await db.tournament.findMany({
        where: { kind: tournamentKind },
        select: { id: true },
      });
      for (const t of tournaments) {
        await refreshOddsForBetType(t.id, betType.category, betType.subType).catch(() => null);
      }
    }
  }

  // Find all DRAFT bet types of this subType across all groups with the same tournament kind,
  // and promote them all at once with the same frozen odds.
  await db.betType.updateMany({
    where: {
      subType: betType.subType,
      category: betType.category as BetCategory,
      status: "DRAFT",
      tournament: { kind: tournamentKind },
    },
    data: {
      status: "OPEN",
      ...(frozen != null && { frozenOdds: frozen }),
    },
  });
}
