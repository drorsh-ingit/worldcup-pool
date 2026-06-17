"use client";

import { useState, useEffect } from "react";
import { Clock, MapPin } from "lucide-react";
import { getLiveMatchScore, type LiveScore } from "@/lib/actions/live-scores";
import { TeamBadge } from "@/components/team-badge";

interface MatchStatusHeaderProps {
  groupId: string;
  matchId: string;
  tournamentKind: string;
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: Date;
  phase: string;
  groupLetter: string | null;
  status: "UPCOMING" | "LOCKED" | "COMPLETED";
  actualHomeScore: number | null;
  actualAwayScore: number | null;
}

function phaseLabel(phase: string, groupLetter: string | null): string {
  if (phase === "GROUP" && groupLetter) return `Group ${groupLetter}`;
  const labels: Record<string, string> = {
    GROUP: "Group Stage", R32: "Round of 32", R16: "Round of 16",
    QF: "Quarter-final", SF: "Semi-final", FINAL: "Final", THIRD: "3rd Place",
  };
  return labels[phase] ?? phase;
}

function formatKickoff(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  }) + " · " + date.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export function MatchStatusHeader(props: MatchStatusHeaderProps) {
  const {
    groupId, matchId, tournamentKind,
    homeTeamCode, awayTeamCode, homeTeamName, awayTeamName,
    kickoffAt, phase, groupLetter, status, actualHomeScore, actualAwayScore,
  } = props;

  const kickoff = new Date(kickoffAt);
  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);

  useEffect(() => {
    if (status === "COMPLETED") return;
    let cancelled = false;
    async function poll() {
      const res = await getLiveMatchScore(groupId, matchId);
      if (!cancelled && res.data) setLiveScore(res.data);
    }
    poll();
    const interval = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [groupId, matchId, status]);

  const isCompleted = status === "COMPLETED" && actualHomeScore != null;
  const isInPlay =
    !isCompleted &&
    liveScore != null &&
    (liveScore.status === "IN_PLAY" || liveScore.status === "PAUSED");
  const isFinishedLive = !isCompleted && liveScore?.status === "FINISHED";

  const home = isCompleted ? actualHomeScore : liveScore?.home;
  const away = isCompleted ? actualAwayScore : liveScore?.away;
  const showScore =
    (isCompleted || isInPlay || isFinishedLive) && home != null && away != null;

  const isActivePlay = isInPlay && liveScore?.status === "IN_PLAY";

  let statusLine: React.ReactNode;
  if (isCompleted || isFinishedLive) {
    statusLine = <span className="text-sm font-medium text-neutral-500">Full time</span>;
  } else if (isInPlay) {
    const isHalfTime = liveScore?.status === "PAUSED";
    statusLine = (
      <span className={`inline-flex items-center text-sm font-semibold text-red-500${isActivePlay ? " live-light-flicker" : ""}`} style={{ gap: 8 }}>
        <span className={`w-1.5 h-1.5 rounded-full bg-red-500${isActivePlay ? " animate-pulse" : ""}`} />
        {isHalfTime ? "Half-time" : liveScore?.minute ? `LIVE ${liveScore.minute}'` : "LIVE"}
      </span>
    );
  } else {
    statusLine = (
      <span className="inline-flex items-center text-sm text-neutral-500" style={{ gap: 6 }}>
        <Clock className="w-4 h-4 text-neutral-400" />
        {formatKickoff(kickoff)}
      </span>
    );
  }

  return (
    <div className="relative rounded-3xl border border-neutral-200 bg-white shadow-sm" style={{ padding: "20px 24px 24px" }}>
      {isInPlay && (
        <span
          className={`absolute text-lg${isActivePlay ? " live-light-flicker" : ""}`}
          style={{ top: 16, right: 20 }}
          title={isActivePlay ? "In play" : "Half-time"}
        >
          ⚽
        </span>
      )}
      <div className="flex items-center justify-center text-sm text-neutral-600" style={{ gap: 6, marginBottom: 20 }}>
        <MapPin className="w-4 h-4 text-neutral-400" />
        <span className="font-medium text-neutral-800">{phaseLabel(phase, groupLetter)}</span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center" style={{ gap: 16 }}>
        <div className="flex flex-col items-center min-w-0" style={{ gap: 10 }}>
          <TeamBadge code={homeTeamCode} tournamentKind={tournamentKind} size="lg" />
          <span className="font-semibold text-neutral-800 text-center leading-tight">{homeTeamName || homeTeamCode}</span>
        </div>

        <div className="flex flex-col items-center" style={{ gap: 8, minWidth: 96 }}>
          {showScore ? (
            <div className="flex items-center font-black tabular-nums text-neutral-900" style={{ gap: 12, fontSize: 40 }}>
              <span>{home}</span>
              <span className="text-neutral-300">–</span>
              <span>{away}</span>
            </div>
          ) : (
            <span className="text-2xl font-bold text-neutral-300">vs</span>
          )}
          {statusLine}
        </div>

        <div className="flex flex-col items-center min-w-0" style={{ gap: 10 }}>
          <TeamBadge code={awayTeamCode} tournamentKind={tournamentKind} size="lg" />
          <span className="font-semibold text-neutral-800 text-center leading-tight">{awayTeamName || awayTeamCode}</span>
        </div>
      </div>
    </div>
  );
}
