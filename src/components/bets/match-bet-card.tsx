"use client";

import { useState, useEffect, useRef } from "react";
import { Lock, MapPin, Clock, ChevronUp, ChevronDown } from "lucide-react";
import { placeBet } from "@/lib/actions/bets";
import { getLiveMatchScore, type LiveScore } from "@/lib/actions/live-scores";
import { TeamBadge } from "@/components/team-badge";
import { cn } from "@/lib/utils";

interface MatchBetCardProps {
  groupId: string;
  tournamentId: string;
  tournamentKind: string;
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

function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const mins = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function phaseLabel(phase: string, groupLetter: string | null, tournamentKind?: string): string {
  if (phase === "GROUP" && groupLetter && tournamentKind !== "UCL_2026") return `Group ${groupLetter}`;
  if (tournamentKind === "UCL_2026") {
    if (phase === "GROUP") return "League Phase";
    if (phase === "R32") return "Playoffs";
  }
  const labels: Record<string, string> = {
    GROUP: "Group Stage", R32: "Round of 32", R16: "Round of 16",
    QF: "Quarter-final", SF: "Semi-final", FINAL: "Final", THIRD: "3rd Place",
  };
  return labels[phase] ?? phase;
}

export function MatchBetCard({
  groupId,
  tournamentId,
  tournamentKind,
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
  const isPastKickoff = new Date() > kickoff;
  const isLocked = !betsOpen || match.status === "LOCKED" || match.status === "COMPLETED" || isPastKickoff;
  const betsNotOpenYet = !betsOpen && match.status === "UPCOMING" && !isPastKickoff;

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
    return () => { cancelled = true; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, match.id, match.status]);

  const effectivelyFinished = match.status === "COMPLETED" || liveScore?.status === "FINISHED";
  const displayHome = effectivelyFinished ? (match.actualHomeScore ?? liveScore?.home) : liveScore?.home;
  const displayAway = effectivelyFinished ? (match.actualAwayScore ?? liveScore?.away) : liveScore?.away;
  const isInPlay =
    match.status !== "COMPLETED" &&
    liveScore != null &&
    (liveScore.status === "IN_PLAY" || liveScore.status === "PAUSED");

  const isCompleted = match.status === "COMPLETED" && match.actualHomeScore != null;

  const parsedHome = parseInt(homeScore);
  const parsedAway = parseInt(awayScore);
  const hasValidScore = !isNaN(parsedHome) && !isNaN(parsedAway);
  const predictedOutcome = hasValidScore ? outcomeFromScore(parsedHome, parsedAway) : null;

  const savedOutcome = currentMatchWinner?.outcome as "home" | "draw" | "away" | undefined;
  const hasSavedBet = currentCorrectScore?.homeScore != null;
  const savedPredictedOutcome: "home" | "draw" | "away" | undefined =
    hasSavedBet && currentCorrectScore!.homeScore != null && currentCorrectScore!.awayScore != null
      ? outcomeFromScore(currentCorrectScore!.homeScore!, currentCorrectScore!.awayScore!)
      : savedOutcome;

  const actualOutcome = isCompleted
    ? outcomeFromScore(match.actualHomeScore!, match.actualAwayScore!)
    : null;
  const outcomeCorrect = actualOutcome && savedPredictedOutcome ? savedPredictedOutcome === actualOutcome : null;
  const scoreCorrect =
    isCompleted &&
    currentCorrectScore?.homeScore === match.actualHomeScore &&
    currentCorrectScore?.awayScore === match.actualAwayScore;

  const homeWinPts = outcomePoints?.["home"];
  const drawPts = outcomePoints?.["draw"];
  const awayWinPts = outcomePoints?.["away"];

  const highlightOutcome = isCompleted
    ? actualOutcome
    : isLocked
    ? savedPredictedOutcome
    : predictedOutcome;

  const savedDirectionPts = savedPredictedOutcome ? outcomePoints?.[savedPredictedOutcome] : undefined;
  const savedScorePts = hasSavedBet
    ? scorePointsMap?.[`${Math.min(currentCorrectScore!.homeScore!, 6)}-${Math.min(currentCorrectScore!.awayScore!, 6)}`]
    : undefined;
  const earnedPts = isCompleted && hasSavedBet
    ? (outcomeCorrect ? (savedDirectionPts ?? 0) : 0) + (scoreCorrect ? (savedScorePts ?? 0) : 0)
    : null;

  const scorePts = hasValidScore ? scorePointsMap?.[`${Math.min(parsedHome, 6)}-${Math.min(parsedAway, 6)}`] : undefined;

  // Potential: predicted direction pts + predicted score bonus
  const predictedDirectionPts = predictedOutcome ? outcomePoints?.[predictedOutcome] : undefined;
  const potentialPts =
    hasValidScore && predictedDirectionPts != null
      ? predictedDirectionPts + (scorePts ?? 0)
      : null;

  useEffect(() => {
    if (isLocked) return;
    if (!dirtyRef.current) return;
    if (!hasValidScore) return;
    const current = `${parsedHome}-${parsedAway}`;
    if (current === lastSavedRef.current) return;

    const timer = setTimeout(async () => {
      setSaving(true); setSaved(false); setError(null);
      const outcome = outcomeFromScore(parsedHome, parsedAway);
      const ops: Promise<{ error?: string }>[] = [];
      if (correctScoreBetTypeId) {
        ops.push(placeBet(groupId, { tournamentId, betTypeId: correctScoreBetTypeId, matchId: match.id, prediction: { homeScore: parsedHome, awayScore: parsedAway } }));
      }
      if (matchWinnerBetTypeId) {
        ops.push(placeBet(groupId, { tournamentId, betTypeId: matchWinnerBetTypeId, matchId: match.id, prediction: { outcome } }));
      }
      const results = await Promise.all(ops);
      setSaving(false);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) { setError(firstError); } else { lastSavedRef.current = current; setSaved(true); }
    }, 500);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeScore, awayScore, isLocked]);

  // Big boxes: show the user's prediction whenever locked (including during play); final score when completed
  const shownHome = isCompleted
    ? (hasSavedBet ? currentCorrectScore!.homeScore : null)
    : isLocked && hasSavedBet
    ? currentCorrectScore!.homeScore
    : null;
  const shownAway = isCompleted
    ? (hasSavedBet ? currentCorrectScore!.awayScore : null)
    : isLocked && hasSavedBet
    ? currentCorrectScore!.awayScore
    : null;

  const noBetCompleted = isCompleted && !hasSavedBet;

  const directionCellCls = (outcome: "home" | "draw" | "away") =>
    cn(
      "text-sm tabular-nums",
      highlightOutcome === outcome ? "font-bold text-neutral-900" : "text-neutral-500"
    );

  const directionPts = (pts: number | undefined) =>
    pts != null ? `${pts.toFixed(1)} pts` : "TBD";

  return (
    <div
      className={cn(
        "rounded-3xl border border-neutral-200 bg-white shadow-sm",
        !isLocked && "transition-shadow hover:shadow-md"
      )}
    >
      {/* Header: phase + time, optional stats button */}
      <div className="flex items-center justify-between gap-3" style={{ padding: "14px 20px 12px" }}>
        <div className="inline-flex items-center gap-1.5 text-sm text-neutral-600 min-w-0">
          <MapPin className="w-4 h-4 text-neutral-400 shrink-0" />
          <span className="font-medium text-neutral-800 truncate">{phaseLabel(match.phase, match.groupLetter, tournamentKind)}</span>
          <span className="text-neutral-300 px-0.5">·</span>
          <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
          <span className="tabular-nums whitespace-nowrap">
            {formatDate(kickoff)} {formatTime(kickoff)}
          </span>
        </div>
        {isLocked && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-pitch-900 bg-pitch-50 border border-amber-200 rounded-full px-2.5 py-1 shrink-0">
            <Lock className="w-3.5 h-3.5" />
            {effectivelyFinished ? "Played" : "Locked"}
          </span>
        )}
      </div>

      {/* Teams + score */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3" style={{ padding: "10px 20px 4px" }}>
        {/* Home team */}
        <div className="flex flex-col items-center gap-2">
          <TeamBadge code={match.homeTeamCode} tournamentKind={tournamentKind} size="md" />
          <span className="text-sm font-semibold text-neutral-800 text-center leading-tight line-clamp-2">
            {match.homeTeamName || match.homeTeamCode}
          </span>
        </div>

        {/* Score area */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1">
            <ScoreCell
              value={homeScore}
              display={shownHome}
              isLocked={isLocked}
              onChange={(v) => { dirtyRef.current = true; setHomeScore(v); setSaved(false); }}
              highlight={isCompleted ? (scoreCorrect ? "emerald" : "grayed") : isLocked ? "grayed" : undefined}
            />
            <span className="text-base font-medium text-neutral-400 px-1.5 self-center" style={isLocked ? undefined : { marginTop: 4 }}>vs</span>
            <ScoreCell
              value={awayScore}
              display={shownAway}
              isLocked={isLocked}
              onChange={(v) => { dirtyRef.current = true; setAwayScore(v); setSaved(false); }}
              highlight={isCompleted ? (scoreCorrect ? "emerald" : "grayed") : isLocked ? "grayed" : undefined}
            />
          </div>
          {/* Secondary info below score */}
          <div style={{ minHeight: 20 }} className="flex items-center justify-center">
            {isCompleted ? (
              <span className={cn(
                "text-xs tabular-nums font-medium",
                scoreCorrect ? "text-emerald-600 font-semibold" : "text-neutral-500"
              )}>
                Final: {match.actualHomeScore}–{match.actualAwayScore}
                {scoreCorrect ? " ✓" : ""}
              </span>
            ) : hasValidScore && scorePts != null ? (
              <span className="text-sm font-semibold text-neutral-600 tabular-nums">+{scorePts.toFixed(1)} pts if exact</span>
            ) : null}
          </div>
        </div>

        {/* Away team */}
        <div className="flex flex-col items-center gap-2">
          <TeamBadge code={match.awayTeamCode} tournamentKind={tournamentKind} size="md" />
          <span className="text-sm font-semibold text-neutral-800 text-center leading-tight line-clamp-2">
            {match.awayTeamName || match.awayTeamCode}
          </span>
        </div>
      </div>

      {/* Live indicator */}
      {isInPlay && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-red-500">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span>{liveScore?.status === "PAUSED" ? "Half-time" : liveScore?.minute ? `LIVE ${liveScore.minute}'` : "LIVE"}</span>
          {displayHome != null && displayAway != null && (
            <span className="text-neutral-700 tabular-nums">
              {displayHome}–{displayAway}
            </span>
          )}
        </div>
      )}

      {/* Direction Pts row */}
      <div className="border-t border-neutral-100" style={{ padding: "14px 20px" }}>
        <div className="grid grid-cols-3 text-center gap-2">
          <span className={directionCellCls("home")}>1 – {betsNotOpenYet ? "TBD" : directionPts(homeWinPts)}</span>
          <span className={directionCellCls("draw")}>X – {betsNotOpenYet ? "TBD" : directionPts(drawPts)}</span>
          <span className={directionCellCls("away")}>2 – {betsNotOpenYet ? "TBD" : directionPts(awayWinPts)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="relative flex items-center justify-end border-t border-neutral-100 bg-neutral-50 rounded-b-3xl" style={{ padding: "14px 12px 14px 20px" }}>
        <span className="absolute inset-x-0 text-center text-sm font-bold text-neutral-900 tabular-nums pointer-events-none">
          {isCompleted ? (
            noBetCompleted ? (
              <span className="text-neutral-400">0 points earned</span>
            ) : (
              <span className={earnedPts != null && earnedPts > 0 ? "text-pitch-700" : "text-neutral-700"}>
                {earnedPts != null && earnedPts > 0 ? `${earnedPts.toFixed(1)} points earned` : "0 points earned"}
              </span>
            )
          ) : betsNotOpenYet ? (
            <span className="text-neutral-400">Potential points TBD</span>
          ) : isPastKickoff && !hasSavedBet ? (
            <span className="text-neutral-400">No bet placed</span>
          ) : potentialPts != null ? (
            `${potentialPts.toFixed(1)} potential points`
          ) : (
            <span className="text-neutral-400">0 potential points</span>
          )}
        </span>
        {!(betsNotOpenYet && !hasSavedBet) && (
          <StatusPill
            isLocked={isLocked}
            isCompleted={isCompleted}
            betsNotOpenYet={betsNotOpenYet}
            saving={saving}
            saved={saved}
            error={error}
            hasSavedBet={hasSavedBet}
          />
        )}
      </div>
    </div>
  );
}

function ScoreCell({
  value,
  display,
  isLocked,
  onChange,
  highlight,
}: {
  value: string;
  display: number | null | undefined;
  isLocked: boolean;
  onChange: (v: string) => void;
  highlight?: "emerald" | "amber" | "neutral" | "grayed";
}) {
  if (isLocked) {
    const cls = cn(
      "w-[52px] h-[52px] rounded-2xl border bg-white flex items-center justify-center text-2xl font-bold tabular-nums",
      highlight === "emerald" && "text-emerald-600 border-emerald-200 bg-emerald-50",
      highlight === "amber" && "text-pitch-700 border-amber-200 bg-pitch-50",
      highlight === "grayed" && "text-neutral-300 border-neutral-150 bg-neutral-50",
      (!highlight || highlight === "neutral") && "text-neutral-800 border-neutral-200"
    );
    return (
      <div className={cls}>{display != null ? display : "–"}</div>
    );
  }

  const parsed = parseInt(value);
  const numVal = isNaN(parsed) ? null : parsed;

  function increment() {
    const next = numVal == null ? 0 : Math.min(numVal + 1, 20);
    onChange(String(next));
  }

  function decrement() {
    if (numVal == null || numVal <= 0) return;
    onChange(String(numVal - 1));
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={increment}
        className="w-[52px] h-8 flex items-center justify-center rounded-xl bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 transition-colors touch-manipulation"
        aria-label="Increase score"
      >
        <ChevronUp className="w-4 h-4 text-neutral-600" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        pattern="[0-9]*"
        min={0}
        max={20}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="–"
        className="w-[52px] h-[52px] rounded-2xl border border-neutral-200 bg-white text-2xl font-bold text-center text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-300 tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder:text-neutral-300"
      />
      <button
        type="button"
        onClick={decrement}
        disabled={numVal == null || numVal <= 0}
        className="w-[52px] h-8 flex items-center justify-center rounded-xl bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 disabled:opacity-30 transition-colors touch-manipulation"
        aria-label="Decrease score"
      >
        <ChevronDown className="w-4 h-4 text-neutral-600" />
      </button>
    </div>
  );
}

function StatusPill({
  isLocked,
  isCompleted,
  betsNotOpenYet,
  saving,
  saved,
  error,
  hasSavedBet,
}: {
  isLocked: boolean;
  isCompleted: boolean;
  betsNotOpenYet: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  hasSavedBet: boolean;
}) {
  let label = "–";
  let cls = "text-neutral-400 border-neutral-200";
  if (isCompleted) {
    label = hasSavedBet ? "Done" : "No bet";
    cls = "text-neutral-500 border-neutral-200";
  } else if (isLocked) {
    label = hasSavedBet ? "Locked" : betsNotOpenYet ? "–" : "No bet";
    cls = "text-neutral-500 border-neutral-200";
  } else if (saving) {
    label = "Saving…";
    cls = "text-neutral-500 border-neutral-200";
  } else if (error) {
    label = "Error";
    cls = "text-red-600 border-red-200 bg-red-50";
  } else if (saved) {
    label = "Saved";
    cls = "text-emerald-700 border-emerald-200 bg-emerald-50";
  } else {
    label = "Pick";
    cls = "text-neutral-400 border-neutral-200";
  }
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-semibold whitespace-nowrap min-w-[72px]",
        cls
      )}
    >
      {label}
    </span>
  );
}
