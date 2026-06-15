"use client";

import { cn } from "@/lib/utils";
import { RESULT_CLASSES, scoreResult } from "./result-color";
import { useLiveScore } from "./live-scores-context";

/**
 * An in-play prediction cell. Colors provisionally against the live score and
 * flickers slowly to signal it's still changing. Falls back to neutral until a
 * live score is available.
 */
export function StatsLiveCell({
  matchId,
  predH,
  predA,
}: {
  matchId: string;
  predH: number;
  predA: number;
}) {
  const live = useLiveScore(matchId);
  const hasLive = !!live && live.home != null && live.away != null;
  const result = hasLive ? scoreResult(predH, predA, live!.home!, live!.away!) : "pending";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg border text-sm font-semibold tabular-nums",
        RESULT_CLASSES[result],
        hasLive && "stats-live-flicker"
      )}
      style={{ minWidth: 44, height: 30, paddingLeft: 8, paddingRight: 8 }}
      title={hasLive ? `Live ${live!.home}–${live!.away} · provisional` : "In play"}
    >
      {predH}–{predA}
    </span>
  );
}
