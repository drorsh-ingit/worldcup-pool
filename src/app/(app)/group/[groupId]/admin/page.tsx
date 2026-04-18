import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trophy, Users, Sliders } from "lucide-react";
import { CopySlugButton } from "@/components/copy-slug-button";
import { InitTournamentButton } from "@/components/admin/init-tournament-button";
import { RefreshOddsButton } from "@/components/admin/refresh-odds-button";
import { BetTypeControls } from "@/components/admin/bet-type-controls";
import { CuratedPropForm } from "@/components/admin/curated-prop-form";
import { SimulationControl } from "@/components/admin/simulation-control";
import { ScoringSettings, type OddsData } from "@/components/admin/scoring-settings";
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
    oddsData.darkHorse = withPoints("darkHorse", winnerEntries.slice(-35));
    // Reverse dark horse: points calculated from inverted odds (bigger favourite → more points)
    // but displayed odds stay raw so the admin sees actual team odds.
    oddsData.reverseDarkHorse = winnerEntries.slice(0, 15).map((e) => {
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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href={`/group/${groupId}`}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-3 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to group
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-neutral-900">Manage group</h1>
        <p className="text-sm text-neutral-500 mt-1">{group.name}</p>
      </div>

      {/* Simulation control */}
      <SimulationControl
        groupId={groupId}
        simulationEnabled={!!groupSettings?.simulation?.enabled}
        simulatedDate={groupSettings?.simulation?.simulatedDate ?? null}
        awards={groupSettings?.simulation?.awards}
      />

      {/* Invite code */}
      <section className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-neutral-400" />
          <h2 className="font-display text-sm font-semibold text-neutral-900">Invite code</h2>
        </div>
        <p className="text-sm text-neutral-500">
          Share this code so friends can request to join your group.
        </p>
        <CopySlugButton slug={group.slug} />
      </section>

      {/* Tournament setup */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h2 className="font-display text-sm font-semibold text-neutral-900">Tournament</h2>
        </div>

        {!tournament ? (
          <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-1">
            <p className="text-sm font-medium text-neutral-900 mb-3">No tournament set up yet</p>
            <InitTournamentButton groupId={groupId} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status + stats */}
            <div className="p-4 rounded-xl border border-neutral-200 bg-white space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-900">{tournament.name}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {tournament.teams.length} teams · {tournament.betTypes.length} bet types
                  </p>
                </div>
                <div className="flex gap-3 text-xs text-neutral-500">
                  <span>{approvedCount} members</span>
                </div>
              </div>
              <RefreshOddsButton tournamentId={tournament.id} />
            </div>

            {/* Groups overview */}
            <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
              <div className="px-4 py-2.5 border-b border-neutral-100 bg-neutral-50">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Groups &amp; Teams
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-neutral-100">
                {["A","B","C","D","E","F","G","H","I","J","K","L"].map((letter) => {
                  const groupTeams = tournament.teams.filter((t) => t.groupLetter === letter);
                  return (
                    <div key={letter} className="bg-white p-3">
                      <p className="text-xs font-semibold text-amber-500 mb-1.5">Group {letter}</p>
                      {groupTeams.map((t) => (
                        <p key={t.id} className="text-xs text-neutral-700 leading-5">
                          {t.code} — {t.name}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Scoring settings */}
      {tournament && (
        <ScoringSettings
          groupId={groupId}
          settings={groupSettings}
          oddsData={oddsData}
        />
      )}

      {/* Bet type controls */}
      {tournament && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-neutral-500" />
            <h2 className="font-display text-sm font-semibold text-neutral-900">Bet Types</h2>
          </div>
          <p className="text-sm text-neutral-500 -mt-2">
            Open bets so members can place predictions. Lock when bets should close. Resolve with the correct answer to trigger scoring.
          </p>
          <BetTypeControls
            groupId={groupId}
            betTypes={tournament.betTypes.map((bt) => ({
              id: bt.id,
              name: bt.name,
              subType: bt.subType,
              description: bt.description,
              category: bt.category,
              status: bt.status as "DRAFT" | "OPEN" | "LOCKED" | "RESOLVED",
              opensAt: bt.opensAt,
              locksAt: bt.locksAt,
            }))}
          />
          <CuratedPropForm groupId={groupId} tournamentId={tournament.id} />
        </section>
      )}

    </div>
  );
}
