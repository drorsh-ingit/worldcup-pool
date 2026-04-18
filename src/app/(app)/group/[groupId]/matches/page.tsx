import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { MatchBetCard } from "@/components/bets/match-bet-card";
import { loadBetsPageData, buildMatchCardProps, PHASE_LABELS, PHASE_ORDER } from "@/lib/bets-page-data";

interface MatchesPageProps {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ phase?: string; group?: string }>;
}

export default async function MatchesPage({ params, searchParams }: MatchesPageProps) {
  const { groupId } = await params;
  const { phase: phaseFilter, group: groupFilter } = await searchParams;

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

  const { tournament } = data;

  const availablePhases = ([...new Set(tournament.matches.map((m) => m.phase))] as string[])
    .sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b));
  const activePhase: string =
    phaseFilter && availablePhases.includes(phaseFilter)
      ? phaseFilter
      : availablePhases[0] ?? "GROUP";
  const groupLetters = [...new Set(
    tournament.matches.filter((m) => m.phase === "GROUP").map((m) => m.groupLetter ?? "")
  )].filter(Boolean).sort();

  let filteredMatches = tournament.matches.filter((m) => m.phase === activePhase);
  if (activePhase === "GROUP" && groupFilter) {
    filteredMatches = filteredMatches.filter((m) => m.groupLetter === groupFilter);
  }

  const byMatchday: Record<number, typeof filteredMatches> = {};
  if (activePhase === "GROUP") {
    for (const m of filteredMatches) {
      if (!byMatchday[m.matchday]) byMatchday[m.matchday] = [];
      byMatchday[m.matchday].push(m);
    }
  }

  function renderMatchCard(match: typeof filteredMatches[number]) {
    if (!data) return null;
    const props = buildMatchCardProps(data, match);
    return (
      <MatchBetCard
        key={match.id}
        groupId={groupId}
        tournamentId={tournament.id}
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
        betsOpen={props.betsOpen}
        currentMatchWinner={props.mwBet?.prediction as { outcome?: string } | undefined}
        currentCorrectScore={props.csBet?.prediction as { homeScore?: number; awayScore?: number } | undefined}
        outcomePoints={props.matchOutcomePoints}
        scorePointsMap={props.scorePointsMap}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Phase tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {availablePhases.map((p) => (
          <Link
            key={p}
            href={`/group/${groupId}/matches?phase=${p}`}
            className={`shrink-0 h-8 px-3 rounded-lg text-sm font-medium transition-colors ${
              activePhase === p ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {PHASE_LABELS[p] ?? p}
          </Link>
        ))}
      </div>

      {/* Group filter */}
      {activePhase === "GROUP" && groupLetters.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          <Link
            href={`/group/${groupId}/matches?phase=GROUP`}
            className={`h-7 px-2.5 rounded-lg text-xs font-medium transition-colors ${
              !groupFilter ? "bg-amber-100 text-amber-700" : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            All groups
          </Link>
          {groupLetters.map((g) => (
            <Link
              key={g}
              href={`/group/${groupId}/matches?phase=GROUP&group=${g}`}
              className={`h-7 px-2.5 rounded-lg text-xs font-medium transition-colors ${
                groupFilter === g ? "bg-amber-100 text-amber-700" : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              Group {g}
            </Link>
          ))}
        </div>
      )}

      {filteredMatches.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white py-12 text-center text-sm text-neutral-400">
          No matches scheduled yet for this phase.
        </div>
      ) : activePhase === "GROUP" ? (
        <div className="space-y-6">
          {Object.entries(byMatchday)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([matchday, matches]) => (
              <div key={matchday} className="space-y-2">
                <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Matchday {matchday}
                </h3>
                <div className="space-y-3">{matches.map(renderMatchCard)}</div>
              </div>
            ))}
        </div>
      ) : (
        <div className="space-y-3">{filteredMatches.map(renderMatchCard)}</div>
      )}
    </div>
  );
}
