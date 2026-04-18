"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { syncFixtureIds } from "@/lib/actions/live-scores";

export function SyncFixturesButton({ groupId }: { groupId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ synced?: number; error?: string } | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    const res = await syncFixtureIds(groupId);
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
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Syncing..." : "Sync live score IDs"}
      </button>
      {result?.synced !== undefined && (
        <span className="text-xs text-emerald-600">{result.synced} matches linked</span>
      )}
      {result?.error && <span className="text-xs text-red-500">{result.error}</span>}
    </div>
  );
}
