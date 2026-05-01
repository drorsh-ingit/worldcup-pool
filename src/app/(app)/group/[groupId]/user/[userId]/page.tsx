import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, CheckCircle } from "lucide-react";
import { MatchBetCard } from "@/components/bets/match-bet-card";
import { TeamPicker, GroupPredictionsPicker, SemifinalistsPicker } from "@/components/bets/team-picker";
import { PlayerNameForm } from "@/components/bets/player-name-form";
import { BracketPicker } from "@/components/bets/bracket-picker";
import { UserPredictionsTabs } from "@/components/bets/user-predictions-tabs";
import { GOLDEN_BOOT_CANDIDATES, GOLDEN_BALL_CANDIDATES, GOLDEN_GLOVE_CANDIDATES } from "@/lib/data/wc2026";
import type { BetsPageData } from "@/lib/bets-page-data";
import { loadBetsPageData, buildMatchCardProps, PHASE_ORDER } from "@/lib/bets-page-data";
import { calculateGroupStandings } from "@/lib/tournament-engine";

interface UserBetsPageProps {
  params: Promise<{ groupId: string; userId: string }>;
}

type Candidate = { playerName: string; teamCode: string; odds: number };

function resolveCandidates(
  bt: BetsPageData["betTypesWithEffectiveStatus"][number],
  fallback: readonly Candidate[],
  filterByAdvancing: <T extends { teamCode: string }>(c: readonly T[]) => T[]
): Candidate[] {
  const frozen = (bt.frozenOdds as { candidates?: Candidate[] } | null)?.candidates;
  const base: readonly Candidate[] = frozen ?? fallback;
  return filterByAdvancing(base).slice(0, 12);
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
      <span className="inline-flex items-center gap-1 text-xs bg-pitch-50 text-pitch-700 px-2 py-0.5 rounded-full font-medium">
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

export default async function UserBetsPage({ params }: UserBetsPageProps) {
  const { groupId, userId } = await params;
  const session = await auth();
  if (!session) redirect("/login");

  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.status !== "APPROVED") notFound();

  const targetUser = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!targetUser) notFound();

  const targetMembership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
  if (!targetMembership || targetMembership.status !== "APPROVED") notFound();

  const isOwnProfile = session.user.id === userId;

  const data = await loadBetsPageData(groupId, userId);

  if (!data) {
    return (
      <div className="space-y-4">
        <BackLink groupId={groupId} name={targetUser.name} isOwn={isOwnProfile} />
        <p className="text-sm text-neutral-500">No tournament yet.</p>
      </div>
    );
  }

  const {
    tournament,
    effectiveNow,
    betByTypeId,
    teamsByGroup,
    teamWinnerOdds,
    teamQualifyOdds,
    teamPointsMap,
    semifinalistPointsMap,
    groupPredictionPoints,
    groupQualifierPoints,
    goldenBootPoints,
    goldenBallPoints,
    goldenGlovePoints,
    bracketPickPoints,
  } = data;

  // Match predictions: visible once kickoff has passed (betting permanently closed)
  const visibleMatches = isOwnProfile
    ? tournament.matches
    : tournament.matches.filter((m) => effectiveNow > new Date(m.kickoffAt));

  // Tournament/curated bets: visible when LOCKED or RESOLVED. Use the pre-sorted lists
  // from loadBetsPageData so the order matches the bets page.
  const visibilityFilter = (bt: { effectiveStatus: string }) =>
    isOwnProfile || bt.effectiveStatus === "LOCKED" || bt.effectiveStatus === "RESOLVED";
  const tournamentBets = data.tournamentBets.filter(visibilityFilter);
  const curatedBets = data.curatedBets.filter(visibilityFilter);
  const visibleNonGameBets = [...tournamentBets, ...curatedBets];
  const groupStandings = calculateGroupStandings(
    tournament.matches as Parameters<typeof calculateGroupStandings>[0],
    tournament.teams
  );

  const R16_PLUS = new Set(["R16", "QF", "SF", "FINAL"]);
  const semifinalistEligibleCodes = new Set<string>();
  for (const m of tournament.matches) {
    if (R16_PLUS.has(m.phase)) {
      if (m.homeTeam) semifinalistEligibleCodes.add(m.homeTeam.code);
      if (m.awayTeam) semifinalistEligibleCodes.add(m.awayTeam.code);
    }
  }
  const semifinalistTeams = (
    semifinalistEligibleCodes.size > 0
      ? tournament.teams.filter((t) => semifinalistEligibleCodes.has(t.code))
      : tournament.teams
  ).filter((t) => t.code !== "TBD");

  const advancingTeamCodes = new Set<string>();
  for (const m of tournament.matches) {
    if (["R32", "R16", "QF", "SF", "FINAL"].includes(m.phase)) {
      if (m.homeTeam) advancingTeamCodes.add(m.homeTeam.code);
      if (m.awayTeam) advancingTeamCodes.add(m.awayTeam.code);
    }
  }
  const filterByAdvancing = <T extends { teamCode: string }>(candidates: readonly T[]) =>
    advancingTeamCodes.size > 0
      ? candidates.filter((c) => advancingTeamCodes.has(c.teamCode))
      : [...candidates];

  type BetTypeItem = BetsPageData["tournamentBets"][number];

  function renderBetCard(bt: BetTypeItem) {
    const currentBet = betByTypeId[bt.id];
    const isLocked = bt.effectiveStatus === "LOCKED" || bt.effectiveStatus === "RESOLVED";
    const isWide = bt.subType === "group_predictions" || bt.subType === "semifinalists";

    let groupPredictionsPointsEarned: number | null = null;
    if (bt.subType === "group_predictions") {
      const resolution = bt.resolution as { winners?: Record<string, string>; advancing?: string[] } | undefined;
      const picks = (currentBet?.prediction as Record<string, string[]> | undefined) ?? {};
      if (resolution) {
        const actualWinners = resolution.winners ?? {};
        const actualAdvancing = new Set(resolution.advancing ?? []);
        let total = 0;
        for (const [letter, arr] of Object.entries(picks)) {
          const winnerCode = arr?.[0];
          const advancerCodes = arr?.slice(1) ?? [];
          if (winnerCode) {
            if (actualWinners[letter] === winnerCode) {
              total += groupPredictionPoints?.[winnerCode] ?? 0;
            } else if (actualAdvancing.has(winnerCode)) {
              total += groupQualifierPoints?.[winnerCode] ?? 0;
            }
          }
          for (const code of advancerCodes) {
            if (actualAdvancing.has(code)) {
              total += groupQualifierPoints?.[code] ?? 0;
            }
          }
        }
        groupPredictionsPointsEarned = total;
      }
    }

    return (
      <div key={bt.id} className={`rounded-xl border border-neutral-200 bg-white shadow-sm ${isWide ? "w-full" : "max-w-sm"}`}>
        <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-100 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900">{bt.name}</h3>
            <div className="flex items-center gap-3">
              {groupPredictionsPointsEarned !== null && (
                <span className="text-base font-bold text-emerald-600 tabular-nums">
                  {groupPredictionsPointsEarned.toFixed(1)} pts earned
                </span>
              )}
              {statusBadge(bt.effectiveStatus)}
            </div>
          </div>
          {bt.description && (
            <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{bt.description}</p>
          )}
        </div>
        <div style={{ padding: isWide ? "1rem 1.25rem 1.5rem" : "1.25rem" }} className="bg-white">
          {bt.subType === "winner" || bt.subType === "runner_up" || bt.subType === "dark_horse" || bt.subType === "reverse_dark_horse" ? (() => {
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
                teamOdds={bt.subType === "reverse_dark_horse" ? teamQualifyOdds : teamWinnerOdds}
                currentPrediction={currentBet?.prediction as { teamCode?: string } | undefined}
                pointsByTeam={teamPointsMap[bt.subType]}
                tournamentKind={tournament.kind}
                resolution={bt.resolution as { teamCode?: string; teams?: string[] } | undefined}
                earnedPoints={currentBet?.totalPoints ?? null}
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
              qualifierPointsByTeam={groupQualifierPoints}
              resolution={bt.resolution as { winners?: Record<string, string>; advancing?: string[] } | undefined}
              groupStandings={groupStandings}
            />
          ) : bt.subType === "semifinalists" ? (
            <SemifinalistsPicker
              groupId={groupId}
              tournamentId={tournament.id}
              betTypeId={bt.id}
              description={bt.description}
              isLocked={isLocked}
              teams={semifinalistTeams}
              tournamentKind={tournament.kind}
              currentPrediction={currentBet?.prediction as { teams?: string[] } | undefined}
              pointsByTeam={semifinalistPointsMap}
            />
          ) : bt.subType === "golden_ball" ? (
            <PlayerNameForm
              groupId={groupId}
              tournamentId={tournament.id}
              betTypeId={bt.id}
              description={bt.description}
              isLocked={isLocked}
              candidates={resolveCandidates(bt, GOLDEN_BALL_CANDIDATES, filterByAdvancing)}
              currentPrediction={currentBet?.prediction as { playerName?: string; teamCode?: string } | undefined}
              pointsByCandidate={goldenBallPoints}
            />
          ) : bt.subType === "golden_glove" ? (
            <PlayerNameForm
              groupId={groupId}
              tournamentId={tournament.id}
              betTypeId={bt.id}
              description={bt.description}
              isLocked={isLocked}
              candidates={resolveCandidates(bt, GOLDEN_GLOVE_CANDIDATES, filterByAdvancing)}
              currentPrediction={currentBet?.prediction as { playerName?: string; teamCode?: string } | undefined}
              pointsByCandidate={goldenGlovePoints}
            />
          ) : bt.subType === "bracket" ? (
            <BracketPicker
              groupId={groupId}
              tournamentId={tournament.id}
              betTypeId={bt.id}
              isLocked={isLocked}
              tournamentKind={tournament.kind}
              matches={tournament.matches
                .filter((m) => ["R32","R16","QF","SF","FINAL"].includes(m.phase))
                .map((m) => ({
                  id: m.id,
                  homeTeam: { code: m.homeTeam.code, name: m.homeTeam.name },
                  awayTeam: { code: m.awayTeam.code, name: m.awayTeam.name },
                  phase: m.phase,
                  status: m.status,
                  kickoffAt: m.kickoffAt,
                  actualHomeScore: m.actualHomeScore,
                  actualAwayScore: m.actualAwayScore,
                }))}
              currentPrediction={currentBet?.prediction as { picks?: Record<string, string> } | undefined}
              resolution={bt.resolution as { winners?: Record<string, string> } | undefined}
              pointsByPickKey={bracketPickPoints}
            />
          ) : (
            <p className="text-sm text-neutral-400">{bt.description}</p>
          )}
        </div>
      </div>
    );
  }

  function Section({ title, bets, hideTitle }: { title: string; bets: BetTypeItem[]; hideTitle?: boolean }) {
    if (bets.length === 0) return null;
    return (
      <section className="flex flex-col gap-6">
        {!hideTitle && (
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
            <h2 className="font-display font-semibold text-neutral-900">{title}</h2>
            <span className="text-xs text-neutral-400">{bets.length} bet{bets.length !== 1 ? "s" : ""}</span>
          </div>
        )}
        <div className="flex flex-col gap-10">
          {bets.map((bt) => renderBetCard(bt))}
        </div>
      </section>
    );
  }

  const hasAnything = visibleMatches.length > 0 || visibleNonGameBets.length > 0;

  if (!hasAnything) {
    return (
      <div className="flex flex-col gap-8">
        <BackLink groupId={groupId} name={targetUser.name} isOwn={isOwnProfile} />
        <div
          className="text-center"
          style={{ paddingTop: 80, paddingBottom: 80, paddingLeft: 16, paddingRight: 16 }}
        >
          <div
            className="inline-flex items-center justify-center rounded-2xl bg-neutral-100"
            style={{ width: 56, height: 56, marginBottom: 16 }}
          >
            <Lock className="w-7 h-7 text-neutral-400" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900" style={{ marginBottom: 8 }}>
            No visible predictions
          </h2>
          <p
            className="text-sm text-neutral-500"
            style={{ maxWidth: 384, marginLeft: "auto", marginRight: "auto" }}
          >
            Predictions become visible once the betting window closes.
          </p>
        </div>
      </div>
    );
  }

  // Group phases for match cards — latest phase first
  const phases = ([...new Set(visibleMatches.map((m) => m.phase))] as string[]).sort(
    (a, b) => PHASE_ORDER.indexOf(b) - PHASE_ORDER.indexOf(a)
  );

  const tournamentTab = (
    <div className="flex flex-col gap-12">
      <Section title="Tournament" bets={tournamentBets} />
      <Section title="Bonus Bets" bets={curatedBets} />
    </div>
  );

  const matchesTab = visibleMatches.length > 0 ? (
    <div className="flex flex-col gap-8">
      {phases.map((phase) => {
        const phaseMatches = visibleMatches.filter((m) => m.phase === phase);
        const byDate: Record<string, typeof phaseMatches> = {};
        for (const m of phaseMatches) {
          const dateKey = new Date(m.kickoffAt).toLocaleDateString("en-US", {
            weekday: "short", month: "short", day: "numeric",
          });
          if (!byDate[dateKey]) byDate[dateKey] = [];
          byDate[dateKey].push(m);
        }
        const dates = Object.keys(byDate).sort(
          (a, b) => new Date(byDate[b][0].kickoffAt).getTime() - new Date(byDate[a][0].kickoffAt).getTime()
        );
        return (
          <div key={phase} className="flex flex-col gap-8">
            {dates.map((dateKey) => (
              <div key={dateKey} className="flex flex-col gap-4">
                <span className="text-xs font-medium text-neutral-400">{dateKey}</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {byDate[dateKey].map((match) => {
                    const props = buildMatchCardProps(data, match);
                    return (
                      <MatchBetCard
                        key={match.id}
                        groupId={groupId}
                        tournamentId={tournament.id}
                        tournamentKind={tournament.kind}
                        match={{
                          id: match.id,
                          homeTeamCode: match.homeTeam?.code ?? "TBD",
                          awayTeamCode: match.awayTeam?.code ?? "TBD",
                          homeTeamName: match.homeTeam?.name ?? "",
                          awayTeamName: match.awayTeam?.name ?? "",
                          kickoffAt: match.kickoffAt,
                          phase: match.phase,
                          groupLetter: match.groupLetter,
                          status: match.status as "UPCOMING" | "LOCKED" | "COMPLETED",
                          actualHomeScore: match.actualHomeScore,
                          actualAwayScore: match.actualAwayScore,
                        }}
                        matchWinnerBetTypeId={props.mwBetId}
                        correctScoreBetTypeId={props.csBetId}
                        betsOpen={false}
                        currentMatchWinner={props.mwBet?.prediction as { outcome?: string } | undefined}
                        currentCorrectScore={props.csBet?.prediction as { homeScore?: number; awayScore?: number } | undefined}
                        outcomePoints={props.matchOutcomePoints}
                        scorePointsMap={props.scorePointsMap}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-12" style={{ marginLeft: "3rem" }}>
      <BackLink groupId={groupId} name={targetUser.name} isOwn={isOwnProfile} />

      <UserPredictionsTabs
        tournamentTab={tournamentTab}
        matchesTab={matchesTab}
        hasTournament={visibleNonGameBets.length > 0}
        hasMatches={visibleMatches.length > 0}
        tournamentCount={visibleNonGameBets.length}
        matchesCount={visibleMatches.length}
      />
    </div>
  );
}

function BackLink({ groupId, name, isOwn }: { groupId: string; name: string; isOwn: boolean }) {
  return (
    <div>
      <Link
        href={`/group/${groupId}`}
        className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 mb-3 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to standings
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
        {isOwn ? "Your predictions" : `${name}'s predictions`}
      </h1>
    </div>
  );
}
