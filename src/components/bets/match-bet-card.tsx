"use client";

import { useState, useEffect, useRef } from "react";
import { Lock, CheckCircle } from "lucide-react";
import { placeBet } from "@/lib/actions/bets";
import { getLiveMatchScore, type LiveScore } from "@/lib/actions/live-scores";

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

  // Per-outcome pts (always available for display regardless of prediction)
  const homeWinPts = outcomePoints?.["home"];
  const drawPts = outcomePoints?.["draw"];
  const awayWinPts = outcomePoints?.["away"];
  const scorePts = hasValidScore ? scorePointsMap?.[`${parsedHome}-${parsedAway}`] : undefined;

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

  const ptsColor = (outcome: "home" | "draw" | "away") => {
    if (!hasValidScore) return "text-amber-500";
    return predictedOutcome === outcome ? "text-amber-500 font-semibold" : "text-neutral-300";
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">

      {/* Teams + score/inputs row */}
      <div className="flex items-center gap-2">

        {/* Home team */}
        <div className="flex-1 flex flex-col items-end gap-0.5">
          <span className="text-base font-semibold text-neutral-900">{match.homeTeamCode}</span>
          {!isLocked && homeWinPts != null && (
            <span className={`text-xs tabular-nums transition-colors ${ptsColor("home")}`}>
              {homeWinPts.toFixed(1)} pts
            </span>
          )}
        </div>

        {/* Score center */}
        <div className="flex flex-col items-center gap-1 min-w-[130px]">
          {/* Live/finished score */}
          {(effectivelyFinished || isInPlay) && displayHome != null ? (
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tabular-nums text-neutral-900">{displayHome}</span>
              <span className="text-neutral-300 font-medium">–</span>
              <span className="text-xl font-bold tabular-nums text-neutral-900">{displayAway}</span>
              {isInPlay && (
                <span className="flex items-center gap-1 text-xs font-semibold text-red-500">
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
            <span className="text-sm text-neutral-300 font-medium">vs</span>
          ) : (
            /* Score inputs + inline save status */
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={20}
                value={homeScore}
                onChange={(e) => { dirtyRef.current = true; setHomeScore(e.target.value); setSaved(false); }}
                placeholder="–"
                className="w-12 h-9 px-2 rounded-lg border border-neutral-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
              <span className="text-neutral-400 font-medium">–</span>
              <input
                type="number"
                min={0}
                max={20}
                value={awayScore}
                onChange={(e) => { dirtyRef.current = true; setAwayScore(e.target.value); setSaved(false); }}
                placeholder="–"
                className="w-12 h-9 px-2 rounded-lg border border-neutral-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
              {error && <span className="text-xs text-red-500">{error}</span>}
            </div>
          )}

          {/* Exact score pts (below inputs, only when unlocked + valid) */}
          {!isLocked && scorePts != null && (
            <span className="text-xs text-neutral-500">
              +<span className="text-amber-500 font-semibold tabular-nums">{scorePts.toFixed(1)}</span> pts if exact
            </span>
          )}

          {/* Draw pts (centered, only when unlocked) */}
          {!isLocked && drawPts != null && (
            <span className={`text-xs tabular-nums transition-colors ${ptsColor("draw")}`}>
              Draw: {drawPts.toFixed(1)} pts
            </span>
          )}

          {/* Locked: show user prediction */}
          {isLocked && currentCorrectScore?.homeScore != null && (
            <div className="flex flex-col items-center gap-0.5 mt-1">
              <span className={`text-sm font-semibold tabular-nums ${
                scoreCorrect || projectedScoreMatch
                  ? "text-emerald-600"
                  : outcomeCorrect
                  ? "text-amber-700"
                  : "text-neutral-600"
              }`}>
                {currentCorrectScore.homeScore} – {currentCorrectScore.awayScore}
              </span>
              {scoreCorrect && <span className="text-xs text-emerald-600 font-medium">Exact!</span>}
              {!scoreCorrect && outcomeCorrect && <span className="text-xs text-amber-600">Winner ✓</span>}
              {outcomeCorrect === false && <span className="text-xs text-red-500">Incorrect</span>}
              {isCompleted && !scoreCorrect && (
                <span className="text-xs text-neutral-400">
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
                <span className="text-xs text-neutral-400">
                  live: {displayHome}–{displayAway}
                </span>
              )}
            </div>
          )}

          {isLocked && currentCorrectScore?.homeScore == null && (
            <span className="text-xs text-neutral-400 mt-1">No prediction</span>
          )}
        </div>

        {/* Away team */}
        <div className="flex-1 flex flex-col items-start gap-0.5">
          <span className="text-base font-semibold text-neutral-900">{match.awayTeamCode}</span>
          {!isLocked && awayWinPts != null && (
            <span className={`text-xs tabular-nums transition-colors ${ptsColor("away")}`}>
              {awayWinPts.toFixed(1)} pts
            </span>
          )}
        </div>
      </div>

      {/* Footer: date + lock badge */}
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-neutral-400">
          {kickoff.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          {" · "}
          {kickoff.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          {match.groupLetter && ` · Group ${match.groupLetter}`}
        </p>
        {isLocked && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600">
            <Lock className="w-3.5 h-3.5" />
            {effectivelyFinished ? "Played" : "Locked"}
          </div>
        )}
      </div>
    </div>
  );
}
