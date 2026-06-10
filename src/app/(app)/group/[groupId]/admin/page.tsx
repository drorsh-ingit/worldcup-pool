import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Users, Bell } from "lucide-react";
import { CopySlugButton } from "@/components/copy-slug-button";
import { CopyInviteLinkButton } from "@/components/copy-invite-link-button";
import { TestPushButton } from "@/components/admin/test-push-button";
import { SimulationControl } from "@/components/admin/simulation-control";
import { ScoringSettings, type OddsData } from "@/components/admin/scoring-settings";
import { DeleteGroupButton } from "@/components/admin/delete-group-button";
import { resolveGroupSettings, type GroupSettings } from "@/lib/settings";
import { GOLDEN_BOOT_CANDIDATES } from "@/lib/data/wc2026";
import { calculatePoints } from "@/lib/scoring";

interface AdminPageProps {
  params: Promise<{ groupId: string }>;
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { groupId } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") notFound();

  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) notFound();
  const groupSettings = resolveGroupSettings(group.settings);

  const tournament = await db.tournament.findFirst({
    where: { groupId },
    include: {
      teams: { orderBy: [{ groupLetter: "asc" }, { name: "asc" }] },
      betTypes: { orderBy: { category: "asc" } },
    },
  });

  const approvedCount = await db.groupMembership.count({
    where: { groupId, status: "APPROVED" },
  });

  // Build odds data for scoring settings display
  const oddsData: OddsData = {};
  if (tournament) {
    type TeamOdds = { winnerOdds?: number; groupWinnerOdds?: number; qualifyOdds?: number };
    const teams = tournament.teams;
    const totalPool = groupSettings.totalPool ?? 1000;

    const BET_KEY_TO_SUBTYPE: Record<string, string> = {
      winner: "winner",
      runnerUp: "runner_up",
      darkHorse: "dark_horse",
      reverseDarkHorse: "reverse_dark_horse",
      groupPredictions: "group_predictions",
      goldenBoot: "golden_boot",
      matchWinner: "match_winner",
      correctScore: "correct_score",
      bracket: "bracket",
      goldenGlove: "golden_glove",
      goldenBall: "golden_ball",
      semifinalists: "semifinalists",
      props: "prop",
    };

    function withPoints(betKey: string, entries: { label: string; odds: number }[]) {
      const subType = BET_KEY_TO_SUBTYPE[betKey];
      return entries.map((e) => ({
        ...e,
        points: subType
          ? calculatePoints(true, subType, 1 / Math.max(e.odds, 1), groupSettings, "GROUP", totalPool, Math.max(approvedCount, 1)).totalPoints
          : undefined,
      }));
    }

    // Winner / Runner Up / Dark Horse all use winnerOdds
    const winnerEntries = teams
      .map((t) => ({ label: `${t.code} ${t.name}`, odds: ((t.odds as TeamOdds)?.winnerOdds ?? 1000) }))
      .sort((a, b) => a.odds - b.odds);
    oddsData.winner = withPoints("winner", winnerEntries);
    oddsData.runnerUp = withPoints("runnerUp", winnerEntries);
    oddsData.darkHorse = withPoints("darkHorse", winnerEntries.filter((e) => e.odds >= 6000));
    // Reverse dark horse: points calculated from inverted odds (bigger favourite → more points)
    // but displayed odds stay raw so the admin sees actual team odds.
    oddsData.reverseDarkHorse = winnerEntries.filter((e) => e.odds <= 5100).map((e) => {
      const invertedOdds = Math.max(1, 4000000 / e.odds);
      return {
        ...e,
        points: calculatePoints(true, "reverse_dark_horse", 1 / invertedOdds, groupSettings, "GROUP", totalPool, Math.max(approvedCount, 1)).totalPoints,
      };
    });

    // Group predictions use groupWinnerOdds
    const groupEntries = teams
      .map((t) => ({ label: `${t.code} (Grp ${t.groupLetter})`, odds: ((t.odds as TeamOdds)?.groupWinnerOdds ?? 300) }))
      .sort((a, b) => a.odds - b.odds);
    oddsData.groupPredictions = withPoints("groupPredictions", groupEntries);

    // Golden Boot candidates
    const goldenBootEntries = GOLDEN_BOOT_CANDIDATES.map((c) => ({
      label: `${c.playerName} (${c.teamCode})`,
      odds: c.odds,
    }));
    oddsData.goldenBoot = withPoints("goldenBoot", goldenBootEntries);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      {/* Header */}
      <div>
        <Link
          href={`/group/${groupId}`}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          style={{ marginBottom: 12 }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to group
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">Manage group</h1>
        <p className="text-sm text-neutral-500" style={{ marginTop: 4 }}>{group.name}</p>
      </div>

      {/* Invite code */}
      <section style={{ padding: 20 }} className="rounded-xl border border-neutral-200 bg-white space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-neutral-400" />
          <h2 className="font-display text-sm font-semibold text-neutral-900">Invite code</h2>
        </div>
        <p className="text-sm text-neutral-500">
          Share the code, or send a direct link that adds them straight into the group.
        </p>
        <div className="flex items-center flex-wrap" style={{ gap: 12 }}>
          <CopySlugButton slug={group.slug} />
          <CopyInviteLinkButton slug={group.slug} />
        </div>
      </section>

      {/* Notifications */}
      <section style={{ padding: 20 }} className="rounded-xl border border-neutral-200 bg-white space-y-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-neutral-400" />
          <h2 className="font-display text-sm font-semibold text-neutral-900">Notifications</h2>
        </div>
        <p className="text-sm text-neutral-500">
          Send a test push to every group member who has enabled notifications on their device.
        </p>
        <TestPushButton groupId={groupId} />
      </section>

      {/* Simulation control */}
      <SimulationControl
        groupId={groupId}
        simulationEnabled={!!groupSettings?.simulation?.enabled}
        simulatedDate={groupSettings?.simulation?.simulatedDate ?? null}
        awards={groupSettings?.simulation?.awards}
      />

      {/* Scoring settings */}
      {tournament && (
        <ScoringSettings
          groupId={groupId}
          settings={groupSettings}
          oddsData={oddsData}
          locked={tournament.betTypes.some((bt) => bt.status !== "DRAFT")}
        />
      )}

      {/* Danger zone */}
      <section style={{ padding: 20 }} className="rounded-xl border border-red-100 bg-red-50 space-y-3">
        <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
        <DeleteGroupButton groupId={groupId} groupName={group.name} />
      </section>

    </div>
  );
}
