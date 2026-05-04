import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { snapshotOddsForBetType } from "@/lib/actions/refresh-odds";
import { sendPushToGroup } from "@/lib/push";
import { Prisma } from "@prisma/client";

// Runs daily at 10:00 AM Israel time (07:00 UTC in summer / 08:00 UTC in winter).
// Finds DRAFT bet types whose opensAt has passed, promotes them to OPEN,
// and sends a push notification to all group members.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const draftBetTypes = await db.betType.findMany({
    where: {
      status: "DRAFT",
      opensAt: { lte: now },
    },
    include: {
      tournament: {
        select: { id: true, groupId: true },
      },
    },
  });

  if (draftBetTypes.length === 0) {
    return NextResponse.json({ opened: 0, message: "No bet types to open" });
  }

  const opened: string[] = [];

  for (const bt of draftBetTypes) {
    const frozenOdds = await snapshotOddsForBetType(bt.tournamentId, bt.category, bt.subType);

    await db.betType.update({
      where: { id: bt.id },
      data: {
        status: "OPEN",
        ...(frozenOdds != null && { frozenOdds: frozenOdds as Prisma.InputJsonValue }),
      },
    });

    const betName = bt.name ?? bt.subType.replace(/_/g, " ");
    sendPushToGroup(bt.tournament.groupId, {
      title: "New predictions open!",
      body: `${betName} — place your bet now before it closes.`,
      url: `/group/${bt.tournament.groupId}/bets`,
    }).catch(() => {});

    opened.push(`${bt.id} (${betName})`);
  }

  return NextResponse.json({ opened: opened.length, betTypes: opened });
}
