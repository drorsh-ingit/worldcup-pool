"use server";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { fetchTournamentWinnerOdds, fetchMatchOdds, isConfigured } from "@/lib/odds-api";
import { deriveScoreOdds, impliedTotalGoals } from "@/lib/match-odds";

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

  await db.$transaction(
    teams.map((team) => {
      const liveOdds = live[team.name];
      if (liveOdds == null) {
        return db.team.update({ where: { id: team.id }, data: {} }); // no-op
      }
      updated++;
      const existing = (team.odds as Record<string, unknown>) ?? {};
      const merged = { ...existing, winnerOdds: Math.round(liveOdds * 100) / 100 };
      return db.team.update({
        where: { id: team.id },
        data: { odds: merged as unknown as Prisma.InputJsonValue },
      });
    })
  );

  return { refreshed: true, updated };
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

  const updates: Prisma.PrismaPromise<unknown>[] = [];
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

    updates.push(
      db.match.update({
        where: { id: m.id },
        data: { oddsData: oddsData as unknown as Prisma.InputJsonValue },
      })
    );
    updated++;
  }

  if (updates.length > 0) await db.$transaction(updates);
  return { refreshed: true, updated };
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
    if (category === "PRE_TOURNAMENT" && subType === "winner") {
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
