import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchWCFeed, reconcileTournament } from "@/lib/actions/reconcile";

// Hit by an external scheduler (GitHub Actions) during the tournament — Vercel's free tier
// only allows daily cron. The workflow requests */10, but GitHub throttles scheduled runs
// heavily: in practice it fires roughly once an hour (observed gaps of 1–3+ hours) and can
// skip runs under load. Treat freshness as "within a couple of hours", not minutes. Pulls
// the WC feed once and reconciles every WC tournament: scores, knockout fixtures, bet resolution.
// Auth is the same CRON_SECRET bearer pattern as the other cron routes; the middleware
// lets /api/cron/* through so this self-authenticates.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // All WC tournaments share one feed (dedupe by kind) — fetch it a single time.
  const tournaments = await db.tournament.findMany({
    where: { kind: "WC_2026" },
    select: { id: true, groupId: true },
  });
  if (tournaments.length === 0) {
    return NextResponse.json({ tournaments: 0, completed: 0, created: 0, errors: 0 });
  }

  const feed = await fetchWCFeed();

  // Groups are independent (all writes scoped by groupId), so reconcile them concurrently —
  // keeps total time near a single group's even as the number of pools grows.
  const results = await Promise.allSettled(
    tournaments.map((t) => reconcileTournament(t.groupId, t.id, feed))
  );

  let completed = 0;
  let created = 0;
  let errors = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      completed += r.value.completed;
      created += r.value.created;
    } else {
      errors++;
      console.error(`reconcile failed for tournament ${tournaments[i].id}:`, r.reason);
    }
  });

  return NextResponse.json({ tournaments: tournaments.length, completed, created, errors });
}
