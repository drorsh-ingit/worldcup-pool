"use client";

import { useState } from "react";
import { debugCLFixtures } from "@/lib/actions/tournaments";

interface Props { groupId: string }

export function DebugCLFixturesButton({ groupId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof debugCLFixtures>> | null>(null);

  async function run() {
    setLoading(true);
    try {
      const r = await debugCLFixtures(groupId);
      setResult(r);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={run}
        disabled={loading}
        className="text-xs px-3 py-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
      >
        {loading ? "Fetching…" : "Check API fixtures"}
      </button>

      {result && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs font-mono space-y-1 max-h-96 overflow-y-auto">
          {result.error && <p className="text-red-500">{result.error}</p>}

          {result.stageCounts && (
            <div className="pb-2 mb-2 border-b border-neutral-200 space-y-0.5">
              <p className="text-neutral-500 font-semibold">Stage counts:</p>
              {Object.entries(result.stageCounts)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([stage, count]) => (
                  <div key={stage} className="text-neutral-700">
                    {stage}: {count}
                  </div>
                ))}
            </div>
          )}

          {result.matches.length === 0 && !result.error && (
            <p className="text-neutral-400">No knockout matches returned</p>
          )}
          {result.matches.map((m) => (
            <div key={m.id} className="flex gap-2 flex-wrap">
              <span className="text-neutral-400">[{m.stage}]</span>
              <span className={m.homeMatchedCode ? "text-emerald-600" : "text-red-500"}>
                {m.home.name} ({m.home.id}) → {m.homeMatchedCode ?? "NO MATCH"}
              </span>
              <span className="text-neutral-400">vs</span>
              <span className={m.awayMatchedCode ? "text-emerald-600" : "text-red-500"}>
                {m.away.name} ({m.away.id}) → {m.awayMatchedCode ?? "NO MATCH"}
              </span>
              <span className="text-neutral-300">{m.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
