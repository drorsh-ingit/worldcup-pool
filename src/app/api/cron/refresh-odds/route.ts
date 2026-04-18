import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refreshAllMatchOdds, refreshTournamentWinnerOdds } from "@/lib/actions/refresh-odds";

// Called by Vercel Cron every hour.
// Finds matches entering the 48h betting window that don't have fresh odds yet,
// then fetches live odds for those tournaments.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;

  // Find matches that will enter the 48h window within the next hour
  // (i.e. kickoffAt is between 47h and 48h from now) and have no stored odds.
  const upcomingMatches = await db.match.findMany({
    where: {
      status: "UPCOMING",
      kickoffAt: {
        gte: new Date(now.getTime() + FORTY_EIGHT_HOURS - ONE_HOUR),
        lte: new Date(now.getTime() + FORTY_EIGHT_HOURS),
      },
    },
    select: { id: true, tournamentId: true, oddsData: true },
  });

  // Deduplicate by tournament and skip any that already have fresh odds.
  const tournamentIds = [
    ...new Set(
      upcomingMatches
        .filter((m) => !(m.oddsData as { fetchedAt?: string } | null)?.fetchedAt)
        .map((m) => m.tournamentId)
    ),
  ];

  if (tournamentIds.length === 0) {
    return NextResponse.json({ refreshed: 0, message: "No matches entering window" });
  }

  const results = await Promise.all(
    tournamentIds.map(async (tid) => {
      const [winner, matches] = await Promise.all([
        refreshTournamentWinnerOdds(tid),
        refreshAllMatchOdds(tid),
      ]);
      return { tournamentId: tid, winner, matches };
    })
  );

  return NextResponse.json({ refreshed: tournamentIds.length, results });
}
