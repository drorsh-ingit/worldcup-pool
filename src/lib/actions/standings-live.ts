"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchLiveMatch, type FDMatch } from "@/lib/football-data";
import { fetchEspnLiveMatch } from "@/lib/espn-live";
import { calculatePoints } from "@/lib/scoring";
import { deriveMatchOdds, deriveScoreOdds } from "@/lib/match-odds";
import { resolveGroupSettings, DEFAULT_GROUP_SETTINGS } from "@/lib/settings";

export interface LiveDeltasResult {
  deltas: Record<string, number>;
  inPlayCount: number;
}

// Short-TTL cache keyed by groupId so multiple viewers polling at the same time
// share one fd-org + ESPN fetch round-trip. 20s is well under the per-card 60s
// poll cadence and matches typical attention spans for goals.
const CACHE_TTL_MS = 20_000;
const deltasCache = new Map<string, { fetchedAt: number; result: LiveDeltasResult }>();

function impliedProb(odds: number): number {
  return 1 / Math.max(odds, 1);
}

/**
 * Compute provisional per-user points for matches that have kicked off but
 * haven't been marked COMPLETED. Mirrors the per-game branch of scoreBets,
 * but driven by live score (fd-org → ESPN fallback) and stays in-memory —
 * no DB writes, no autocomplete side-effects.
 */
export async function getLiveStandingsDeltas(groupId: string): Promise<LiveDeltasResult> {
  const session = await auth();
  if (!session) return { deltas: {}, inPlayCount: 0 };

  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.status !== "APPROVED") {
    return { deltas: {}, inPlayCount: 0 };
  }

  const cached = deltasCache.get(groupId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.result;

  const group = await db.group.findUnique({ where: { id: groupId } });
  const settings = resolveGroupSettings(group?.settings);
  const totalPool = settings.totalPool ?? 1000;

  const tournament = await db.tournament.findFirst({
    where: { groupId },
    select: { id: true },
  });
  if (!tournament) return { deltas: {}, inPlayCount: 0 };

  const now = new Date();
  // Window: kicked off, not yet marked COMPLETED, and within a 4h tail so a
  // truly stuck-UPCOMING match from days ago doesn't get probed every poll.
  const tailCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  const inPlayMatches = await db.match.findMany({
    where: {
      tournamentId: tournament.id,
      status: { not: "COMPLETED" },
      kickoffAt: { lte: now, gte: tailCutoff },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      bets: {
        where: { betType: { subType: { in: ["match_winner", "correct_score"] } } },
        include: { betType: true },
      },
    },
  });

  const liveData = await Promise.all(
    inPlayMatches.map(async (m) => {
      if (!m.externalId) return null;

      let fdMatch: FDMatch | null = null;
      try {
        fdMatch = await fetchLiveMatch(parseInt(m.externalId));
      } catch {
        // ignore, fall through to ESPN
      }

      let home: number | null = null;
      let away: number | null = null;

      const fdIsActive = fdMatch?.status === "IN_PLAY" || fdMatch?.status === "PAUSED";
      if (fdIsActive) {
        home = fdMatch!.score.fullTime.home ?? fdMatch!.score.halfTime.home ?? null;
        away = fdMatch!.score.fullTime.away ?? fdMatch!.score.halfTime.away ?? null;
      }

      // ESPN fallback when fd is still pre-game or didn't produce a live score
      if (home == null || away == null) {
        const espn = await fetchEspnLiveMatch(m.homeTeam.code, m.awayTeam.code, m.kickoffAt);
        if (espn && (espn.status === "IN_PLAY" || espn.status === "PAUSED")) {
          home = espn.home;
          away = espn.away;
        }
      }

      if (home == null || away == null) return null;
      return { match: m, home, away };
    })
  );

  const deltas: Record<string, number> = {};
  let inPlayCount = 0;

  for (const entry of liveData) {
    if (!entry) continue;
    inPlayCount++;
    const { match, home, away } = entry;
    const liveOutcome = home > away ? "home" : away > home ? "away" : "draw";

    const homeOdds = (match.homeTeam.odds as { winnerOdds?: number } | null)?.winnerOdds ?? 1000;
    const awayOdds = (match.awayTeam.odds as { winnerOdds?: number } | null)?.winnerOdds ?? 1000;
    const phase = match.phase as keyof typeof DEFAULT_GROUP_SETTINGS["knockoutMultipliers"];

    for (const bet of match.bets) {
      const pred = bet.prediction as Record<string, unknown>;
      let isCorrect = false;
      let impliedProbability = 0.1;

      if (bet.betType.subType === "match_winner") {
        isCorrect = pred.outcome === liveOutcome;
        if (!isCorrect) continue;
        const oddsData = match.oddsData as Record<string, number>;
        const oddsKey = liveOutcome === "home" ? "homeWin" : liveOutcome === "away" ? "awayWin" : "draw";
        const derived = deriveMatchOdds(homeOdds, awayOdds);
        const fallback =
          oddsKey === "homeWin" ? derived.homeWin : oddsKey === "awayWin" ? derived.awayWin : derived.draw;
        impliedProbability = impliedProb(oddsData[oddsKey] ?? fallback);
      } else {
        // correct_score
        isCorrect = Number(pred.homeScore) === home && Number(pred.awayScore) === away;
        if (!isCorrect) continue;
        const oddsData = match.oddsData as Record<string, Record<string, number>>;
        const clampedHome = Math.min(Number(pred.homeScore), 6);
        const clampedAway = Math.min(Number(pred.awayScore), 6);
        const scoreKey = `${clampedHome}-${clampedAway}`;
        const storedOdds = oddsData.correctScores?.[scoreKey];
        const rawOdds =
          storedOdds ??
          (() => {
            const derived = deriveScoreOdds(homeOdds, awayOdds);
            return derived[scoreKey] ?? 1500;
          })();
        impliedProbability = impliedProb(rawOdds);
      }

      const pts = calculatePoints(true, bet.betType.subType, impliedProbability, settings, phase, totalPool);
      deltas[bet.userId] = (deltas[bet.userId] ?? 0) + pts.totalPoints;
    }
  }

  const result: LiveDeltasResult = { deltas, inPlayCount };
  deltasCache.set(groupId, { fetchedAt: Date.now(), result });
  return result;
}
