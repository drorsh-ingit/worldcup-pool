import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { PendingMembers } from "@/components/pending-members";
import { CopySlugButton } from "@/components/copy-slug-button";
import { CopyInviteLinkButton } from "@/components/copy-invite-link-button";
import { LiveStandingsTable } from "@/components/standings/live-standings-table";
import { DailyAnalysisCard } from "@/components/standings/daily-analysis-card";
import { getLatestAnalysis } from "@/lib/actions/daily-analysis";
import { LiveScoresProvider } from "@/components/stats/live-scores-context";
import { resolveGroupSettings } from "@/lib/settings";

interface GroupPageProps {
  params: Promise<{ groupId: string }>;
}

export default async function GroupPage({ params }: GroupPageProps) {
  const { groupId } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const membership = await db.groupMembership.findUnique({
    where: {
      userId_groupId: {
        userId: session.user.id,
        groupId,
      },
    },
  });

  if (!membership || membership.status !== "APPROVED") {
    notFound();
  }

  const group = await db.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, realName: true, email: true, avatarColor: true, avatarStyle: true, avatarSeed: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });

  if (!group) notFound();

  const isAdmin = membership.role === "ADMIN";
  const approvedMembers = group.members.filter((m) => m.status === "APPROVED");
  const pendingMembers = group.members.filter((m) => m.status === "PENDING");

  // Get leaderboard entries if they exist
  const leaderboard = await db.leaderboardEntry.findMany({
    where: { groupId },
    orderBy: { totalPoints: "desc" },
  });

  // Latest AI standings analysis (generated daily by the cron).
  const dailyAnalysis = await getLatestAnalysis(groupId);

  // In-play matches: kicked off, not yet COMPLETED, within a 4h tail.
  const tournament = await db.tournament.findFirst({ where: { groupId }, select: { id: true } });
  const groupSettings = resolveGroupSettings(group.settings);

  const now = new Date();
  const tailCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const inPlayMatches = tournament
    ? await db.match.findMany({
        where: {
          tournamentId: tournament.id,
          status: { not: "COMPLETED" },
          kickoffAt: { lte: now, gte: tailCutoff },
        },
        include: { homeTeam: true, awayTeam: true },
      })
    : [];

  const inPlayMatchIds = inPlayMatches.map((m) => m.id);
  const rawInPlayBets = inPlayMatchIds.length
    ? await db.bet.findMany({
        where: {
          matchId: { in: inPlayMatchIds },
          betType: { subType: { in: ["match_winner", "correct_score"] } },
        },
        include: { betType: { select: { subType: true } } },
      })
    : [];

  const inPlayMatchMeta = inPlayMatches.map((m) => ({
    matchId: m.id,
    phase: m.phase,
    homeOdds: (m.homeTeam.odds as { winnerOdds?: number } | null)?.winnerOdds ?? 1000,
    awayOdds: (m.awayTeam.odds as { winnerOdds?: number } | null)?.winnerOdds ?? 1000,
    oddsData: (m.oddsData ?? {}) as Record<string, unknown>,
  }));

  const inPlayBets = rawInPlayBets
    .filter((b) => b.matchId != null)
    .map((b) => ({
      matchId: b.matchId!,
      userId: b.userId,
      subType: b.betType.subType,
      prediction: (b.prediction ?? {}) as Record<string, unknown>,
    }));

  // Map leaderboard to members
  const standings = approvedMembers
    .map((m) => {
      const entry = leaderboard.find((l) => l.userId === m.userId);
      return {
        userId: m.userId,
        name: m.user.name,
        avatarColor: m.user.avatarColor,
        avatarStyle: m.user.avatarStyle,
        avatarSeed: m.user.avatarSeed,
        realName: m.user.realName,
        role: m.role,
        totalPoints: entry?.totalPoints ?? 0,
        tournamentPts: entry?.tournamentPts ?? 0,
        perGamePts: entry?.perGamePts ?? 0,
        curatedPts: entry?.curatedPts ?? 0,
        correctBets: entry?.correctBets ?? 0,
        totalBets: entry?.totalBets ?? 0,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const currentUserId = session.user.id;
  const leader = standings[0];
  const showHero = standings.length > 0 && leader.totalPoints > 0;
  const myEntry = standings.find((s) => s.userId === currentUserId);
  const myRank = myEntry ? standings.indexOf(myEntry) + 1 : null;
  const showMyPosition = showHero && myEntry && myEntry.userId !== leader.userId;

  return (
    <div className="max-w-3xl mx-auto" style={{ paddingTop: 32, display: "flex", flexDirection: "column", gap: 32 }}>

      {/* Page header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#4a8c2a" }}>
          {group.name}
        </span>
        <h1 className="text-4xl font-black tracking-tight text-neutral-900">Standings</h1>
        <div className="flex items-center flex-wrap" style={{ gap: 12, marginTop: 6 }}>
          <span className="text-xs text-neutral-400">Invite code</span>
          <CopySlugButton slug={group.slug} />
          <CopyInviteLinkButton slug={group.slug} />
        </div>
      </div>

      {/* Pending members (admin only) */}
      {isAdmin && pendingMembers.length > 0 && (
        <PendingMembers members={pendingMembers} />
      )}

      {/* Daily AI analysis */}
      {dailyAnalysis && (
        <DailyAnalysisCard content={dailyAnalysis.content} dateKey={dailyAnalysis.dateKey} />
      )}

      {/* Standings table */}
      {standings.length === 0 ? (
        <div className="text-center text-sm text-neutral-400" style={{ paddingTop: 80, paddingBottom: 80 }}>
          No scores yet. Bets will appear once the tournament starts.
        </div>
      ) : (
        <LiveScoresProvider groupId={groupId} matchIds={inPlayMatchIds}>
          <LiveStandingsTable
            groupId={groupId}
            currentUserId={currentUserId}
            baseStandings={standings}
            inPlayMatchMeta={inPlayMatchMeta}
            inPlayBets={inPlayBets}
            groupSettings={groupSettings}
          />
        </LiveScoresProvider>
      )}
    </div>
  );
}
