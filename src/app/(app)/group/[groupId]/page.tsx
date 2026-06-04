import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PendingMembers } from "@/components/pending-members";
import { cn } from "@/lib/utils";
import { getInitials, getAvatarColor, AVATAR_COLOR_OPTIONS } from "@/lib/avatar";

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
        include: { user: { select: { id: true, name: true, email: true, avatarColor: true, avatarEmoji: true } } },
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
        avatarColor: m.user.avatarColor,
        avatarEmoji: m.user.avatarEmoji,
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
      </div>

      {/* Pending members (admin only) */}
      {isAdmin && pendingMembers.length > 0 && (
        <PendingMembers members={pendingMembers} />
      )}

      {/* Standings table */}
      {standings.length === 0 ? (
        <div className="text-center text-sm text-neutral-400" style={{ paddingTop: 80, paddingBottom: 80 }}>
          No scores yet. Bets will appear once the tournament starts.
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          {/* Column header */}
          <div
            className="hidden sm:grid grid-cols-[56px_1fr_80px_88px_80px_80px] border-b border-neutral-100 text-xs font-semibold text-neutral-400 uppercase tracking-widest"
            style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 14, paddingBottom: 14, gap: 8 }}
          >
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Matches</span>
            <span className="text-right">Tournament</span>
            <span className="text-right">Bonus</span>
            <span className="text-right">Total</span>
          </div>
          <div
            className="grid sm:hidden grid-cols-[56px_1fr_72px] border-b border-neutral-100 text-xs font-semibold text-neutral-400 uppercase tracking-widest"
            style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 14, paddingBottom: 14, gap: 8 }}
          >
            <span>#</span>
            <span>Player</span>
            <span className="text-right">Total</span>
          </div>

          {standings.map((s, i) => {
            const isMe = s.userId === currentUserId;
            const rankColors = [
              { bg: "bg-amber-500", text: "text-white" },
              { bg: "bg-neutral-800", text: "text-white" },
              { bg: "bg-orange-400", text: "text-white" },
            ];
            const rankStyle = i < 3 ? rankColors[i] : null;

            return (
              <Link
                key={s.userId}
                href={`/group/${groupId}/user/${s.userId}`}
                className={cn(
                  "grid grid-cols-[56px_1fr_72px] sm:grid-cols-[56px_1fr_80px_88px_80px_80px] items-center border-b border-neutral-50 last:border-0 transition-colors",
                  isMe ? "bg-emerald-50/60 hover:bg-emerald-50" : "hover:bg-neutral-50"
                )}
                style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 14, paddingBottom: 14, gap: 8 }}
              >
                {/* Rank badge */}
                <div className="flex items-center">
                  {rankStyle ? (
                    <span
                      className={cn("inline-flex items-center justify-center rounded-full text-xs font-bold tabular-nums w-7 h-7", rankStyle.bg, rankStyle.text)}
                    >
                      {i + 1}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-neutral-400 tabular-nums w-7 text-center">
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* Avatar + name */}
                <div className="flex items-center min-w-0" style={{ gap: 10 }}>
                  {(() => {
                    const color = s.avatarColor != null
                      ? AVATAR_COLOR_OPTIONS[s.avatarColor]
                      : getAvatarColor(s.userId);
                    return (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color.bg, color: color.text, fontSize: s.avatarEmoji ? 16 : 11, fontWeight: s.avatarEmoji ? "normal" : "bold" }}>
                        {s.avatarEmoji ?? getInitials(s.name)}
                      </div>
                    );
                  })()}
                  <span className="text-sm font-medium truncate text-neutral-900">
                    {s.name}
                    {isMe && <span className="text-neutral-400 font-normal"> (you)</span>}
                  </span>
                </div>

                {/* Breakdown — desktop only */}
                <span className="hidden sm:block text-sm text-neutral-500 text-right tabular-nums">
                  {s.perGamePts.toFixed(1)}
                </span>
                <span className="hidden sm:block text-sm text-neutral-500 text-right tabular-nums">
                  {s.tournamentPts.toFixed(1)}
                </span>
                <span className="hidden sm:block text-sm text-neutral-500 text-right tabular-nums">
                  {s.curatedPts.toFixed(1)}
                </span>

                {/* Total */}
                <span className={cn("text-sm font-bold text-right tabular-nums", isMe ? "text-emerald-700" : "text-neutral-900")}>
                  {s.totalPoints.toFixed(1)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
