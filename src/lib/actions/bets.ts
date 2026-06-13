"use server";

import { auth } from "@/lib/auth";
import { db, withDbRetry } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { resolveGroupSettings, type GroupSettings } from "@/lib/settings";
import { getEffectiveDate } from "@/lib/simulation";

const placeBetSchema = z.object({
  tournamentId: z.string().cuid(),
  betTypeId: z.string().cuid(),
  matchId: z.string().cuid().optional(),
  prediction: z.record(z.string(), z.unknown()),
});

/**
 * Place or update a bet.
 * - Verifies user is an approved group member
 * - Verifies bet type is OPEN and not past locksAt
 * - Creates or updates the bet
 */
export async function placeBet(groupId: string, input: unknown) {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const parsed = placeBetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { tournamentId, betTypeId, matchId, prediction } = parsed.data;

  // Verify membership
  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.status !== "APPROVED") {
    return { error: "Not a member of this group" };
  }

  // Verify bet type is open
  const betType = await db.betType.findUnique({ where: { id: betTypeId } });
  if (!betType) return { error: "Bet type not found" };

  // Use simulated date if simulation mode is active
  const group = await db.group.findUnique({ where: { id: groupId } });
  const groupSettings = resolveGroupSettings(group?.settings);
  const effectiveNow = getEffectiveDate(groupSettings);

  // Determine effective status: DRAFT with opensAt passed → effectively OPEN
  const effectiveStatus =
    betType.status === "DRAFT" && betType.opensAt && effectiveNow >= betType.opensAt
      ? "OPEN"
      : betType.status;

  if (effectiveStatus !== "OPEN") return { error: "Betting is not open for this market" };

  if (betType.locksAt && effectiveNow >= betType.locksAt) {
    return { error: "This bet has already locked" };
  }

  // For per-game bets, verify match is open and hasn't kicked off
  if (matchId) {
    const match = await db.match.findUnique({ where: { id: matchId } });
    if (!match) return { error: "Match not found" };
    if (!match.oddsLockedAt) {
      return { error: "This match is not open for predictions yet" };
    }
    if (effectiveNow >= match.kickoffAt) {
      return { error: "This match has already kicked off" };
    }
  }

  const predictionJson = prediction as unknown as Prisma.InputJsonValue;

  // Find existing bet (handle null matchId explicitly)
  const existing = await db.bet.findFirst({
    where: {
      userId: session.user.id,
      betTypeId,
      matchId: matchId ?? null,
    },
  });

  if (existing) {
    await db.bet.update({
      where: { id: existing.id },
      data: { prediction: predictionJson, updatedAt: new Date() },
    });
  } else {
    await db.bet.create({
      data: {
        userId: session.user.id,
        tournamentId,
        betTypeId,
        matchId: matchId ?? null,
        prediction: predictionJson,
      },
    });
  }

  revalidatePath(`/group/${groupId}/bets`);
  revalidatePath(`/group/${groupId}/user/${session.user.id}`);

  return { success: true };
}

const placeMatchPredictionSchema = z.object({
  tournamentId: z.string().cuid(),
  matchId: z.string().cuid(),
  correctScoreBetTypeId: z.string().cuid().optional(),
  matchWinnerBetTypeId: z.string().cuid().optional(),
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
});

/**
 * Place a per-game match prediction: the correct-score bet and its derived
 * match-winner bet, written ATOMICALLY in a single transaction.
 *
 * This replaces two independent placeBet calls. Previously a partial failure
 * (e.g. a cold connection-pool timeout on the first call) could persist one bet
 * but not the other, leaving an orphaned match-winner with no correct-score.
 * The winner outcome is derived server-side from the score — never trusted from
 * the client — so the two bets can never disagree.
 */
export async function placeMatchPrediction(groupId: string, input: unknown) {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const parsed = placeMatchPredictionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { tournamentId, matchId, correctScoreBetTypeId, matchWinnerBetTypeId, homeScore, awayScore } = parsed.data;
  if (!correctScoreBetTypeId && !matchWinnerBetTypeId) {
    return { error: "No market to save" };
  }

  const userId = session.user.id;

  // Retry the whole DB sequence on transient Neon cold-start failures: the
  // first attempt wakes the compute, the retry succeeds against the warm pool.
  // Validation early-returns are plain returns (not throws), so they never loop;
  // only transient connection errors trigger a retry, and the upserts are
  // idempotent, so a retry can't double-write.
  return withDbRetry(async () => {
    // Verify membership
    const membership = await db.groupMembership.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });
    if (!membership || membership.status !== "APPROVED") {
      return { error: "Not a member of this group" };
    }

    // Use simulated date if simulation mode is active
    const group = await db.group.findUnique({ where: { id: groupId } });
    const groupSettings = resolveGroupSettings(group?.settings);
    const effectiveNow = getEffectiveDate(groupSettings);

    // Verify the match is open and hasn't kicked off
    const match = await db.match.findUnique({ where: { id: matchId } });
    if (!match) return { error: "Match not found" };
    if (!match.oddsLockedAt) return { error: "This match is not open for predictions yet" };
    if (effectiveNow >= match.kickoffAt) return { error: "This match has already kicked off" };

    // Verify every targeted bet type is open and not past its lock time
    const betTypeIds = [correctScoreBetTypeId, matchWinnerBetTypeId].filter((id): id is string => !!id);
    const betTypes = await db.betType.findMany({ where: { id: { in: betTypeIds } } });
    if (betTypes.length !== betTypeIds.length) return { error: "Bet type not found" };
    for (const bt of betTypes) {
      const effectiveStatus =
        bt.status === "DRAFT" && bt.opensAt && effectiveNow >= bt.opensAt ? "OPEN" : bt.status;
      if (effectiveStatus !== "OPEN") return { error: "Betting is not open for this market" };
      if (bt.locksAt && effectiveNow >= bt.locksAt) return { error: "This bet has already locked" };
    }

    const outcome = homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw";
    const csPrediction = { homeScore, awayScore } as unknown as Prisma.InputJsonValue;
    const mwPrediction = { outcome } as unknown as Prisma.InputJsonValue;

    // matchId is non-null here, so the compound unique upsert is safe (the
    // null-matchId equality caveat does not apply). Both writes share one
    // transaction: they land together or not at all.
    const ops = [];
    if (correctScoreBetTypeId) {
      ops.push(
        db.bet.upsert({
          where: { userId_betTypeId_matchId: { userId, betTypeId: correctScoreBetTypeId, matchId } },
          create: { userId, tournamentId, betTypeId: correctScoreBetTypeId, matchId, prediction: csPrediction },
          update: { prediction: csPrediction },
        })
      );
    }
    if (matchWinnerBetTypeId) {
      ops.push(
        db.bet.upsert({
          where: { userId_betTypeId_matchId: { userId, betTypeId: matchWinnerBetTypeId, matchId } },
          create: { userId, tournamentId, betTypeId: matchWinnerBetTypeId, matchId, prediction: mwPrediction },
          update: { prediction: mwPrediction },
        })
      );
    }
    await db.$transaction(ops);

    revalidatePath(`/group/${groupId}/bets`);
    revalidatePath(`/group/${groupId}/user/${userId}`);

    return { success: true };
  });
}

/** Get a user's current bets for a tournament */
export async function getUserBets(tournamentId: string) {
  const session = await auth();
  if (!session) return [];

  // Verify user is a member of the group that owns this tournament
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: { groupId: true },
  });
  if (!tournament) return [];

  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId: tournament.groupId } },
  });
  if (!membership || membership.status !== "APPROVED") return [];

  return db.bet.findMany({
    where: { userId: session.user.id, tournamentId },
    include: { betType: true, match: { include: { homeTeam: true, awayTeam: true } } },
    orderBy: { createdAt: "asc" },
  });
}
