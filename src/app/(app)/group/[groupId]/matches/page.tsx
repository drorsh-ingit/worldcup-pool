import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Trophy } from "lucide-react";
import { MatchBetCard } from "@/components/bets/match-bet-card";
import { loadBetsPageData, buildMatchCardProps, phaseLabel, PHASE_ORDER } from "@/lib/bets-page-data";
import { ScrollToMatch } from "@/components/scroll-to-match";

interface MatchesPageProps {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ phase?: string }>;
}

export default async function MatchesPage({ params, searchParams }: MatchesPageProps) {
  const { groupId } = await params;
  const { phase: phaseFilter } = await searchParams;

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

  const { tournament } = data;

  const availablePhases = ([...new Set(tournament.matches.map((m) => m.phase))] as string[])
    .sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b));
  const activePhase: string =
    phaseFilter && availablePhases.includes(phaseFilter)
      ? phaseFilter
      : availablePhases.find((p) =>
          tournament.matches.some((m) => m.phase === p && m.status !== "COMPLETED")
        ) ?? availablePhases[availablePhases.length - 1] ?? "GROUP";
  const filteredMatches = tournament.matches.filter((m) => m.phase === activePhase);

  const effectiveNow = data.effectiveNow;
  // 1. Live match (past kickoff but not yet completed) — stop here
  // 2. First future non-completed match
  // 3. Last completed match (scroll to latest results)
  const nextUpcomingMatch =
    filteredMatches.find((m) => m.status !== "COMPLETED" && new Date(m.kickoffAt) <= effectiveNow) ??
    filteredMatches.find((m) => m.status !== "COMPLETED" && new Date(m.kickoffAt) > effectiveNow) ??
    [...filteredMatches].reverse().find((m) => m.status === "COMPLETED");

  type MatchGroup = { label: string; matches: typeof filteredMatches };

  function buildGroups(): MatchGroup[] {
    if (activePhase === "FINAL") {
      return [{ label: "Final", matches: filteredMatches }];
    }

    if (activePhase === "GROUP") {
      const byMd: Record<number, typeof filteredMatches> = {};
      for (const m of filteredMatches) {
        if (!byMd[m.matchday]) byMd[m.matchday] = [];
        byMd[m.matchday].push(m);
      }
      return Object.keys(byMd).map(Number).sort((a, b) => a - b).map((md, i) => ({
        label: `Matchday ${i + 1}`,
        matches: byMd[md],
      }));
    }

    // Knockout: split into exactly First Leg / Second Leg by finding the largest date gap
    const uniqueDates = [...new Set(filteredMatches.map((m) =>
      new Date(m.kickoffAt).toISOString().split("T")[0]
    ))].sort();

    if (uniqueDates.length <= 1) return [{ label: "Matches", matches: filteredMatches }];

    let splitAt = uniqueDates[1];
    let maxGap = 0;
    for (let i = 1; i < uniqueDates.length; i++) {
      const gap = new Date(uniqueDates[i]).getTime() - new Date(uniqueDates[i - 1]).getTime();
      if (gap > maxGap) { maxGap = gap; splitAt = uniqueDates[i]; }
    }

    const leg1 = filteredMatches.filter((m) => new Date(m.kickoffAt).toISOString().split("T")[0] < splitAt);
    const leg2 = filteredMatches.filter((m) => new Date(m.kickoffAt).toISOString().split("T")[0] >= splitAt);
    const groups: MatchGroup[] = [];
    if (leg1.length > 0) groups.push({ label: "First Leg", matches: leg1 });
    if (leg2.length > 0) groups.push({ label: "Second Leg", matches: leg2 });
    return groups;
  }

  const groups = buildGroups();

  function renderMatchCard(match: typeof filteredMatches[number]) {
    if (!data) return null;
    const props = buildMatchCardProps(data, match);
    return (
      <div key={match.id} id={`match-${match.id}`}>
      <MatchBetCard
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
        betsOpen={props.betsOpen}
        currentMatchWinner={props.mwBet?.prediction as { outcome?: string } | undefined}
        currentCorrectScore={props.csBet?.prediction as { homeScore?: number; awayScore?: number } | undefined}
        outcomePoints={props.matchOutcomePoints}
        scorePointsMap={props.scorePointsMap}
      />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {nextUpcomingMatch && <ScrollToMatch matchId={nextUpcomingMatch.id} />}

        {/* Phase filter */}
        <div className="overflow-x-auto no-scrollbar" style={{ paddingTop: 4, paddingBottom: 4, marginTop: 16 }}>
          <div className="flex gap-2" style={{ minWidth: "max-content" }}>
            {availablePhases.map((p) => (
              <Link
                key={p}
                href={`/group/${groupId}/matches?phase=${p}`}
                className={`shrink-0 px-4 rounded-full text-sm font-medium transition-colors inline-flex items-center ${
                  activePhase === p
                    ? "bg-neutral-900 text-white"
                    : "bg-white border border-neutral-200 text-neutral-500 hover:text-neutral-800 hover:border-neutral-300"
                }`}
                style={{ height: 36, whiteSpace: "nowrap", paddingLeft: 20, paddingRight: 20 }}
              >
                {phaseLabel(p, data.tournament.kind)}
              </Link>
            ))}
          </div>
        </div>

        {/* Match list */}
        {filteredMatches.length === 0 ? (
          <div
            className="rounded-xl border border-neutral-200 bg-white text-center text-sm text-neutral-400"
            style={{ paddingTop: 64, paddingBottom: 64, paddingLeft: 24, paddingRight: 24 }}
          >
            No matches scheduled yet for this phase.
          </div>
        ) : (
          <div className="flex flex-col gap-12">
            {groups.map(({ label, matches }) => {
              const byDate: Record<string, typeof matches> = {};
              for (const m of matches) {
                const dateKey = new Date(m.kickoffAt).toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric",
                });
                if (!byDate[dateKey]) byDate[dateKey] = [];
                byDate[dateKey].push(m);
              }
              const dates = Object.keys(byDate).sort(
                (a, b) => new Date(byDate[a][0].kickoffAt).getTime() - new Date(byDate[b][0].kickoffAt).getTime()
              );
              return (
                <div key={label} className="flex flex-col gap-8">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                      {label}
                    </span>
                    <span className="text-neutral-200 text-xs">·</span>
                    <span className="text-xs text-neutral-400">
                      {matches.length} match{matches.length !== 1 ? "es" : ""}
                    </span>
                  </div>
                  <div className="flex flex-col gap-8">
                    {dates.map((dateKey) => (
                      <div key={dateKey} className="flex flex-col gap-4">
                        <span className="text-xs font-medium text-neutral-400">{dateKey}</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                          {byDate[dateKey].map(renderMatchCard)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

    </div>
  );
}
