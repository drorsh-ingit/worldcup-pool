"use client";

import { useMemo } from "react";
import { Check, X, Minus, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchPredictionsData, MatchPredictionRow } from "@/lib/match-predictions";
import { useLiveScore } from "@/components/stats/live-scores-context";
import { calculatePoints } from "@/lib/scoring";
import { deriveMatchOdds, deriveScoreOdds } from "@/lib/match-odds";

function outcomeBadge(outcome: MatchPredictionRow["outcome"], homeCode: string, awayCode: string): string {
  if (outcome === "home") return homeCode;
  if (outcome === "away") return awayCode;
  return "Draw";
}

function impliedProb(odds: number): number {
  return 1 / Math.max(odds, 1);
}

export function MatchPredictionsTable({
  data,
  homeCode,
  awayCode,
}: {
  data: MatchPredictionsData;
  homeCode: string;
  awayCode: string;
}) {
  const { rows, missing, match, scoringMeta } = data;
  const isCompleted = match.status === "COMPLETED" && match.actualHomeScore != null;
  const isInPlay = data.locked && !isCompleted;
  const total = rows.length + missing.length;

  const liveScore = useLiveScore(match.id);
  const isLiveActive =
    isInPlay &&
    liveScore != null &&
    liveScore.home != null &&
    liveScore.away != null &&
    (liveScore.status === "IN_PLAY" || liveScore.status === "PAUSED");

  // One-pass client-side point computation — all rows update simultaneously.
  const provisionalPtsByUser = useMemo<Record<string, number>>(() => {
    if (!isLiveActive || liveScore?.home == null || liveScore?.away == null) return {};
    const { home, away } = liveScore as { home: number; away: number };
    const liveOutcome = home > away ? "home" : away > home ? "away" : "draw";
    const { homeOdds, awayOdds, oddsData, groupSettings } = scoringMeta;
    const totalPool = groupSettings.totalPool ?? 1000;
    const phase = match.phase as Parameters<typeof calculatePoints>[4];
    const result: Record<string, number> = {};

    for (const row of rows) {
      let pts = 0;

      // match_winner contribution
      if (row.outcome === liveOutcome) {
        const oddsMap = oddsData as Record<string, number>;
        const oddsKey = liveOutcome === "home" ? "homeWin" : liveOutcome === "away" ? "awayWin" : "draw";
        const derived = deriveMatchOdds(homeOdds, awayOdds);
        const fallback =
          oddsKey === "homeWin" ? derived.homeWin : oddsKey === "awayWin" ? derived.awayWin : derived.draw;
        pts += calculatePoints(true, "match_winner", impliedProb(oddsMap[oddsKey] ?? fallback), groupSettings, phase, totalPool).totalPoints;
      }

      // correct_score contribution
      if (row.homeScore === home && row.awayScore === away) {
        const scoreOddsMap = (oddsData as Record<string, Record<string, number>>).correctScores;
        const clampedH = Math.min(home, 6);
        const clampedA = Math.min(away, 6);
        const scoreKey = `${clampedH}-${clampedA}`;
        const storedOdds = scoreOddsMap?.[scoreKey];
        const rawOdds = storedOdds ?? (() => {
          const derived = deriveScoreOdds(homeOdds, awayOdds);
          return derived[scoreKey] ?? 1500;
        })();
        pts += calculatePoints(true, "correct_score", impliedProb(rawOdds), groupSettings, phase, totalPool).totalPoints;
      }

      result[row.userId] = pts;
    }
    return result;
  }, [isLiveActive, liveScore, rows, scoringMeta, match.phase]);

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-100" style={{ padding: "16px 20px" }}>
        <h2 className="text-base font-semibold text-neutral-900">Predictions</h2>
        <div className="flex items-center" style={{ gap: 12 }}>
          {isInPlay && (
            <span className="inline-flex items-center text-xs font-semibold text-red-500 animate-pulse" style={{ gap: 5 }}>
              <Zap className="w-3.5 h-3.5" />
              Live
            </span>
          )}
          <span className="text-sm text-neutral-400 tabular-nums">
            {rows.length} of {total} picked
          </span>
        </div>
      </div>

      <ul className="divide-y divide-neutral-100">
        {rows.map((row) => (
          <PredictionRow
            key={row.userId}
            row={row}
            homeCode={homeCode}
            awayCode={awayCode}
            isCompleted={isCompleted}
            isInPlay={isInPlay}
            provisionalPts={provisionalPtsByUser[row.userId] ?? 0}
          />
        ))}

        {missing.map((m) => (
          <li
            key={m.userId}
            className={cn("flex items-center justify-between", m.isSelf && "bg-amber-50/40")}
            style={{ padding: "12px 20px", gap: 12 }}
          >
            <div className="flex items-center min-w-0" style={{ gap: 8 }}>
              <span className="font-medium text-neutral-400 truncate">{m.name}</span>
              {m.isSelf && (
                <span className="shrink-0 text-xs font-medium text-amber-700 bg-amber-100 rounded-full" style={{ padding: "1px 8px" }}>
                  You
                </span>
              )}
            </div>
            <span className="inline-flex items-center text-sm text-neutral-300" style={{ gap: 4 }}>
              <Minus className="w-4 h-4" />
              No prediction
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PredictionRow({
  row,
  homeCode,
  awayCode,
  isCompleted,
  isInPlay,
  provisionalPts,
}: {
  row: MatchPredictionRow;
  homeCode: string;
  awayCode: string;
  isCompleted: boolean;
  isInPlay: boolean;
  provisionalPts: number;
}) {
  return (
    <li
      className={cn("flex items-center justify-between", row.isSelf && "bg-amber-50/60")}
      style={{ padding: "12px 20px", gap: 12 }}
    >
      <div className="flex items-center min-w-0" style={{ gap: 8 }}>
        <span className="font-medium text-neutral-800 truncate">{row.name}</span>
        {row.isSelf && (
          <span className="shrink-0 text-xs font-medium text-amber-700 bg-amber-100 rounded-full" style={{ padding: "1px 8px" }}>
            You
          </span>
        )}
      </div>

      <div className="flex items-center shrink-0" style={{ gap: 14 }}>
        <span className="inline-flex items-center text-base font-bold tabular-nums text-neutral-900" style={{ gap: 6 }}>
          {row.homeScore}
          <span className="text-neutral-300">–</span>
          {row.awayScore}
        </span>

        <span className="hidden sm:inline text-xs font-medium text-neutral-400" style={{ minWidth: 44, textAlign: "right" }}>
          {outcomeBadge(row.outcome, homeCode, awayCode)}
        </span>

        {isCompleted && (
          <div className="flex items-center" style={{ gap: 6, minWidth: 92, justifyContent: "flex-end" }}>
            <ResultChip ok={row.scoreCorrect ?? false} fallbackOk={row.directionCorrect ?? false} />
            <span
              className={cn("text-sm font-bold tabular-nums", (row.points ?? 0) > 0 ? "text-pitch-700" : "text-neutral-400")}
              style={{ minWidth: 52, textAlign: "right" }}
            >
              {(row.points ?? 0).toFixed(1)} pts
            </span>
          </div>
        )}

        {isInPlay && (
          <span
            className={cn(
              "text-sm font-bold tabular-nums stats-live-flicker",
              provisionalPts > 0 ? "text-amber-600" : "text-neutral-400"
            )}
            style={{ minWidth: 52, textAlign: "right" }}
          >
            {provisionalPts.toFixed(1)} pts
          </span>
        )}
      </div>
    </li>
  );
}

/** Green check if exact score, amber check if only direction, grey x otherwise. */
function ResultChip({ ok, fallbackOk }: { ok: boolean; fallbackOk: boolean }) {
  if (ok) {
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600" style={{ width: 22, height: 22 }} title="Exact score">
        <Check className="w-3.5 h-3.5" />
      </span>
    );
  }
  if (fallbackOk) {
    return (
      <span className="inline-flex items-center justify-center rounded-full bg-pitch-50 text-pitch-700" style={{ width: 22, height: 22 }} title="Correct result">
        <Check className="w-3.5 h-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-neutral-50 text-neutral-300" style={{ width: 22, height: 22 }} title="Incorrect">
      <X className="w-3.5 h-3.5" />
    </span>
  );
}
