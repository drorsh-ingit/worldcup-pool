import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { auth } from "@/lib/auth";
import { getMatchPredictions } from "@/lib/match-predictions";
import { MatchStatusHeader } from "@/components/match-status-header";
import { MatchPredictionsTable } from "@/components/match-predictions-table";
import { LiveScoresProvider } from "@/components/stats/live-scores-context";

interface MatchPageProps {
  params: Promise<{ groupId: string; matchId: string }>;
}

export default async function MatchPage({ params }: MatchPageProps) {
  const { groupId, matchId } = await params;

  const session = await auth();
  if (!session) redirect("/login");

  const { data, error } = await getMatchPredictions(groupId, matchId);
  if (error || !data) notFound();

  const { match, locked } = data;

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      <Link
        href={`/group/${groupId}/matches`}
        className="inline-flex items-center text-sm text-neutral-500 hover:text-neutral-800 transition-colors"
        style={{ gap: 6 }}
      >
        <ArrowLeft className="w-4 h-4" />
        Back to matches
      </Link>

      <MatchStatusHeader
        groupId={groupId}
        matchId={match.id}
        tournamentKind={match.tournamentKind}
        homeTeamCode={match.homeTeamCode}
        awayTeamCode={match.awayTeamCode}
        homeTeamName={match.homeTeamName}
        awayTeamName={match.awayTeamName}
        kickoffAt={match.kickoffAt}
        phase={match.phase}
        groupLetter={match.groupLetter}
        status={match.status}
        actualHomeScore={match.actualHomeScore}
        actualAwayScore={match.actualAwayScore}
      />

      {locked ? (
        <LiveScoresProvider groupId={groupId} matchIds={[match.id]}>
          <MatchPredictionsTable
            data={data}
            homeCode={match.homeTeamCode}
            awayCode={match.awayTeamCode}
          />
        </LiveScoresProvider>
      ) : (
        <div className="rounded-3xl border border-neutral-200 bg-white text-center" style={{ padding: "48px 24px" }}>
          <div className="inline-flex items-center justify-center rounded-2xl bg-neutral-100" style={{ width: 48, height: 48, marginBottom: 14 }}>
            <Lock className="w-5 h-5 text-neutral-400" />
          </div>
          <p className="text-sm font-medium text-neutral-700" style={{ marginBottom: 4 }}>
            Predictions are hidden until kickoff
          </p>
          <p className="text-sm text-neutral-400">
            Everyone&apos;s picks will appear here once the match starts.
          </p>
        </div>
      )}
    </div>
  );
}
