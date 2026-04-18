import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { Users, Crown, Settings } from "lucide-react";
import Link from "next/link";
import { CopySlugButton } from "@/components/copy-slug-button";
import { PendingMembers } from "@/components/pending-members";

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
        include: { user: { select: { id: true, name: true, email: true } } },
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

  // Map leaderboard to members
  const standings = approvedMembers.map((m) => {
    const entry = leaderboard.find((l) => l.userId === m.userId);
    return {
      userId: m.userId,
      name: m.user.name,
      role: m.role,
      totalPoints: entry?.totalPoints ?? 0,
      preTournamentPts: entry?.preTournamentPts ?? 0,
      perGamePts: entry?.perGamePts ?? 0,
      milestonePts: entry?.milestonePts ?? 0,
      curatedPts: entry?.curatedPts ?? 0,
      correctBets: entry?.correctBets ?? 0,
      totalBets: entry?.totalBets ?? 0,
    };
  }).sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            {group.name}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5 text-sm text-neutral-500">
              <Users className="w-3.5 h-3.5" />
              {approvedMembers.length} member{approvedMembers.length !== 1 ? "s" : ""}
            </div>
            <CopySlugButton slug={group.slug} />
          </div>
        </div>
        {isAdmin && (
          <Link
            href={`/group/${groupId}/admin`}
            className="h-9 px-3.5 rounded-xl border border-neutral-200 text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors inline-flex items-center gap-1.5"
          >
            <Settings className="w-4 h-4" />
            Manage
          </Link>
        )}
      </div>

      {/* Pending members (admin only) */}
      {isAdmin && pendingMembers.length > 0 && (
        <PendingMembers members={pendingMembers} />
      )}

      {/* Standings */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider">
          Standings
        </h2>

        {standings.length === 0 ? (
          <div className="text-center py-12 text-sm text-neutral-400">
            No scores yet. Bets will appear once the tournament starts.
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[40px_1fr_80px_80px_80px_80px_80px] gap-2 px-4 py-2.5 border-b border-neutral-100 text-xs font-medium text-neutral-400 uppercase tracking-wider">
              <span className="w-10">#</span>
              <span>Player</span>
              <span className="text-right">Pre</span>
              <span className="text-right">Games</span>
              <span className="text-right">Miles.</span>
              <span className="text-right">Props</span>
              <span className="w-16 text-right">Total</span>
            </div>

            {/* Rows */}
            {standings.map((s, i) => (
              <Link
                key={s.userId}
                href={`/group/${groupId}/user/${s.userId}`}
                className="grid grid-cols-[40px_1fr_80px_80px_80px_80px_80px] gap-2 px-4 py-3 items-center hover:bg-neutral-50 transition-colors border-b border-neutral-50 last:border-0"
              >
                <span className="w-10 text-sm font-medium text-neutral-400">
                  {i === 0 && s.totalPoints > 0 ? (
                    <Crown className="w-4 h-4 text-amber-500" />
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-neutral-500">
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-neutral-900 truncate">
                    {s.name}
                    {s.userId === session.user.id && (
                      <span className="text-neutral-400 font-normal"> (you)</span>
                    )}
                  </span>
                </div>
                <span className="text-sm text-neutral-500 text-right tabular-nums">
                  {s.preTournamentPts.toFixed(1)}
                </span>
                <span className="text-sm text-neutral-500 text-right tabular-nums">
                  {s.perGamePts.toFixed(1)}
                </span>
                <span className="text-sm text-neutral-500 text-right tabular-nums">
                  {s.milestonePts.toFixed(1)}
                </span>
                <span className="text-sm text-neutral-500 text-right tabular-nums">
                  {s.curatedPts.toFixed(1)}
                </span>
                <span className="w-16 text-sm font-semibold text-neutral-900 text-right tabular-nums">
                  {s.totalPoints.toFixed(1)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
