"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getLiveStandingsDeltas } from "@/lib/actions/standings-live";

interface LiveDeltasValue {
  matchDeltas: Record<string, Record<string, number>>;
  inPlayCount: number;
}

const LiveDeltasContext = createContext<LiveDeltasValue>({ matchDeltas: {}, inPlayCount: 0 });

export function useLiveMatchDelta(matchId: string, userId: string): number {
  return useContext(LiveDeltasContext).matchDeltas[matchId]?.[userId] ?? 0;
}

export function useLiveInPlayCount(): number {
  return useContext(LiveDeltasContext).inPlayCount;
}

export function LiveDeltasProvider({ groupId, children }: { groupId: string; children: React.ReactNode }) {
  const [value, setValue] = useState<LiveDeltasValue>({ matchDeltas: {}, inPlayCount: 0 });

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await getLiveStandingsDeltas(groupId);
        if (!cancelled) setValue({ matchDeltas: res.matchDeltas, inPlayCount: res.inPlayCount });
      } catch { /* silent */ }
    }
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [groupId]);

  return <LiveDeltasContext.Provider value={value}>{children}</LiveDeltasContext.Provider>;
}
