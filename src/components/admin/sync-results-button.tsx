"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { syncCompetitionResults } from "@/lib/actions/live-scores";

export function SyncResultsButton({ groupId }: { groupId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ updated?: number; finishedInApi?: number; error?: string } | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    const res = await syncCompetitionResults(groupId);
    setResult(res);
    setLoading(false);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={loading}
        className="h-8 px-3 rounded-lg border border-neutral-200 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 transition-colors flex items-center gap-1.5"
      >
        <Download className={`w-3.5 h-3.5 ${loading ? "animate-pulse" : ""}`} />
        {loading ? "Syncing results…" : "Sync past results"}
      </button>
      {result?.updated !== undefined && (
        <span className="text-xs text-emerald-600">
          {result.updated === 0
            ? `Up to date (${result.finishedInApi ?? 0} finished in API)`
            : `${result.updated} matches updated`}
        </span>
      )}
      {result?.error && <span className="text-xs text-red-500">{result.error}</span>}
    </div>
  );
}
