"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { refreshOddsForBetType } from "@/lib/actions/refresh-odds";

async function requireAdmin(groupId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") throw new Error("Not authorized");
  return session;
}

/** Open a bet type so users can place bets */
export async function openBetType(groupId: string, betTypeId: string) {
  await requireAdmin(groupId);

  const betType = await db.betType.findUnique({ where: { id: betTypeId } });
  if (!betType) return { error: "Bet type not found" };

  // Best-effort live odds refresh right before opening; ignored on failure.
  const refresh = await refreshOddsForBetType(betType.tournamentId, betType.category, betType.subType);

  await db.betType.update({
    where: { id: betTypeId },
    data: { status: "OPEN", opensAt: new Date() },
  });
  revalidatePath(`/group/${groupId}/admin`);
  revalidatePath(`/group/${groupId}/bets`);
  return { success: true, oddsRefresh: refresh };
}

/** Reopen a locked bet type so users can place bets again */
export async function reopenBetType(groupId: string, betTypeId: string) {
  await requireAdmin(groupId);
  await db.betType.update({
    where: { id: betTypeId },
    data: { status: "OPEN", locksAt: null },
  });
  revalidatePath(`/group/${groupId}/admin`);
  revalidatePath(`/group/${groupId}/bets`);
  return { success: true };
}

/** Lock a bet type — no more bets accepted */
export async function lockBetType(groupId: string, betTypeId: string) {
  await requireAdmin(groupId);
  await db.betType.update({
    where: { id: betTypeId },
    data: { status: "LOCKED", locksAt: new Date() },
  });
  revalidatePath(`/group/${groupId}/admin`);
  revalidatePath(`/group/${groupId}/bets`);
  return { success: true };
}

/**
 * Resolve a bet type with the correct answer.
 * prediction format varies by subType:
 *   winner/runner_up/dark_horse: { teamCode: "BRA" }
 *   golden_boot: { playerName: "Mbappe", teamCode: "FRA" }
 *   group_predictions: { winners: { A: "FRA", ... }, advancing: ["FRA", "MEX", ...] }
 *   semifinalists: { teams: ["FRA", "ENG", "BRA", "ARG"] }
 */
export async function resolveBetType(
  groupId: string,
  betTypeId: string,
  resolution: Record<string, unknown>
) {
  await requireAdmin(groupId);

  await db.betType.update({
    where: { id: betTypeId },
    data: {
      status: "RESOLVED",
      resolution: resolution as unknown as import("@prisma/client").Prisma.InputJsonValue,
      resolvedAt: new Date(),
    },
  });

  revalidatePath(`/group/${groupId}/admin`);
  revalidatePath(`/group/${groupId}/bets`);

  return { success: true };
}

/** Create a curated prop bet (admin-defined custom question) */
export async function createCuratedBet(
  groupId: string,
  tournamentId: string,
  data: {
    name: string;
    description: string;
    options: string[];
    locksAt: Date;
    matchId?: string;
  }
) {
  await requireAdmin(groupId);

  await db.betType.create({
    data: {
      tournamentId,
      category: "CURATED",
      subType: "prop",
      name: data.name,
      description: data.description,
      locksAt: data.locksAt,
      status: "OPEN",
      config: { options: data.options, matchId: data.matchId ?? null },
    },
  });

  revalidatePath(`/group/${groupId}/admin`);
  revalidatePath(`/group/${groupId}/bets`);

  return { success: true };
}
