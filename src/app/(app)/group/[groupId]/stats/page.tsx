import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getGroupStats } from "@/lib/group-stats";
import { StatsSummary } from "@/components/stats/stats-summary";
import { StatsGrid } from "@/components/stats/stats-grid";
import { StatsH2H } from "@/components/stats/stats-h2h";
import { LiveScoresProvider } from "@/components/stats/live-scores-context";

interface StatsPageProps {
  params: Promise<{ groupId: string }>;
}

export default async function StatsPage({ params }: StatsPageProps) {
  const { groupId } = await params;

  const session = await auth();
  if (!session) redirect("/login");

  const { data, error } = await getGroupStats(groupId);
  if (error === "forbidden") notFound();
  if (error || !data) notFound();

  const selfSummary = data.summaryByUser[data.selfId];
  const inPlayMatchIds = data.matches.filter((m) => !m.completed).map((m) => m.id);

  return (
    <div className="flex flex-col" style={{ gap: 28 }}>
      <div>
        <h1 className="text-4xl font-black tracking-tight text-neutral-900">Stats</h1>
        <p className="text-sm text-neutral-500" style={{ marginTop: 6 }}>
          Your prediction accuracy and how the group compares.
        </p>
      </div>

      {/* Capped so the cards don't stretch edge-to-edge on wide screens; on mobile
          the viewport is narrower than the cap, so it stays full-width. */}
      <div style={{ maxWidth: 560, width: "100%" }}>
        <StatsSummary summary={selfSummary} />
      </div>

      <LiveScoresProvider groupId={groupId} matchIds={inPlayMatchIds}>
        {/* Desktop / tablet: full grid */}
        <div className="hidden sm:block">
          <StatsGrid data={data} />
        </div>

        {/* Mobile: head-to-head with one other member */}
        <div className="sm:hidden">
          <StatsH2H data={data} />
        </div>
      </LiveScoresProvider>
    </div>
  );
}
