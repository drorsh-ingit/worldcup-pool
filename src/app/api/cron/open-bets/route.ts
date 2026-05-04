import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPushToGroup } from "@/lib/push";

// Runs every hour.
// Finds open bets (tournament bet types or per-game matches) closing in the
// next 2–3 hours where a user hasn't placed their bet yet, and sends them a
// reminder push notification.
// The 2–3h window (rather than 0–3h) means each closing deadline is caught
// by exactly one cron run, avoiding repeated notifications.

const TWO_HOURS = 2 * 60 * 60 * 1000;
const THREE_HOURS = 3 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + TWO_HOURS);
  const windowEnd = new Date(now.getTime() + THREE_HOURS);

  let notificationsSent = 0;

  // ── 1. Tournament / curated bet types with locksAt in the window ──────────
  const closingBetTypes = await db.betType.findMany({
    where: {
      status: "OPEN",
      category: { in: ["TOURNAMENT", "CURATED"] },
      locksAt: { gte: windowStart, lte: windowEnd },
    },
    include: {
      tournament: { select: { groupId: true } },
    },
  });

  for (const bt of closingBetTypes) {
    const groupId = bt.tournament.groupId;

    // Users in this group with a push subscription who haven't bet on this type
    const subscribedMembers = await db.groupMembership.findMany({
      where: { groupId, status: "APPROVED" },
      select: {
        user: {
          select: {
            id: true,
            pushSubscriptions: { select: { endpoint: true } },
          },
        },
      },
    });

    const eligibleUserIds = subscribedMembers
      .filter((m) => m.user.pushSubscriptions.length > 0)
      .map((m) => m.user.id);

    if (eligibleUserIds.length === 0) continue;

    const existingBets = await db.bet.findMany({
      where: { betTypeId: bt.id, matchId: null, userId: { in: eligibleUserIds } },
      select: { userId: true },
    });
    const bettedUserIds = new Set(existingBets.map((b) => b.userId));
    const pendingUserIds = eligibleUserIds.filter((id) => !bettedUserIds.has(id));

    if (pendingUserIds.length === 0) continue;

    const betName = bt.name ?? bt.subType.replace(/_/g, " ");
    const minutesLeft = Math.round((new Date(bt.locksAt!).getTime() - now.getTime()) / 60000);

    await sendPushToUsers(pendingUserIds, {
      title: "Prediction closing soon!",
      body: `${betName} closes in ~${minutesLeft} min — place your bet now.`,
      url: `/group/${groupId}/bets`,
    });
    notificationsSent += pendingUserIds.length;
  }

  // ── 2. Per-game matches with kickoffAt in the window ─────────────────────
  const closingMatches = await db.match.findMany({
    where: {
      status: "UPCOMING",
      kickoffAt: { gte: windowStart, lte: windowEnd },
    },
    include: {
      tournament: {
        select: {
          groupId: true,
          betTypes: {
            where: { category: "PER_GAME", subType: "match_winner", status: "OPEN" },
            select: { id: true },
          },
        },
      },
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  for (const match of closingMatches) {
    const mwBetType = match.tournament.betTypes[0];
    if (!mwBetType) continue; // per-game betting not open for this tournament

    const groupId = match.tournament.groupId;

    const subscribedMembers = await db.groupMembership.findMany({
      where: { groupId, status: "APPROVED" },
      select: {
        user: {
          select: {
            id: true,
            pushSubscriptions: { select: { endpoint: true } },
          },
        },
      },
    });

    const eligibleUserIds = subscribedMembers
      .filter((m) => m.user.pushSubscriptions.length > 0)
      .map((m) => m.user.id);

    if (eligibleUserIds.length === 0) continue;

    const existingBets = await db.bet.findMany({
      where: { betTypeId: mwBetType.id, matchId: match.id, userId: { in: eligibleUserIds } },
      select: { userId: true },
    });
    const bettedUserIds = new Set(existingBets.map((b) => b.userId));
    const pendingUserIds = eligibleUserIds.filter((id) => !bettedUserIds.has(id));

    if (pendingUserIds.length === 0) continue;

    const minutesLeft = Math.round((new Date(match.kickoffAt).getTime() - now.getTime()) / 60000);

    await sendPushToUsers(pendingUserIds, {
      title: "Match starting soon!",
      body: `${match.homeTeam.name} vs ${match.awayTeam.name} kicks off in ~${minutesLeft} min — predict the score!`,
      url: `/group/${groupId}/matches`,
    });
    notificationsSent += pendingUserIds.length;
  }

  return NextResponse.json({ notificationsSent });
}

async function sendPushToUsers(userIds: string[], payload: { title: string; body: string; url: string }) {
  // Group users by their group memberships — sendPushToGroup fans out by group.
  // Here we need to send to specific users directly, so we call the shared
  // helper with a synthetic single-user group-like query.
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  if (subscriptions.length === 0) return;

  // Re-use the push utility's internals by importing webpush directly
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    )
  );

  // Prune expired subscriptions
  const expired = results
    .map((r, i) => ({ r, sub: subscriptions[i] }))
    .filter(({ r }) => r.status === "rejected" && (r.reason as { statusCode?: number })?.statusCode === 410)
    .map(({ sub }) => sub.endpoint);

  if (expired.length > 0) {
    await db.pushSubscription.deleteMany({ where: { endpoint: { in: expired } } });
  }
}
