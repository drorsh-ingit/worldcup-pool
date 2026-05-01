import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { Trophy, Lock, CheckCircle } from "lucide-react";
import { TeamPicker, GroupPredictionsPicker, SemifinalistsPicker } from "@/components/bets/team-picker";
import { PlayerNameForm } from "@/components/bets/player-name-form";
import { OptionPickForm } from "@/components/bets/option-pick-form";
import { BracketPicker } from "@/components/bets/bracket-picker";
import { GOLDEN_BOOT_CANDIDATES, GOLDEN_BALL_CANDIDATES, GOLDEN_GLOVE_CANDIDATES } from "@/lib/data/wc2026";
import type { BetsPageData } from "@/lib/bets-page-data";
import { loadBetsPageData } from "@/lib/bets-page-data";
import { calculateGroupStandings } from "@/lib/tournament-engine";

interface BetsPageProps {
  params: Promise<{ groupId: string }>;
}

type Candidate = { playerName: string; teamCode: string; odds: number };

/** Read candidates from frozenOdds if present (snapshotted at open time), otherwise fall back
 *  to the static list. Applies the advancing-team filter then trims to top 12 by odds. */
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
      <div
        className="text-center"
        style={{ paddingTop: 80, paddingBottom: 80, paddingLeft: 16, paddingRight: 16 }}
      >
        <div
          className="inline-flex items-center justify-center rounded-2xl bg-pitch-50"
          style={{ width: 56, height: 56, marginBottom: 16 }}
        >
          <Trophy className="w-7 h-7 text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-neutral-900" style={{ marginBottom: 8 }}>No tournament yet</h2>
        <p
          className="text-sm text-neutral-500"
          style={{ maxWidth: 384, marginLeft: "auto", marginRight: "auto" }}
        >
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
    teamQualifyOdds,
    tournamentBets,
    curatedBets,
    teamPointsMap,
    semifinalistPointsMap,
    groupPredictionPoints,
    groupQualifierPoints,
    goldenBootPoints,
    goldenBallPoints,
    goldenGlovePoints,
    bracketPickPoints,
  } = data;

  // Teams that advanced from the group stage (appear in R32+ matches)
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

  if (tournamentBets.length === 0 && curatedBets.length === 0) {
    return (
      <div
        className="text-center"
        style={{ paddingTop: 80, paddingBottom: 80, paddingLeft: 16, paddingRight: 16 }}
      >
        <div
          className="inline-flex items-center justify-center rounded-2xl pitch-bg"
          style={{ width: 56, height: 56, marginBottom: 16 }}
        >
          <Trophy className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-lg font-semibold text-neutral-900" style={{ marginBottom: 8 }}>Tournament bets not open yet</h2>
        <p
          className="text-sm text-neutral-500"
          style={{ lineHeight: 1.6, maxWidth: 384, marginLeft: "auto", marginRight: "auto" }}
        >
          The admin will open tournament picks and bonus bets as the tournament progresses.
        </p>
      </div>
    );
  }

  const groupStandings = calculateGroupStandings(
    tournament.matches as Parameters<typeof calculateGroupStandings>[0],
    tournament.teams
  );

  // Teams eligible for the Semifinalists bet: those appearing in R16+ phase matches
  const R16_PLUS = new Set(["R16", "QF", "SF", "FINAL"]);
  const semifinalistEligibleCodes = new Set<string>();
  for (const m of tournament.matches) {
    if (R16_PLUS.has(m.phase)) {
      if (m.homeTeam) semifinalistEligibleCodes.add(m.homeTeam.code);
      if (m.awayTeam) semifinalistEligibleCodes.add(m.awayTeam.code);
    }
  }
  const semifinalistTeams = (semifinalistEligibleCodes.size > 0
    ? tournament.teams.filter((t) => semifinalistEligibleCodes.has(t.code))
    : tournament.teams
  ).filter((t) => t.code !== "TBD");

  function renderBetCard(bt: typeof tournamentBets[number], headerBg: string) {
    const currentBet = betByTypeId[bt.id];
    const isLocked = bt.effectiveStatus === "LOCKED" || bt.effectiveStatus === "RESOLVED";
    const isWide = bt.subType === "group_predictions" || bt.subType === "semifinalists" || bt.subType === "bracket";

    let groupPredictionsPointsEarned: number | null = null;
    let groupPredictionsPointsPotential: number | null = null;
    let semifinalistsPointsEarned: number | null = null;
    let semifinalistsPointsPotential: number | null = null;
    let bracketPointsEarned: number | null = null;
    let bracketPointsPotential: number | null = null;

    // Derive actual semifinalists from SF match participants — available as soon as QF
    // results are entered and SF slots are seeded, without needing admin to resolve the bet.
    const sfMatchTeams = new Set<string>();
    for (const m of tournament.matches) {
      if (m.phase === "SF") {
        if (m.homeTeam?.code && m.homeTeam.code !== "TBD") sfMatchTeams.add(m.homeTeam.code);
        if (m.awayTeam?.code && m.awayTeam.code !== "TBD") sfMatchTeams.add(m.awayTeam.code);
      }
    }

    if (bt.subType === "semifinalists") {
      const resolution = bt.resolution as { teams?: string[] } | undefined;
      const predTeams = new Set((currentBet?.prediction as { teams?: string[] } | undefined)?.teams ?? []);

      const effectiveSemis =
        sfMatchTeams.size === 4 ? sfMatchTeams
        : resolution?.teams ? new Set(resolution.teams)
        : null;

      if (effectiveSemis) {
        let earned = 0;
        for (const code of predTeams) {
          if (effectiveSemis.has(code)) earned += semifinalistPointsMap[code] ?? 0;
        }
        if (earned > 0) semifinalistsPointsEarned = earned;
      } else {
        let potential = 0;
        for (const code of predTeams) potential += semifinalistPointsMap[code] ?? 0;
        if (potential > 0) semifinalistsPointsPotential = potential;
      }
    }
    if (bt.subType === "bracket") {
      const resolution = bt.resolution as { winners?: Record<string, string> } | undefined;
      const picks = (currentBet?.prediction as { picks?: Record<string, string> } | undefined)?.picks ?? {};

      // Derive winners from completed matches so earned points update live as games finish,
      // not only when the admin RESOLVES the whole bet type.
      const BRACKET_PHASES = ["R32", "R16", "QF", "SF", "FINAL"] as const;
      const effectiveWinners: Record<string, string> = {};
      for (const phase of BRACKET_PHASES) {
        const phaseMatches = tournament.matches
          .filter((m) => m.phase === phase)
          .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
        phaseMatches.forEach((m, i) => {
          if (
            m.status === "COMPLETED" &&
            m.actualHomeScore != null &&
            m.actualAwayScore != null
          ) {
            effectiveWinners[`${phase}-${i}`] =
              m.actualHomeScore >= m.actualAwayScore
                ? m.homeTeam.code
                : m.awayTeam.code;
          }
        });
      }
      for (const [k, v] of Object.entries(resolution?.winners ?? {})) {
        if (!effectiveWinners[k]) effectiveWinners[k] = v;
      }

      let earned = 0;
      let stillPossible = 0;
      for (const [slotKey, code] of Object.entries(picks)) {
        const phase = slotKey.split("-")[0];
        const value = bracketPickPoints[`${phase}|${code}`] ?? 0;
        const winner = effectiveWinners[slotKey];
        if (winner == null) {
          stillPossible += value;
        } else if (winner === code) {
          earned += value;
        }
        // wrong picks (winner set, winner !== code) contribute nothing
      }
      if (earned > 0) bracketPointsEarned = earned;
      if (stillPossible > 0) bracketPointsPotential = stillPossible;
    }
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
      } else {
        // Pre-resolution potential: sum of points if every current pick turned out correct.
        let total = 0;
        for (const arr of Object.values(picks)) {
          const winnerCode = arr?.[0];
          const advancerCodes = arr?.slice(1) ?? [];
          if (winnerCode) total += groupPredictionPoints?.[winnerCode] ?? 0;
          for (const code of advancerCodes) total += groupQualifierPoints?.[code] ?? 0;
        }
        if (total > 0) groupPredictionsPointsPotential = total;
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
              {groupPredictionsPointsEarned === null && groupPredictionsPointsPotential !== null && (
                <span className="text-sm font-medium text-neutral-500 tabular-nums">
                  {groupPredictionsPointsPotential.toFixed(1)} potential pts
                </span>
              )}
              {semifinalistsPointsEarned !== null && (
                <span className="text-base font-bold text-emerald-600 tabular-nums">
                  {semifinalistsPointsEarned.toFixed(1)} pts earned
                </span>
              )}
              {semifinalistsPointsEarned === null && semifinalistsPointsPotential !== null && (
                <span className="text-sm font-medium text-neutral-500 tabular-nums">
                  {semifinalistsPointsPotential.toFixed(1)} potential pts
                </span>
              )}
              {bracketPointsEarned !== null && (
                <span className="text-base font-bold text-emerald-600 tabular-nums">
                  {bracketPointsEarned.toFixed(1)} pts earned
                </span>
              )}
              {bracketPointsPotential !== null && (
                <span className="text-sm font-medium text-neutral-500 tabular-nums">
                  {bracketPointsPotential.toFixed(1)} possible
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
          {bt.effectiveStatus === "DRAFT" ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-neutral-400">
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
              resolution={
                sfMatchTeams.size === 4
                  ? { teams: [...sfMatchTeams] }
                  : bt.resolution as { teams?: string[] } | undefined
              }
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

  function Section({ title, bets, hideTitle }: { title: string; bets: typeof tournamentBets; hideTitle?: boolean }) {
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
          {bets.map((bt) => renderBetCard(bt, ""))}
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-12" style={{ marginLeft: "3rem" }}>
      <Section title="Tournament" bets={tournamentBets} />
      <Section title="Bonus Bets" bets={curatedBets} />
    </div>
  );
}
