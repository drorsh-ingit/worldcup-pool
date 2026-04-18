import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { Trophy, Lock, CheckCircle } from "lucide-react";
import { TeamPicker, GroupPredictionsPicker, SemifinalistsPicker } from "@/components/bets/team-picker";
import { PlayerNameForm } from "@/components/bets/player-name-form";
import { OptionPickForm } from "@/components/bets/option-pick-form";
import { GOLDEN_BOOT_CANDIDATES } from "@/lib/data/wc2026";
import { loadBetsPageData } from "@/lib/bets-page-data";

interface BetsPageProps {
  params: Promise<{ groupId: string }>;
}

function statusBadge(status: string) {
  if (status === "RESOLVED")
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full font-medium">
        <CheckCircle className="w-3 h-3" /> Resolved
      </span>
    );
  if (status === "LOCKED")
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-medium">
        <Lock className="w-3 h-3" /> Locked
      </span>
    );
  if (status === "OPEN")
    return (
      <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-medium">
        Open
      </span>
    );
  return null;
}

export default async function BetsPage({ params }: BetsPageProps) {
  const { groupId } = await params;

  const session = await auth();
  if (!session) redirect("/login");

  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.status !== "APPROVED") notFound();

  const data = await loadBetsPageData(groupId, session.user.id);

  if (!data) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 mb-4">
          <Trophy className="w-7 h-7 text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">No tournament yet</h2>
        <p className="text-sm text-neutral-500 max-w-sm mx-auto">
          The admin needs to initialize the tournament first.
        </p>
      </div>
    );
  }

  const {
    tournament,
    betByTypeId,
    teamsByGroup,
    teamWinnerOdds,
    preTournamentBets,
    milestoneBets,
    curatedBets,
    teamPointsMap,
    groupPredictionPoints,
    goldenBootPoints,
  } = data;

  if (
    preTournamentBets.length === 0 &&
    milestoneBets.length === 0 &&
    curatedBets.length === 0
  ) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl pitch-bg mb-4">
          <Trophy className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Tournament bets not open yet</h2>
        <p className="text-sm text-neutral-500 max-w-sm mx-auto">
          The admin will open pre-tournament picks, milestones, and prop bets as the tournament progresses.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {preTournamentBets.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-neutral-900">Pre-Tournament</h2>
            <span className="text-xs text-neutral-400">{preTournamentBets.length} bet{preTournamentBets.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-3">
            {preTournamentBets.map((bt) => {
              const currentBet = betByTypeId[bt.id];
              const isLocked = bt.effectiveStatus === "LOCKED" || bt.effectiveStatus === "RESOLVED";
              return (
                <div key={bt.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-neutral-900">{bt.name}</h3>
                      {statusBadge(bt.effectiveStatus)}
                    </div>
                    {bt.description && (
                      <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{bt.description}</p>
                    )}
                  </div>
                  <div className="p-4">
                    {bt.effectiveStatus === "DRAFT" ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-neutral-400">
                        <Lock className="w-5 h-5" />
                        <span className="text-sm">Opens soon</span>
                      </div>
                    ) : bt.subType === "winner" || bt.subType === "runner_up" || bt.subType === "dark_horse" || bt.subType === "reverse_dark_horse" ? (() => {
                      let filteredTeams = tournament.teams;
                      if (bt.subType === "dark_horse") {
                        filteredTeams = [...tournament.teams]
                          .sort((a, b) => ((b.odds as { winnerOdds?: number })?.winnerOdds ?? 0) - ((a.odds as { winnerOdds?: number })?.winnerOdds ?? 0))
                          .slice(0, 35);
                      } else if (bt.subType === "reverse_dark_horse") {
                        filteredTeams = [...tournament.teams]
                          .sort((a, b) => ((a.odds as { winnerOdds?: number })?.winnerOdds ?? 0) - ((b.odds as { winnerOdds?: number })?.winnerOdds ?? 0))
                          .slice(0, 15);
                      }
                      return (
                        <TeamPicker
                          groupId={groupId}
                          tournamentId={tournament.id}
                          betTypeId={bt.id}
                          isLocked={isLocked}
                          teams={filteredTeams}
                          teamOdds={teamWinnerOdds}
                          currentPrediction={currentBet?.prediction as { teamCode?: string } | undefined}
                          pointsByTeam={teamPointsMap[bt.subType]}
                        />
                      );
                    })()
                    : bt.subType === "golden_boot" ? (
                      <PlayerNameForm
                        groupId={groupId}
                        tournamentId={tournament.id}
                        betTypeId={bt.id}
                        description={bt.description}
                        isLocked={isLocked}
                        candidates={[...GOLDEN_BOOT_CANDIDATES]}
                        currentPrediction={currentBet?.prediction as { playerName?: string; teamCode?: string } | undefined}
                        pointsByCandidate={goldenBootPoints}
                      />
                    ) : bt.subType === "group_predictions" ? (
                      <GroupPredictionsPicker
                        groupId={groupId}
                        tournamentId={tournament.id}
                        betTypeId={bt.id}
                        description={bt.description}
                        isLocked={isLocked}
                        teamsByGroup={teamsByGroup}
                        currentPrediction={currentBet?.prediction as Record<string, string[]> | undefined}
                        pointsByTeam={groupPredictionPoints}
                      />
                    ) : (
                      <p className="text-sm text-neutral-400">{bt.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {milestoneBets.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-neutral-900">Milestones</h2>
            <span className="text-xs text-neutral-400">{milestoneBets.length} bet{milestoneBets.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-3">
            {milestoneBets.map((bt) => {
              const currentBet = betByTypeId[bt.id];
              const isLocked = bt.effectiveStatus === "LOCKED" || bt.effectiveStatus === "RESOLVED";
              return (
                <div key={bt.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-neutral-100 bg-pitch-50">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-neutral-900">{bt.name}</h3>
                      {statusBadge(bt.effectiveStatus)}
                    </div>
                    {bt.description && (
                      <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{bt.description}</p>
                    )}
                  </div>
                  <div className="p-4">
                    {bt.effectiveStatus === "DRAFT" ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-neutral-400">
                        <Lock className="w-5 h-5" />
                        <span className="text-sm">Opens soon</span>
                      </div>
                    ) : bt.subType === "semifinalists" ? (
                      <SemifinalistsPicker
                        groupId={groupId}
                        tournamentId={tournament.id}
                        betTypeId={bt.id}
                        description={bt.description}
                        isLocked={isLocked}
                        teamsByGroup={teamsByGroup}
                        currentPrediction={currentBet?.prediction as { teams?: string[] } | undefined}
                      />
                    ) : (
                      <p className="text-sm text-neutral-400">{bt.description ?? bt.name}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {curatedBets.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-neutral-900">Prop Bets</h2>
            <span className="text-xs text-neutral-400">{curatedBets.length} bet{curatedBets.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-3">
            {curatedBets.map((bt) => {
              const currentBet = betByTypeId[bt.id];
              const isLocked = bt.effectiveStatus === "LOCKED" || bt.effectiveStatus === "RESOLVED";
              const config = bt.config as { options?: string[] };
              return (
                <div key={bt.id} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-neutral-100 bg-amber-50">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-neutral-900">{bt.name}</h3>
                      {statusBadge(bt.effectiveStatus)}
                    </div>
                    {bt.description && (
                      <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{bt.description}</p>
                    )}
                  </div>
                  <div className="p-4">
                    {bt.effectiveStatus === "DRAFT" ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-neutral-400">
                        <Lock className="w-5 h-5" />
                        <span className="text-sm">Opens soon</span>
                      </div>
                    ) : (
                      <OptionPickForm
                        groupId={groupId}
                        tournamentId={tournament.id}
                        betTypeId={bt.id}
                        description={bt.description}
                        options={config.options ?? []}
                        isLocked={isLocked}
                        currentPrediction={currentBet?.prediction as { option?: string } | undefined}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
