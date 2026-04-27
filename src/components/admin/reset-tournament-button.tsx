"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteTournament } from "@/lib/actions/tournaments";

export function ResetTournamentButton({ groupId }: { groupId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const res = await deleteTournament(groupId);
    if (res.error) {
      setError(res.error);
      setLoading(false);
      setConfirming(false);
    }
    // On success the page revalidates and the tournament section disappears
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-600">Delete all tournament data?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="h-8 px-3 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-60 transition-colors"
        >
          {loading ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="h-8 px-3 rounded-lg border border-neutral-200 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-60 transition-colors"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="h-8 px-3 rounded-lg border border-red-200 text-xs text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1.5"
    >
      <Trash2 className="w-3.5 h-3.5" />
      Reset tournament
    </button>
  );
}
