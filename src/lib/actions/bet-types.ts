"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { refreshOddsForBetType, snapshotOddsForBetType } from "@/lib/actions/refresh-odds";
import { getProfile } from "@/lib/tournaments/registry";
import { sendPushToGroup } from "@/lib/push";
import type { BetOpenTrigger } from "@prisma/client";

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

  // Snapshot the now-current odds onto the bet type so future refreshes
  // don't retroactively change points for bets placed against this opening.
  const frozenOdds = await snapshotOddsForBetType(betType.tournamentId, betType.category);

  await db.betType.update({
    where: { id: betTypeId },
    data: {
      status: "OPEN",
      opensAt: new Date(),
      ...(frozenOdds != null && { frozenOdds }),
    },
  });

  // Fire-and-forget push notification — don't let failures block the response
  const betTypeName = betType.name ?? betType.subType.replace(/_/g, " ");
  sendPushToGroup(groupId, {
    title: "New predictions open!",
    body: `${betTypeName} — place your bet now before it closes.`,
    url: `/group/${groupId}/bets`,
  }).catch(() => {});

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

/**
 * Change when a tournament bet opens. Recomputes opensAt/locksAt from the trigger.
 * Only applies to DRAFT bet types — already-opened bets shouldn't reschedule.
 */
export async function updateBetTypeOpenTrigger(
  groupId: string,
  betTypeId: string,
  trigger: BetOpenTrigger
) {
  await requireAdmin(groupId);

  const betType = await db.betType.findUnique({
    where: { id: betTypeId },
    include: { tournament: true },
  });
  if (!betType) return { error: "Bet type not found" };
  if (betType.category !== "TOURNAMENT") return { error: "Open trigger only applies to tournament bets" };
  if (betType.status !== "DRAFT") return { error: "Can only change open timing while bet is in DRAFT" };

  const profile = getProfile(betType.tournament.kind);
  const { opensAt, locksAt } = profile.resolveOpenTrigger(trigger);

  await db.betType.update({
    where: { id: betTypeId },
    data: { openTrigger: trigger, opensAt, locksAt },
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
