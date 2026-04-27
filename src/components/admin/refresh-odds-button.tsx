"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { refreshTournamentWinnerOdds, refreshAllMatchOdds } from "@/lib/actions/refresh-odds";

export function RefreshOddsButton({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleRefresh() {
    setLoading(true);
    setResult(null);

    const [winner, matches] = await Promise.all([
      refreshTournamentWinnerOdds(tournamentId),
      refreshAllMatchOdds(tournamentId),
    ]);

    if (!winner.refreshed && !matches.refreshed) {
      setResult(winner.reason ?? matches.reason ?? "No odds available");
    } else {
      const parts = [];
      if (winner.refreshed) parts.push(`${winner.updated} teams updated`);
      if (matches.refreshed) parts.push(`${matches.updated} matches updated`);
      setResult(parts.join(" · ") || "Done");
    }

    setLoading(false);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleRefresh}
        disabled={loading}
        className="h-8 px-3 rounded-lg border border-neutral-200 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 transition-colors flex items-center gap-1.5"
      >
        <TrendingUp className={`w-3.5 h-3.5 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "Refreshing…" : "Refresh odds"}
      </button>
      {result && (
        <span className={`text-xs ${result.includes("No odds") || result.includes("not set") ? "text-pitch-700" : "text-emerald-600"}`}>
          {result}
        </span>
      )}
    </div>
  );
}
