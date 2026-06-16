import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateDailyAnalysis } from "@/lib/actions/daily-analysis";

// Runs once daily. Generates the Hebrew AI standings analysis for each active
// group, cached one-per-group-per-day by generateDailyAnalysis.
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  // Every tournament — generateDailyAnalysis skips any with no standings yet.
  // (Tournament.status isn't reliably advanced, so we don't filter on it.)
  const tournaments = await db.tournament.findMany({
    select: { id: true, groupId: true },
  });

  const results: { groupId: string; ok: boolean; cached?: boolean; error?: string }[] = [];
  for (const t of tournaments) {
    try {
      const res = await generateDailyAnalysis(t.groupId, t.id);
      if ("error" in res) results.push({ groupId: t.groupId, ok: false, error: res.error });
      else results.push({ groupId: t.groupId, ok: true, cached: !!res.cached });
    } catch (e) {
      results.push({ groupId: t.groupId, ok: false, error: e instanceof Error ? e.message : "failed" });
    }
  }

  return NextResponse.json({
    generated: results.filter((r) => r.ok && !r.cached).length, // fresh Opus calls
    cached: results.filter((r) => r.ok && r.cached).length,
    skipped: results.filter((r) => !r.ok).length,
    results,
  });
}
