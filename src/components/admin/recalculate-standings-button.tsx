"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { recalculateStandings } from "@/lib/actions/results";

export function RecalculateStandingsButton({ groupId }: { groupId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setDone(false);
    setError(null);
    const res = await recalculateStandings(groupId);
    setLoading(false);
    if ("error" in res) setError(res.error ?? "Unknown error");
    else setDone(true);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={loading}
        className="h-8 px-3 rounded-lg border border-neutral-200 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 transition-colors flex items-center gap-1.5"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Recalculating…" : "Recalculate standings"}
      </button>
      {done && <span className="text-xs text-emerald-600">Standings updated</span>}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
