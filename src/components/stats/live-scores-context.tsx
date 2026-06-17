"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getLiveMatchScore } from "@/lib/actions/live-scores";

export interface LiveCellScore {
  home: number | null;
  away: number | null;
  status: string;
}

const LiveScoresContext = createContext<Record<string, LiveCellScore>>({});

export function useLiveScore(matchId: string): LiveCellScore | undefined {
  return useContext(LiveScoresContext)[matchId];
}

export function useLiveScores(): Record<string, LiveCellScore> {
  return useContext(LiveScoresContext);
}

/**
 * Polls live scores for the given in-play matches (once per match, shared) and
 * exposes them by matchId. Refreshes every 60s, matching the match card cadence.
 */
export function LiveScoresProvider({
  groupId,
  matchIds,
  children,
}: {
  groupId: string;
  matchIds: string[];
  children: React.ReactNode;
}) {
  const [scores, setScores] = useState<Record<string, LiveCellScore>>({});
  const key = matchIds.join(",");

  useEffect(() => {
    if (matchIds.length === 0) return;
    let cancelled = false;

    async function poll() {
      const entries = await Promise.all(
        matchIds.map(async (id) => [id, (await getLiveMatchScore(groupId, id)).data] as const)
      );
      if (cancelled) return;
      setScores((prev) => {
        const next = { ...prev };
        for (const [id, data] of entries) {
          if (data) next[id] = { home: data.home, away: data.away, status: data.status };
        }
        return next;
      });
    }

    poll();
    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, key]);

  return <LiveScoresContext.Provider value={scores}>{children}</LiveScoresContext.Provider>;
}
