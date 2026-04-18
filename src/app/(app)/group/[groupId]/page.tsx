import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { Users, Crown, Settings } from "lucide-react";
import Link from "next/link";
import { CopySlugButton } from "@/components/copy-slug-button";
import { PendingMembers } from "@/components/pending-members";
import { cn } from "@/lib/utils";

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
  const standings = approvedMembers
    .map((m) => {
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
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const currentUserId = session.user.id;
  const leader = standings[0];
  const showHero = standings.length > 0 && leader.totalPoints > 0;
  const myEntry = standings.find((s) => s.userId === currentUserId);
  const myRank = myEntry ? standings.indexOf(myEntry) + 1 : null;
  const showMyPosition = showHero && myEntry && myEntry.userId !== leader.userId;

  return (
    <div className="space-y-6">
      {/* Slim header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Member count pill */}
          <div className="inline-flex items-center gap-1.5 text-sm text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-full">
            <Users className="w-3.5 h-3.5" />
            <span>
              {approvedMembers.length} member
              {approvedMembers.length !== 1 ? "s" : ""}
            </span>
          </div>
          <CopySlugButton slug={group.slug} />
        </div>
        {isAdmin && (
          <Link
            href={`/group/${groupId}/admin`}
            className="h-9 px-3.5 rounded-xl border border-neutral-200 text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors inline-flex items-center gap-1.5 shrink-0"
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

      {/* Hero card — #1 player */}
      {showHero && (
        <Link
          href={`/group/${groupId}/user/${leader.userId}`}
          className="block pitch-bg rounded-2xl p-6 relative overflow-hidden"
        >
          <div className="flex items-start justify-between gap-4">
            {/* Left: rank + name */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <span className="text-amber-400 text-sm font-semibold uppercase tracking-wider">
                  Leading the group
                </span>
              </div>
              <p
                className={cn(
                  "font-display text-3xl font-semibold text-white leading-tight"
                )}
              >
                {leader.name}
                {leader.userId === currentUserId && (
                  <span className="text-white/50 font-normal text-xl ml-2">
                    (you)
                  </span>
                )}
              </p>
              {/* Breakdown row */}
              <div className="flex items-center gap-4 pt-1 flex-wrap">
                {(
                  [
                    ["Pre", leader.preTournamentPts],
                    ["Games", leader.perGamePts],
                    ["Miles.", leader.milestonePts],
                    ["Props", leader.curatedPts],
                  ] as [string, number][]
                ).map(([label, val]) => (
                  <span key={label} className="text-xs text-white/60">
                    {label}{" "}
                    <span className="text-white/80 font-medium tabular-nums">
                      {val.toFixed(1)}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Right: total points */}
            <div className="text-right shrink-0">
              <p className="font-display text-5xl font-bold text-white tabular-nums leading-none">
                {leader.totalPoints.toFixed(1)}
              </p>
              <p className="text-white/50 text-xs mt-1 uppercase tracking-wider">
                pts
              </p>
            </div>
          </div>
        </Link>
      )}

      {/* My position card */}
      {showMyPosition && myEntry && myRank !== null && (
        <Link
          href={`/group/${groupId}/user/${currentUserId}`}
          className="block border border-amber-200 bg-amber-50 rounded-2xl px-5 py-4 hover:border-amber-300 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-semibold text-amber-600 tabular-nums w-6 text-center shrink-0">
                #{myRank}
              </span>
              <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-amber-700">
                  {myEntry.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm font-medium text-neutral-900 truncate">
                {myEntry.name}{" "}
                <span className="text-neutral-400 font-normal">(you)</span>
              </span>
            </div>
            <span className="text-base font-semibold text-neutral-900 tabular-nums shrink-0">
              {myEntry.totalPoints.toFixed(1)}{" "}
              <span className="text-xs font-normal text-neutral-400">pts</span>
            </span>
          </div>
        </Link>
      )}

      {/* Full standings table */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          Standings
        </h2>

        {standings.length === 0 ? (
          <div className="text-center py-12 text-sm text-neutral-400">
            No scores yet. Bets will appear once the tournament starts.
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {/* Table header — desktop shows all cols, mobile shows only rank/name/total */}
            <div className="hidden sm:grid grid-cols-[40px_1fr_72px_72px_72px_72px_80px] gap-2 px-4 py-2.5 border-b border-neutral-100 text-xs font-medium text-neutral-400 uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Pre</span>
              <span className="text-right">Games</span>
              <span className="text-right">Miles.</span>
              <span className="text-right">Props</span>
              <span className="text-right">Total</span>
            </div>
            <div className="grid sm:hidden grid-cols-[40px_1fr_80px] gap-2 px-4 py-2.5 border-b border-neutral-100 text-xs font-medium text-neutral-400 uppercase tracking-wider">
              <span>#</span>
              <span>Player</span>
              <span className="text-right">Total</span>
            </div>

            {standings.map((s, i) => {
              const isMe = s.userId === currentUserId;
              const isLeader = i === 0 && s.totalPoints > 0;
              return (
                <Link
                  key={s.userId}
                  href={`/group/${groupId}/user/${s.userId}`}
                  className={cn(
                    "flex items-center px-4 py-3 border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors",
                    isMe && "bg-amber-50 hover:bg-amber-50/80"
                  )}
                >
                  {/* Rank */}
                  <span
                    className={cn(
                      "text-sm font-medium shrink-0 w-10 flex items-center",
                      isMe ? "text-amber-500" : "text-neutral-400"
                    )}
                  >
                    {isLeader ? (
                      <Crown className="w-4 h-4 text-amber-500" />
                    ) : (
                      i + 1
                    )}
                  </span>

                  {/* Name */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                        isMe
                          ? "bg-amber-100 border border-amber-200"
                          : "bg-neutral-100"
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isMe ? "text-amber-700" : "text-neutral-500"
                        )}
                      >
                        {s.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-medium truncate",
                        isMe ? "text-neutral-900" : "text-neutral-900"
                      )}
                    >
                      {s.name}
                      {isMe && (
                        <span className="text-neutral-400 font-normal">
                          {" "}
                          (you)
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Breakdown cols — hidden on mobile */}
                  <span className="hidden sm:block text-sm text-neutral-500 text-right tabular-nums w-[72px] shrink-0">
                    {s.preTournamentPts.toFixed(1)}
                  </span>
                  <span className="hidden sm:block text-sm text-neutral-500 text-right tabular-nums w-[72px] shrink-0">
                    {s.perGamePts.toFixed(1)}
                  </span>
                  <span className="hidden sm:block text-sm text-neutral-500 text-right tabular-nums w-[72px] shrink-0">
                    {s.milestonePts.toFixed(1)}
                  </span>
                  <span className="hidden sm:block text-sm text-neutral-500 text-right tabular-nums w-[72px] shrink-0">
                    {s.curatedPts.toFixed(1)}
                  </span>

                  {/* Total — always shown */}
                  <span
                    className={cn(
                      "text-sm font-semibold text-right tabular-nums w-20 shrink-0",
                      isMe ? "text-amber-600" : "text-neutral-900"
                    )}
                  >
                    {s.totalPoints.toFixed(1)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
