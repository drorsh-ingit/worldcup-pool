import webpush from "web-push";
import { db } from "@/lib/db";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Send a push notification to all approved members of a group who have subscribed. */
export async function sendPushToGroup(groupId: string, payload: PushPayload) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  const memberships = await db.groupMembership.findMany({
    where: { groupId, status: "APPROVED" },
    select: { userId: true },
  });
  const userIds = memberships.map((m) => m.userId);

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    )
  );

  // Clean up expired/invalid subscriptions (410 Gone)
  const expiredEndpoints: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      const err = result.reason as { statusCode?: number };
      if (err?.statusCode === 410) expiredEndpoints.push(subscriptions[i].endpoint);
    }
  });
  if (expiredEndpoints.length > 0) {
    await db.pushSubscription.deleteMany({ where: { endpoint: { in: expiredEndpoints } } });
  }
}
