"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { scoreBets } from "@/lib/scoring";
import { z } from "zod";

async function requireAdmin(groupId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") throw new Error("Not authorized");
}

const enterResultSchema = z.object({
  matchId: z.string().cuid(),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
});

/**
 * Enter the result for a match, mark it COMPLETED,
 * score all per-game bets, and update the leaderboard.
 */
export async function enterMatchResult(groupId: string, input: unknown) {
  await requireAdmin(groupId);

  const parsed = enterResultSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { matchId, homeScore, awayScore } = parsed.data;

  // Get match + tournament
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { tournament: { include: { group: true } } },
  });
  if (!match) return { error: "Match not found" };
  if (match.tournament.groupId !== groupId) return { error: "Match not in this group" };

  // Update match result
  await db.match.update({
    where: { id: matchId },
    data: {
      actualHomeScore: homeScore,
      actualAwayScore: awayScore,
      status: "COMPLETED",
    },
  });

  // Score all per-game bets for this match
  await scoreBets(groupId, match.tournamentId, matchId);

  // Recalculate leaderboard
  await recalculateLeaderboard(groupId, match.tournamentId);

  revalidatePath(`/group/${groupId}`);
  revalidatePath(`/group/${groupId}/bets`);
  revalidatePath(`/group/${groupId}/admin`);

  return { success: true };
}

/**
 * Score and resolve a pre-tournament/milestone/curated bet type.
 * Called after resolveBetType sets the resolution.
 */
export async function scoreResolvedBetType(
  groupId: string,
  tournamentId: string,
  betTypeId: string
) {
  await requireAdmin(groupId);
  await scoreBets(groupId, tournamentId, null, betTypeId);
  await recalculateLeaderboard(groupId, tournamentId);

  revalidatePath(`/group/${groupId}`);
  revalidatePath(`/group/${groupId}/admin`);

  return { success: true };
}

/**
 * Recalculate and persist leaderboard entries for all approved members.
 */
export async function recalculateLeaderboard(groupId: string, tournamentId: string) {
  const members = await db.groupMembership.findMany({
    where: { groupId, status: "APPROVED" },
    select: { userId: true },
  });

  for (const { userId } of members) {
    const bets = await db.bet.findMany({
      where: { userId, tournamentId, scoredAt: { not: null } },
      include: { betType: true },
    });

    let preTournamentPts = 0;
    let perGamePts = 0;
    let milestonePts = 0;
    let curatedPts = 0;
    let correctBets = 0;

    for (const bet of bets) {
      const pts = bet.totalPoints ?? 0;
      if (bet.betType.category === "PRE_TOURNAMENT") preTournamentPts += pts;
      else if (bet.betType.category === "PER_GAME") perGamePts += pts;
      else if (bet.betType.category === "MILESTONE") milestonePts += pts;
      else if (bet.betType.category === "CURATED") curatedPts += pts;
      if (bet.isCorrect) correctBets++;
    }

    const totalPoints = preTournamentPts + perGamePts + milestonePts + curatedPts;

    await db.leaderboardEntry.upsert({
      where: { userId_groupId_tournamentId: { userId, groupId, tournamentId } },
      create: {
        userId,
        groupId,
        tournamentId,
        totalPoints,
        preTournamentPts,
        perGamePts,
        milestonePts,
        curatedPts,
        correctBets,
        totalBets: bets.length,
        rank: 0,
      },
      update: {
        totalPoints,
        preTournamentPts,
        perGamePts,
        milestonePts,
        curatedPts,
        correctBets,
        totalBets: bets.length,
      },
    });
  }

  // Update ranks
  const entries = await db.leaderboardEntry.findMany({
    where: { groupId, tournamentId },
    orderBy: { totalPoints: "desc" },
  });

  await Promise.all(
    entries.map((e, i) =>
      db.leaderboardEntry.update({
        where: { id: e.id },
        data: { rank: i + 1 },
      })
    )
  );
}
