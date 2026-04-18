import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { SimulationBanner } from "@/components/simulation-banner";
import { GroupTabs } from "@/components/group-tabs";
import type { GroupSettings } from "@/lib/settings";

interface GroupLayoutProps {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}

export default async function GroupLayout({ children, params }: GroupLayoutProps) {
  const { groupId } = await params;

  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) notFound();

  const settings = group.settings as GroupSettings;
  const simulation = settings?.simulation;

  return (
    <div className="space-y-4">
      {simulation?.enabled && (
        <SimulationBanner simulatedDate={simulation.simulatedDate} />
      )}
      <GroupTabs groupId={groupId} />
      {children}
    </div>
  );
}
