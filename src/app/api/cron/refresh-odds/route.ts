import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refreshAllMatchOdds, copyMatchOddsFromSibling } from "@/lib/actions/refresh-odds";
import { deriveMatchOdds, deriveScoreOdds } from "@/lib/match-odds";
import { sendPushToGroup } from "@/lib/push";
import { Prisma } from "@prisma/client";

const SEVENTY_TWO_HOURS = 72 * 60 * 60 * 1000;

// Runs daily at 6:00 AM UTC via Vercel Cron.
// Phase A: Lock matches whose kickoff has passed.
// Phase B: Freeze odds for matches kicking off within 72h.
// Phase C: Send push notifications for newly opened matches.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // ── Phase A: Lock past-kickoff matches ──────────────────────────────────
  const locked = await db.match.updateMany({
    where: { status: "UPCOMING", kickoffAt: { lte: now } },
    data: { status: "LOCKED" },
  });

  // ── Phase B: Freeze odds for matches in the 72h window ──────────────────
  const matchesToFreeze = await db.match.findMany({
    where: {
      status: "UPCOMING",
      oddsLockedAt: null,
      kickoffAt: { lte: new Date(now.getTime() + SEVENTY_TWO_HOURS) },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      tournament: { select: { id: true, kind: true, groupId: true } },
    },
  });

  if (matchesToFreeze.length === 0) {
    return NextResponse.json({ locked: locked.count, frozen: 0, notified: 0 });
  }

  // Group matches by tournament, then by tournament kind.
  const matchIdsByTournament = new Map<string, string[]>();
  const tournamentMeta = new Map<string, { kind: string; groupId: string }>();
  for (const m of matchesToFreeze) {
    const ids = matchIdsByTournament.get(m.tournament.id) ?? [];
    ids.push(m.id);
    matchIdsByTournament.set(m.tournament.id, ids);
    tournamentMeta.set(m.tournament.id, { kind: m.tournament.kind, groupId: m.tournament.groupId });
  }

  // Deduplicate by kind — fetch odds once, then copy to siblings.
  const tournamentsByKind = new Map<string, string[]>();
  for (const [tid, meta] of tournamentMeta) {
    const ids = tournamentsByKind.get(meta.kind) ?? [];
    if (!ids.includes(tid)) ids.push(tid);
    tournamentsByKind.set(meta.kind, ids);
  }

  for (const [, tournamentIds] of tournamentsByKind) {
    const firstTid = tournamentIds[0];
    const matchIds = matchIdsByTournament.get(firstTid) ?? [];
    await refreshAllMatchOdds(firstTid, matchIds).catch(() => null);
    for (let i = 1; i < tournamentIds.length; i++) {
      const siblingMatchIds = matchIdsByTournament.get(tournamentIds[i]) ?? [];
      await copyMatchOddsFromSibling(tournamentIds[i], siblingMatchIds).catch(() => null);
    }
  }

  // For matches that still have no API odds, derive from team winner odds.
  const stillMissing = await db.match.findMany({
    where: {
      id: { in: matchesToFreeze.map((m) => m.id) },
      oddsLockedAt: null,
    },
    include: { homeTeam: true, awayTeam: true },
  });

  for (const m of stillMissing) {
    const existing = m.oddsData as { homeWin?: number } | null;
    if (existing?.homeWin) continue; // has odds from API, just not locked yet

    const homeOdds = (m.homeTeam.odds as { winnerOdds?: number } | null)?.winnerOdds ?? 1000;
    const awayOdds = (m.awayTeam.odds as { winnerOdds?: number } | null)?.winnerOdds ?? 1000;
    const derived = deriveMatchOdds(homeOdds, awayOdds);
    const correctScores = deriveScoreOdds(homeOdds, awayOdds);

    await db.match.update({
      where: { id: m.id },
      data: {
        oddsData: {
          homeWin: derived.homeWin,
          draw: derived.draw,
          awayWin: derived.awayWin,
          correctScores,
          source: "derived",
          fetchedAt: now.toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // Set oddsLockedAt on all matches in the window (across all tournaments)
  const frozen = await db.match.updateMany({
    where: {
      id: { in: matchesToFreeze.map((m) => m.id) },
      oddsLockedAt: null,
    },
    data: { oddsLockedAt: now },
  });

  // ── Phase C: Send push notifications per group ──────────────────────────
  // Group newly frozen matches by groupId for consolidated notifications.
  const matchesByGroup = new Map<string, string[]>();
  for (const m of matchesToFreeze) {
    const groupId = m.tournament.groupId;
    const label = `${m.homeTeam.name} vs ${m.awayTeam.name}`;
    const list = matchesByGroup.get(groupId) ?? [];
    if (!list.includes(label)) list.push(label);
    matchesByGroup.set(groupId, list);
  }

  let notified = 0;
  for (const [groupId, matchLabels] of matchesByGroup) {
    const body =
      matchLabels.length === 1
        ? `${matchLabels[0]} is now open for predictions!`
        : matchLabels.length <= 3
          ? `${matchLabels.join(", ")} are now open for predictions!`
          : `${matchLabels.length} matches are now open for predictions!`;

    await sendPushToGroup(groupId, {
      title: "New matches open!",
      body,
      url: `/group/${groupId}/bets`,
    }).catch(() => null);
    notified++;
  }

  return NextResponse.json({
    locked: locked.count,
    frozen: frozen.count,
    notified,
  });
}
