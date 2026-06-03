import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { SimulationBanner } from "@/components/simulation-banner";
import { GroupTabs } from "@/components/group-tabs";
import { SetNavTabs } from "@/components/set-nav-tabs";
import { TournamentBadge } from "@/components/tournament-badge";
import { getPendingBetCounts } from "@/lib/pending-bets";
import type { GroupSettings } from "@/lib/settings";
import { Trophy, CalendarDays, Target, Settings } from "lucide-react";

interface GroupLayoutProps {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}

export default async function GroupLayout({ children, params }: GroupLayoutProps) {
  const { groupId } = await params;

  const [group, session] = await Promise.all([
    db.group.findUnique({ where: { id: groupId } }),
    auth(),
  ]);
  if (!group) notFound();

  const membership = session?.user?.id
    ? await db.groupMembership.findUnique({
        where: { userId_groupId: { userId: session.user.id, groupId } },
        select: { role: true },
      })
    : null;
  const isAdmin = membership?.role === "ADMIN";

  const settings = group.settings as GroupSettings;
  const simulation = settings?.simulation;

  const [tournament, pendingBets] = await Promise.all([
    db.tournament.findFirst({
      where: { groupId },
      select: { name: true, kind: true },
    }),
    session?.user?.id
      ? getPendingBetCounts(groupId, session.user.id)
      : { matches: 0, tournament: 0 },
  ]);

  const base = `/group/${groupId}`;
  const navTabs = [
    { href: base, label: "Standings", icon: Trophy, exact: true, pending: 0 },
    { href: `${base}/matches`, label: "Matches", icon: CalendarDays, pending: pendingBets?.matches ?? 0 },
    { href: `${base}/bets`, label: "Tournament", icon: Target, pending: pendingBets?.tournament ?? 0 },
    ...(isAdmin ? [{ href: `${base}/admin`, label: "Admin", icon: Settings, exact: false as const, pending: 0 }] : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Inject tabs into the AppNav header via context */}
      <SetNavTabs tabs={navTabs} />

      {/* Sub-header: only tournament badge + simulation banner (no desktop tabs here) */}
      {(tournament || simulation?.enabled) && (
        <div className="sticky top-14 z-20 bg-white shadow-sm page-x-bleed">
          {tournament && (
            <TournamentBadge kind={tournament.kind} name={tournament.name} />
          )}
          {simulation?.enabled && (
            <div className="flex items-center border-b border-amber-100 bg-pitch-50 page-x-bleed" style={{ gap: 8, paddingTop: 8, paddingBottom: 8 }}>
              <SimulationBanner simulatedDate={simulation.simulatedDate} />
            </div>
          )}
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <GroupTabs groupId={groupId} isAdmin={isAdmin} pendingBets={pendingBets} mobileOnly />

      <div style={{ paddingTop: 20 }}>
        {children}
      </div>
      {/* Spacer for fixed bottom nav on mobile */}
      <div className="sm:hidden" style={{ height: 80 }} aria-hidden="true" />
    </div>
  );
}
