import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { Users, Crown, Settings, Trophy } from "lucide-react";
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
    <div className="max-w-3xl mx-auto space-y-6" style={{ paddingTop: 24 }}>
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
      </div>

      {/* Pending members (admin only) */}
      {isAdmin && pendingMembers.length > 0 && (
        <PendingMembers members={pendingMembers} />
      )}

      {/* Hero card — #1 player */}
      {showHero && (
        <Link
          href={`/group/${groupId}/user/${leader.userId}`}
          className="block pitch-bg rounded-2xl relative overflow-hidden"
          style={{ marginTop: 20, padding: 28 }}
        >
          <div className="flex items-start justify-between gap-4">
            {/* Left: rank + name */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
              <div className="flex items-center flex-wrap" style={{ gap: 20, paddingTop: 8 }}>
                {(
                  [
                    ["Matches", leader.perGamePts],
                    ["Tournament", leader.tournamentPts],
                    ["Bonus", leader.curatedPts],
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
          className="block border border-amber-200 bg-pitch-50 rounded-2xl px-5 py-4 hover:border-amber-300 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-semibold text-pitch-700 tabular-nums w-6 text-center shrink-0">
                #{myRank}
              </span>
              <div className="w-8 h-8 rounded-full bg-pitch-50 border border-amber-200 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-pitch-900">
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
      <div style={{ marginTop: 32 }}>
        <h2
          className="text-xs font-semibold text-neutral-400 uppercase tracking-wider"
          style={{ marginBottom: 16 }}
        >
          Standings
        </h2>

        {standings.length === 0 ? (
          <div
            className="text-center text-sm text-neutral-400"
            style={{ paddingTop: 64, paddingBottom: 64, paddingLeft: 16, paddingRight: 16 }}
          >
            No scores yet. Bets will appear once the tournament starts.
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            {/* Table header — desktop shows all cols, mobile shows only rank/name/total */}
            <div
              className="hidden sm:grid grid-cols-[40px_1fr_80px_88px_80px_80px] gap-2 border-b border-neutral-100 text-xs font-medium text-neutral-400 uppercase tracking-wider"
              style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 18, paddingBottom: 18, letterSpacing: "0.08em" }}
            >
              <span>#</span>
              <span>Player</span>
              <span className="text-center">Matches</span>
              <span className="text-center">Tournament</span>
              <span className="text-center">Bonus</span>
              <span className="text-center">Total</span>
            </div>
            <div
              className="grid sm:hidden grid-cols-[40px_1fr_80px] gap-2 border-b border-neutral-100 text-xs font-medium text-neutral-400 uppercase tracking-wider"
              style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 18, paddingBottom: 18, letterSpacing: "0.08em" }}
            >
              <span>#</span>
              <span>Player</span>
              <span className="text-center">Total</span>
            </div>

            {standings.map((s, i) => {
              const isMe = s.userId === currentUserId;
              const podium = i;
              const podiumRowBg =
                podium === 0
                  ? "bg-amber-50/60"
                  : podium === 1
                  ? "bg-neutral-100/60"
                  : podium === 2
                  ? "bg-orange-50/50"
                  : "";
              const podiumRankColor =
                podium === 0
                  ? "text-amber-600"
                  : podium === 1
                  ? "text-neutral-500"
                  : podium === 2
                  ? "text-orange-600"
                  : "text-neutral-400";
              return (
                <Link
                  key={s.userId}
                  href={`/group/${groupId}/user/${s.userId}`}
                  className={cn(
                    "grid grid-cols-[40px_1fr_80px] sm:grid-cols-[40px_1fr_80px_88px_80px_80px] gap-2 items-center border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors",
                    !isMe && podiumRowBg,
                    isMe && "bg-pitch-50 hover:bg-pitch-50/80"
                  )}
                  style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 6, paddingBottom: 6 }}
                >
                  {/* Rank */}
                  <span
                    className={cn(
                      "text-sm font-semibold shrink-0 flex items-center tabular-nums",
                      isMe && podium < 0 ? "text-pitch-500" : podiumRankColor
                    )}
                  >
                    {podium === 0 ? (
                      <span style={{ fontSize: 18, lineHeight: 1 }}>🥇</span>
                    ) : podium === 1 ? (
                      <span style={{ fontSize: 18, lineHeight: 1 }}>🥈</span>
                    ) : podium === 2 ? (
                      <span style={{ fontSize: 18, lineHeight: 1 }}>🥉</span>
                    ) : (
                      i + 1
                    )}
                  </span>

                  {/* Name */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                        isMe
                          ? "bg-pitch-50 border border-amber-200"
                          : podium === 0
                          ? "bg-amber-100"
                          : podium === 1
                          ? "bg-neutral-200"
                          : podium === 2
                          ? "bg-orange-100"
                          : "bg-neutral-100"
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isMe
                            ? "text-pitch-900"
                            : podium === 0
                            ? "text-amber-800"
                            : podium === 1
                            ? "text-neutral-700"
                            : podium === 2
                            ? "text-orange-800"
                            : "text-neutral-500"
                        )}
                      >
                        {s.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium truncate text-neutral-900">
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
                  <span className="hidden sm:block text-sm text-neutral-500 text-center tabular-nums">
                    {s.perGamePts.toFixed(1)}
                  </span>
                  <span className="hidden sm:block text-sm text-neutral-500 text-center tabular-nums">
                    {s.tournamentPts.toFixed(1)}
                  </span>
                  <span className="hidden sm:block text-sm text-neutral-500 text-center tabular-nums">
                    {s.curatedPts.toFixed(1)}
                  </span>

                  {/* Total — always shown */}
                  <span
                    className={cn(
                      "text-sm font-semibold text-center tabular-nums",
                      isMe ? "text-pitch-700" : "text-neutral-900"
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
