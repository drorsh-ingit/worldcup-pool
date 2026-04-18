import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

interface UserBetsPageProps {
  params: Promise<{ groupId: string; userId: string }>;
}

export default async function UserBetsPage({ params }: UserBetsPageProps) {
  const { groupId, userId } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  // Verify current user is a member of this group
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

  // Get target user info
  const targetUser = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });

  if (!targetUser) notFound();

  // Verify target user is also in this group
  const targetMembership = await db.groupMembership.findUnique({
    where: {
      userId_groupId: {
        userId,
        groupId,
      },
    },
  });

  if (!targetMembership || targetMembership.status !== "APPROVED") {
    notFound();
  }

  const isOwnProfile = session.user.id === userId;

  // Get bets - only show resolved bets for other users
  const bets = await db.bet.findMany({
    where: {
      userId,
      betType: {
        tournament: { groupId },
        // Only show bets that are resolved (for other users)
        ...(isOwnProfile ? {} : { status: "RESOLVED" }),
      },
    },
    include: {
      betType: { select: { name: true, category: true, subType: true, status: true } },
      match: {
        select: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          actualHomeScore: true,
          actualAwayScore: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/group/${groupId}`}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-3 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to standings
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          {isOwnProfile ? "Your predictions" : `${targetUser.name}'s predictions`}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {isOwnProfile
            ? "All your submitted predictions"
            : "Only resolved bets are visible"}
        </p>
      </div>

      {bets.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-100 mb-4">
            <Lock className="w-7 h-7 text-neutral-400" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-1">
            {isOwnProfile ? "No predictions yet" : "No visible predictions"}
          </h2>
          <p className="text-sm text-neutral-500 max-w-sm mx-auto">
            {isOwnProfile
              ? "Your predictions will appear here once you start betting."
              : "Other users' predictions become visible after bets are resolved."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {bets.map((bet) => (
            <div
              key={bet.id}
              className="flex items-center justify-between p-4 rounded-xl border border-neutral-200 bg-white"
            >
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {bet.betType.name}
                </p>
                {bet.match && (
                  <p className="text-sm text-neutral-500">
                    {bet.match.homeTeam.name} vs {bet.match.awayTeam.name}
                  </p>
                )}
                <p className="text-sm text-neutral-400 mt-0.5">
                  Prediction: {JSON.stringify(bet.prediction)}
                </p>
              </div>
              <div className="text-right">
                {bet.totalPoints != null ? (
                  <span
                    className={`text-sm font-semibold ${
                      bet.totalPoints > 0 ? "text-emerald-600" : "text-neutral-400"
                    }`}
                  >
                    {bet.totalPoints > 0 ? "+" : ""}
                    {bet.totalPoints.toFixed(1)} pts
                  </span>
                ) : (
                  <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">
                    Pending
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
