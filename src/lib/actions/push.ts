"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendPushToGroup } from "@/lib/push";

export async function sendTestPush(groupId: string) {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") return { error: "Not admin" };

  const group = await db.group.findUnique({ where: { id: groupId }, select: { name: true } });

  try {
    const subscriptions = await db.pushSubscription.findMany({
      where: { user: { memberships: { some: { groupId, status: "APPROVED" } } } },
    });

    if (subscriptions.length === 0) return { error: "No subscribers in this group yet", sent: 0 };

    await sendPushToGroup(groupId, {
      title: "Test notification 🎉",
      body: `Push notifications are working for ${group?.name ?? "your group"}!`,
      url: `/group/${groupId}`,
    });

    return { sent: subscriptions.length };
  } catch (e) {
    return { error: String(e) };
  }
}
