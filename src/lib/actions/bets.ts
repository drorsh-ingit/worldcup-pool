"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
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

  // For per-game bets, lock at match kickoff time
  if (matchId) {
    const match = await db.match.findUnique({ where: { id: matchId } });
    if (match && effectiveNow >= match.kickoffAt) {
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

/** Get a user's current bets for a tournament */
export async function getUserBets(tournamentId: string) {
  const session = await auth();
  if (!session) return [];

  return db.bet.findMany({
    where: { userId: session.user.id, tournamentId },
    include: { betType: true, match: { include: { homeTeam: true, awayTeam: true } } },
    orderBy: { createdAt: "asc" },
  });
}
