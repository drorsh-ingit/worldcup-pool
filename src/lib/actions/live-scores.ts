"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { fetchWCSchedule, fetchLiveMatch } from "@/lib/football-data";
import { scoreBets } from "@/lib/scoring";
import { recalculateLeaderboard } from "@/lib/actions/results";

async function requireAdmin(groupId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") throw new Error("Not authorized");
}

// TLA overrides where football-data.org differs from FIFA codes — extend as needed
const FD_TLA_TO_FIFA: Record<string, string> = {};

export async function syncFixtureIds(
  groupId: string
): Promise<{ success?: boolean; synced?: number; error?: string }> {
  try {
    await requireAdmin(groupId);
  } catch {
    return { error: "Not authorized" };
  }

  const tournament = await db.tournament.findFirst({
    where: { groupId },
    include: { matches: { include: { homeTeam: true, awayTeam: true } } },
  });
  if (!tournament) return { error: "No tournament found" };

  let fdMatches;
  try {
    fdMatches = await fetchWCSchedule();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch schedule" };
  }

  let synced = 0;

  for (const match of tournament.matches) {
    const homeCode = FD_TLA_TO_FIFA[match.homeTeam.code] ?? match.homeTeam.code;
    const awayCode = FD_TLA_TO_FIFA[match.awayTeam.code] ?? match.awayTeam.code;

    const fdMatch = fdMatches.find(
      (m) =>
        (m.homeTeam.tla === homeCode ||
          (m.homeTeam.name?.toLowerCase().includes(match.homeTeam.name.toLowerCase()) ?? false)) &&
        (m.awayTeam.tla === awayCode ||
          (m.awayTeam.name?.toLowerCase().includes(match.awayTeam.name.toLowerCase()) ?? false))
    );

    if (fdMatch) {
      await db.match.update({
        where: { id: match.id },
        data: { externalId: String(fdMatch.id) },
      });
      synced++;
    }
  }

  revalidatePath(`/group/${groupId}/admin`);
  return { success: true, synced };
}

export interface LiveScore {
  home: number | null;
  away: number | null;
  status: "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "OTHER";
  minute: number | null;
}

export async function getLiveMatchScore(
  groupId: string,
  matchId: string
): Promise<{ data?: LiveScore; error?: string }> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { tournament: { select: { groupId: true } } },
  });
  if (!match || match.tournament.groupId !== groupId) return { error: "Not found" };
  if (!match.externalId) return { error: "Not linked" };

  let fdMatch;
  try {
    fdMatch = await fetchLiveMatch(parseInt(match.externalId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fetch failed" };
  }

  // During IN_PLAY/PAUSED use fullTime (updated live); fall back to halfTime
  const isActive = fdMatch.status === "IN_PLAY" || fdMatch.status === "PAUSED";
  const currentHome = isActive
    ? (fdMatch.score.fullTime.home ?? fdMatch.score.halfTime.home)
    : fdMatch.score.fullTime.home;
  const currentAway = isActive
    ? (fdMatch.score.fullTime.away ?? fdMatch.score.halfTime.away)
    : fdMatch.score.fullTime.away;

  const knownStatuses = ["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "FINISHED"] as const;
  const liveScore: LiveScore = {
    home: currentHome,
    away: currentAway,
    status: (knownStatuses as readonly string[]).includes(fdMatch.status)
      ? (fdMatch.status as LiveScore["status"])
      : "OTHER",
    minute: fdMatch.minute ?? null,
  };

  // Auto-complete when API says FINISHED and our DB hasn't recorded it yet
  if (
    fdMatch.status === "FINISHED" &&
    match.status !== "COMPLETED" &&
    currentHome !== null &&
    currentAway !== null
  ) {
    await autoCompleteMatch(groupId, matchId, match.tournamentId, currentHome, currentAway);
  }

  return { data: liveScore };
}

async function autoCompleteMatch(
  groupId: string,
  matchId: string,
  tournamentId: string,
  homeScore: number,
  awayScore: number
) {
  // Guard against concurrent calls
  const current = await db.match.findUnique({ where: { id: matchId }, select: { status: true } });
  if (current?.status === "COMPLETED") return;

  await db.match.update({
    where: { id: matchId },
    data: { actualHomeScore: homeScore, actualAwayScore: awayScore, status: "COMPLETED" },
  });

  await scoreBets(groupId, tournamentId, matchId);
  await recalculateLeaderboard(groupId, tournamentId);
  revalidatePath(`/group/${groupId}`);
}
