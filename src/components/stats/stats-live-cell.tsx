"use client";

import { cn } from "@/lib/utils";
import { RESULT_CLASSES, scoreResult } from "./result-color";
import { useLiveScore } from "./live-scores-context";
import { useLiveMatchDelta } from "@/components/live-deltas-context";

export function StatsLiveCell({
  matchId,
  predH,
  predA,
  userId,
}: {
  matchId: string;
  predH: number;
  predA: number;
  userId: string;
}) {
  const live = useLiveScore(matchId);
  const hasLive = !!live && live.home != null && live.away != null;
  const result = hasLive ? scoreResult(predH, predA, live!.home!, live!.away!) : "pending";
  const provisionalPts = useLiveMatchDelta(matchId, userId);

  return (
    <div className="flex flex-col items-center" style={{ gap: 3 }}>
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
      {hasLive && (
        <span className="text-[11px] font-semibold tabular-nums text-amber-600 stats-live-flicker leading-none">
          {provisionalPts > 0 ? `${provisionalPts.toFixed(1)} pts` : "—"}
        </span>
      )}
    </div>
  );
}
