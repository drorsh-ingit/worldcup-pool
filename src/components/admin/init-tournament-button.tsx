"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { initTournament } from "@/lib/actions/tournaments";
import { TOURNAMENT_CATALOG } from "@/lib/tournaments/catalog";
import type { TournamentKind } from "@/lib/tournaments/types";

export function InitTournamentButton({ groupId }: { groupId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<TournamentKind>("WC_2026");

  const selected = TOURNAMENT_CATALOG.find((o) => o.id === kind)!;

  async function handleInit() {
    setLoading(true);
    setError(null);
    try {
      const result = await initTournament(groupId, kind);
      if (result?.error) setError(result.error);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700">Tournament type</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as TournamentKind)}
          disabled={loading}
          className="w-full h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-pitch-500/20 focus:border-pitch-500"
        >
          {TOURNAMENT_CATALOG.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.displayName}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-neutral-600">
        Seeds teams, fixtures, and bet types for {selected.displayName} in draft status.
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button
        onClick={handleInit}
        disabled={loading}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-pitch-500 text-white text-sm font-medium hover:bg-pitch-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <Trophy className="w-4 h-4" />
        {loading ? "Setting up..." : `Initialize ${selected.displayName}`}
      </button>
    </div>
  );
}
