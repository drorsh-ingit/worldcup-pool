import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { SimulationBanner } from "@/components/simulation-banner";
import { GroupTabs } from "@/components/group-tabs";
import { TournamentBadge } from "@/components/tournament-badge";
import { getPendingBetCounts } from "@/lib/pending-bets";
import type { GroupSettings } from "@/lib/settings";

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

  return (
    <div className="space-y-6">
      <div className="sticky top-16 z-20 bg-white shadow-sm page-x-bleed">
        {tournament && (
          <TournamentBadge kind={tournament.kind} name={tournament.name} />
        )}
        {simulation?.enabled && (
          <div className="flex items-center gap-2 py-2 border-b border-amber-100 bg-pitch-50 page-x-bleed">
            <SimulationBanner simulatedDate={simulation.simulatedDate} />
          </div>
        )}
        <GroupTabs groupId={groupId} isAdmin={isAdmin} pendingBets={pendingBets} />
      </div>
      <div className="pt-2">
        {children}
      </div>
    </div>
  );
}
