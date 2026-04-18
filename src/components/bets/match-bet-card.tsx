"use client";

import { useState, useEffect, useRef } from "react";
import { Lock, CheckCircle } from "lucide-react";
import { placeBet } from "@/lib/actions/bets";
import { getLiveMatchScore, type LiveScore } from "@/lib/actions/live-scores";
import { Flag } from "@/components/flag";
import { cn } from "@/lib/utils";

interface MatchBetCardProps {
  groupId: string;
  tournamentId: string;
  match: {
    id: string;
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
  };
  matchWinnerBetTypeId: string | null;
  correctScoreBetTypeId: string | null;
  betsOpen: boolean;
  currentMatchWinner?: { outcome?: string };
  currentCorrectScore?: { homeScore?: number; awayScore?: number };
  outcomePoints?: Record<string, number>;
  scorePointsMap?: Record<string, number>;
}

function outcomeFromScore(h: number, a: number): "home" | "draw" | "away" {
  return h > a ? "home" : a > h ? "away" : "draw";
}

function formatKickoff(date: Date): string {
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, "0");
  const mins = date.getMinutes().toString().padStart(2, "0");
  return `${month} ${day} · ${hours}:${mins}`;
}

/** Pill label for match phase/round */
function phaseLabel(phase: string, groupLetter: string | null): string {
  if (phase === "GROUP" && groupLetter) return `Group ${groupLetter}`;
  const labels: Record<string, string> = {
    GROUP: "Group Stage",
    R32: "Round of 32",
    R16: "Round of 16",
    QF: "Quarter-final",
    SF: "Semi-final",
    FINAL: "Final",
    THIRD: "3rd Place",
  };
  return labels[phase] ?? phase;
}

export function MatchBetCard({
  groupId,
  tournamentId,
  match,
  matchWinnerBetTypeId,
  correctScoreBetTypeId,
  betsOpen,
  currentMatchWinner,
  currentCorrectScore,
  outcomePoints,
  scorePointsMap,
}: MatchBetCardProps) {
  const [homeScore, setHomeScore] = useState<string>(
    currentCorrectScore?.homeScore?.toString() ?? ""
  );
  const [awayScore, setAwayScore] = useState<string>(
    currentCorrectScore?.awayScore?.toString() ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(currentCorrectScore?.homeScore != null);
  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);
  const dirtyRef = useRef(false);
  const lastSavedRef = useRef<string>(
    currentCorrectScore?.homeScore != null
      ? `${currentCorrectScore.homeScore}-${currentCorrectScore.awayScore}`
      : ""
  );

  const kickoff = new Date(match.kickoffAt);
  const isLocked = !betsOpen || match.status === "LOCKED" || match.status === "COMPLETED";

  useEffect(() => {
    const now = new Date();
    if (kickoff > now || match.status === "COMPLETED") return;

    let cancelled = false;
    async function poll() {
      const res = await getLiveMatchScore(groupId, match.id);
      if (!cancelled && res.data) setLiveScore(res.data);
    }
    poll();
    const interval = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, match.id, match.status]);

  const effectivelyFinished =
    match.status === "COMPLETED" || liveScore?.status === "FINISHED";
  const displayHome = effectivelyFinished
    ? (match.actualHomeScore ?? liveScore?.home)
    : liveScore?.home;
  const displayAway = effectivelyFinished
    ? (match.actualAwayScore ?? liveScore?.away)
    : liveScore?.away;
  const isInPlay =
    match.status !== "COMPLETED" &&
    liveScore != null &&
    (liveScore.status === "IN_PLAY" || liveScore.status === "PAUSED");

  const parsedHome = parseInt(homeScore);
  const parsedAway = parseInt(awayScore);
  const hasValidScore = !isNaN(parsedHome) && !isNaN(parsedAway);
  const predictedOutcome = hasValidScore ? outcomeFromScore(parsedHome, parsedAway) : null;

  const homeWinPts = outcomePoints?.["home"];
  const drawPts = outcomePoints?.["draw"];
  const awayWinPts = outcomePoints?.["away"];
  const scorePts = hasValidScore ? scorePointsMap?.[`${parsedHome}-${parsedAway}`] : undefined;

  // Total potential pts for footer
  const directionPts = predictedOutcome ? outcomePoints?.[predictedOutcome] : undefined;
  const potentialPts =
    directionPts != null && scorePts != null
      ? directionPts + scorePts
      : directionPts ?? scorePts;

  useEffect(() => {
    if (isLocked) return;
    if (!dirtyRef.current) return;
    if (!hasValidScore) return;
    const current = `${parsedHome}-${parsedAway}`;
    if (current === lastSavedRef.current) return;

    const timer = setTimeout(async () => {
      setSaving(true);
      setSaved(false);
      setError(null);

      const outcome = outcomeFromScore(parsedHome, parsedAway);
      const ops: Promise<{ error?: string }>[] = [];
      if (correctScoreBetTypeId) {
        ops.push(placeBet(groupId, {
          tournamentId,
          betTypeId: correctScoreBetTypeId,
          matchId: match.id,
          prediction: { homeScore: parsedHome, awayScore: parsedAway },
        }));
      }
      if (matchWinnerBetTypeId) {
        ops.push(placeBet(groupId, {
          tournamentId,
          betTypeId: matchWinnerBetTypeId,
          matchId: match.id,
          prediction: { outcome },
        }));
      }
      const results = await Promise.all(ops);
      setSaving(false);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) {
        setError(firstError);
      } else {
        lastSavedRef.current = current;
        setSaved(true);
      }
    }, 500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeScore, awayScore, isLocked]);

  const isCompleted = match.status === "COMPLETED" && match.actualHomeScore != null;
  const actualOutcome = isCompleted
    ? outcomeFromScore(match.actualHomeScore!, match.actualAwayScore!)
    : null;
  const savedOutcome = currentMatchWinner?.outcome;
  const outcomeCorrect = actualOutcome && savedOutcome ? savedOutcome === actualOutcome : null;
  const scoreCorrect =
    isCompleted &&
    currentCorrectScore?.homeScore === match.actualHomeScore &&
    currentCorrectScore?.awayScore === match.actualAwayScore;

  const liveOutcome =
    displayHome != null && displayAway != null
      ? outcomeFromScore(displayHome, displayAway)
      : null;
  const projectedOutcomeMatch = isInPlay && liveOutcome && savedOutcome === liveOutcome;
  const projectedScoreMatch =
    isInPlay &&
    displayHome != null &&
    displayAway != null &&
    currentCorrectScore?.homeScore === displayHome &&
    currentCorrectScore?.awayScore === displayAway;

  const ptsHighlight = (outcome: "home" | "draw" | "away") => {
    if (!hasValidScore) return "text-amber-500";
    return predictedOutcome === outcome
      ? "text-amber-500 font-semibold"
      : "text-neutral-300";
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-neutral-200 bg-white overflow-hidden",
        !isLocked && "card-hover"
      )}
    >
      {/* Row 1: header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-b border-neutral-100">
        <span className="text-[11px] font-medium text-neutral-500 tracking-wide">
          {phaseLabel(match.phase, match.groupLetter)}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-400 tabular-nums">
            {formatKickoff(kickoff)}
          </span>
          {isLocked && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-1.5 py-0.5">
              <Lock className="w-2.5 h-2.5" />
              {effectivelyFinished ? "Played" : "Locked"}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: teams + score */}
      <div className="flex items-center gap-3 px-4 py-4">

        {/* Home team */}
        <div className="flex-1 flex flex-col items-center gap-1.5">
          <div className="rounded-full bg-white shadow-sm p-0.5 border border-neutral-100">
            <Flag code={match.homeTeamCode} size="md" />
          </div>
          <span className="text-xs font-medium text-neutral-700 text-center leading-tight max-w-[72px] truncate">
            {match.homeTeamName || match.homeTeamCode}
          </span>
          {!isLocked && homeWinPts != null && (
            <span className={cn("text-xs tabular-nums transition-colors", ptsHighlight("home"))}>
              {homeWinPts.toFixed(1)} pts
            </span>
          )}
          {isLocked && (
            <span className="text-xs text-neutral-300 tabular-nums">
              {homeWinPts != null ? `${homeWinPts.toFixed(1)} pts` : ""}
            </span>
          )}
        </div>

        {/* Score center */}
        <div className="flex flex-col items-center gap-1 min-w-[120px]">
          {/* Live / finished score display */}
          {(effectivelyFinished || isInPlay) && displayHome != null ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-display font-bold tabular-nums text-neutral-900">
                {displayHome}
              </span>
              <span className="text-lg text-neutral-300 font-display">–</span>
              <span className="text-2xl font-display font-bold tabular-nums text-neutral-900">
                {displayAway}
              </span>
              {isInPlay && (
                <span className="flex items-center gap-1 text-xs font-semibold text-red-500 ml-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {liveScore?.status === "PAUSED"
                    ? "HT"
                    : liveScore?.minute
                    ? `${liveScore.minute}'`
                    : "LIVE"}
                </span>
              )}
            </div>
          ) : isLocked ? (
            <span className="text-2xl font-display font-medium text-neutral-300">vs</span>
          ) : (
            /* Score inputs */
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={20}
                value={homeScore}
                onChange={(e) => { dirtyRef.current = true; setHomeScore(e.target.value); setSaved(false); }}
                placeholder="–"
                className="w-12 h-10 px-1 rounded-xl border border-neutral-200 text-xl font-display font-semibold text-center text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder:text-neutral-300"
              />
              <span className="text-xl font-display text-neutral-300">–</span>
              <input
                type="number"
                min={0}
                max={20}
                value={awayScore}
                onChange={(e) => { dirtyRef.current = true; setAwayScore(e.target.value); setSaved(false); }}
                placeholder="–"
                className="w-12 h-10 px-1 rounded-xl border border-neutral-200 text-xl font-display font-semibold text-center text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder:text-neutral-300"
              />
            </div>
          )}

          {/* Draw pts row (open bets) */}
          {!isLocked && drawPts != null && (
            <span className={cn("text-xs tabular-nums transition-colors mt-0.5", ptsHighlight("draw"))}>
              Draw: {drawPts.toFixed(1)} pts
            </span>
          )}

          {/* Exact score pts row */}
          {!isLocked && scorePts != null && (
            <span className="text-xs text-neutral-400 tabular-nums">
              +<span className="text-amber-500 font-semibold">{scorePts.toFixed(1)}</span> pts if exact
            </span>
          )}

          {/* Locked: user prediction */}
          {isLocked && currentCorrectScore?.homeScore != null && (
            <div className="flex flex-col items-center gap-0.5 mt-1">
              <span className={cn(
                "text-sm font-semibold tabular-nums font-display",
                scoreCorrect || projectedScoreMatch
                  ? "text-emerald-600"
                  : outcomeCorrect
                  ? "text-amber-700"
                  : "text-neutral-600"
              )}>
                {currentCorrectScore.homeScore} – {currentCorrectScore.awayScore}
              </span>
              {scoreCorrect && (
                <span className="text-xs text-emerald-600 font-medium">Exact!</span>
              )}
              {!scoreCorrect && outcomeCorrect && (
                <span className="text-xs text-amber-600">Winner correct</span>
              )}
              {outcomeCorrect === false && (
                <span className="text-xs text-red-500">Incorrect</span>
              )}
              {isCompleted && !scoreCorrect && (
                <span className="text-xs text-neutral-400 tabular-nums">
                  actual: {match.actualHomeScore}–{match.actualAwayScore}
                </span>
              )}
              {isInPlay && projectedScoreMatch && (
                <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                  <CheckCircle className="w-3 h-3" /> matches live!
                </span>
              )}
              {isInPlay && !projectedScoreMatch && projectedOutcomeMatch && (
                <span className="text-xs text-amber-600">winner leading</span>
              )}
              {isInPlay && !projectedScoreMatch && !projectedOutcomeMatch && displayHome != null && (
                <span className="text-xs text-neutral-400 tabular-nums">
                  live: {displayHome}–{displayAway}
                </span>
              )}
            </div>
          )}

          {error && (
            <span className="text-xs text-red-500 text-center mt-0.5">{error}</span>
          )}
          {saving && (
            <span className="text-xs text-neutral-400 mt-0.5">Saving…</span>
          )}
          {saved && !saving && !isLocked && (
            <span className="text-xs text-emerald-500 mt-0.5">Saved</span>
          )}
        </div>

        {/* Away team */}
        <div className="flex-1 flex flex-col items-center gap-1.5">
          <div className="rounded-full bg-white shadow-sm p-0.5 border border-neutral-100">
            <Flag code={match.awayTeamCode} size="md" />
          </div>
          <span className="text-xs font-medium text-neutral-700 text-center leading-tight max-w-[72px] truncate">
            {match.awayTeamName || match.awayTeamCode}
          </span>
          {!isLocked && awayWinPts != null && (
            <span className={cn("text-xs tabular-nums transition-colors", ptsHighlight("away"))}>
              {awayWinPts.toFixed(1)} pts
            </span>
          )}
          {isLocked && (
            <span className="text-xs text-neutral-300 tabular-nums">
              {awayWinPts != null ? `${awayWinPts.toFixed(1)} pts` : ""}
            </span>
          )}
        </div>
      </div>

      {/* Row 3: footer with direction / score / potential */}
      <div className="border-t border-neutral-100 px-4 py-2.5 bg-neutral-50">
        {isLocked && currentCorrectScore?.homeScore == null ? (
          <p className="text-center text-xs text-neutral-400">Locked – no bet placed</p>
        ) : (
          <div className="grid grid-cols-3 divide-x divide-neutral-200">
            <div className="flex flex-col items-center gap-0.5 px-2">
              <span className="text-[10px] uppercase tracking-wider text-neutral-400">Direction</span>
              <span className="text-sm font-semibold text-neutral-900 tabular-nums">
                {directionPts != null ? `${directionPts.toFixed(1)}` : "–"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5 px-2">
              <span className="text-[10px] uppercase tracking-wider text-neutral-400">Score</span>
              <span className="text-sm font-semibold text-neutral-900 tabular-nums">
                {scorePts != null ? `+${scorePts.toFixed(1)}` : "–"}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5 px-2">
              <span className="text-[10px] uppercase tracking-wider text-neutral-400">Potential</span>
              <span className="text-sm font-semibold text-amber-500 tabular-nums">
                {potentialPts != null ? `${potentialPts.toFixed(1)} pts` : "–"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
