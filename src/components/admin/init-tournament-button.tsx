"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { initTournament } from "@/lib/actions/tournaments";

export function InitTournamentButton({ groupId }: { groupId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInit() {
    setLoading(true);
    setError(null);
    try {
      const result = await initTournament(groupId);
      if (result?.error) setError(result.error);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        This will seed all 48 FIFA World Cup 2026 teams, generate group-stage matches, and
        create standard pre-tournament bet types in draft status.
      </p>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      <button
        onClick={handleInit}
        disabled={loading}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <Trophy className="w-4 h-4" />
        {loading ? "Setting up..." : "Initialize FIFA World Cup 2026"}
      </button>
    </div>
  );
}
