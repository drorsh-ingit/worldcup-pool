import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PendingMembers } from "@/components/pending-members";
import { cn } from "@/lib/utils";
import { getInitials, getAvatarColor, AVATAR_COLOR_OPTIONS, dicebearUrl } from "@/lib/avatar";

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
            const medals = [
              { outer: "#f59e0b", inner: "#fbbf24", text: "#78350f" }, // gold
              { outer: "#6b7280", inner: "#9ca3af", text: "#1f2937" }, // silver
              { outer: "#b45309", inner: "#d97706", text: "#78350f" }, // bronze
            ];
            const medal = i < 3 ? medals[i] : null;

            const Row = isMe ? "div" : Link;
            const rowProps = isMe ? {} : { href: `/group/${groupId}/user/${s.userId}` };

            return (
              <Row
                key={s.userId}
                {...rowProps as any}
                className={cn(
                  "grid grid-cols-[56px_1fr_72px] sm:grid-cols-[56px_1fr_80px_88px_80px_80px] items-center border-b border-neutral-50 last:border-0 transition-colors",
                  isMe ? "bg-emerald-50/60" : "hover:bg-neutral-50 cursor-pointer"
                )}
                style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 14, paddingBottom: 14, gap: 8 }}
              >
                {/* Rank badge */}
                <div className="flex items-center">
                  {medal ? (
                    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="16" cy="16" r="16" fill={medal.outer}/>
                      <circle cx="16" cy="16" r="12" fill={medal.inner}/>
                      <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="900" fill={medal.text}>{i + 1}</text>
                    </svg>
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
                      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color.bg }}>
                        {s.avatarStyle ? (
                          <img src={dicebearUrl(s.avatarStyle, s.avatarSeed ?? s.userId)} alt="" className="w-full h-full" />
                        ) : (
                          <span style={{ color: color.text, fontSize: 11, fontWeight: "bold" }}>{getInitials(s.realName ?? s.name)}</span>
                        )}
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
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}
