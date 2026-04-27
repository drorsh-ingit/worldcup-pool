"use client";

import { useState } from "react";
import { updateTournamentStatus } from "@/lib/actions/tournaments";

type Status = "SETUP" | "GROUP_STAGE" | "KNOCKOUT" | "COMPLETE";

const STATUS_LABELS: Record<Status, string> = {
  SETUP: "Setup",
  GROUP_STAGE: "Group Stage",
  KNOCKOUT: "Knockout",
  COMPLETE: "Complete",
};

const STATUS_FLOW: Status[] = ["SETUP", "GROUP_STAGE", "KNOCKOUT", "COMPLETE"];

export function TournamentStatusControl({
  groupId,
  tournamentId,
  currentStatus,
}: {
  groupId: string;
  tournamentId: string;
  currentStatus: Status;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIdx = STATUS_FLOW.indexOf(currentStatus);
  const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;

  async function advance() {
    if (!nextStatus) return;
    setLoading(true);
    setError(null);
    try {
      const result = await updateTournamentStatus(groupId, tournamentId, nextStatus);
      if ("error" in result) setError(result.error as string);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        {STATUS_FLOW.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div
              className={`h-2 w-2 rounded-full ${
                i <= currentIdx ? "bg-pitch-500" : "bg-neutral-200"
              }`}
            />
            <span
              className={`text-xs ${i === currentIdx ? "text-neutral-900 font-medium" : "text-neutral-400"}`}
            >
              {STATUS_LABELS[s]}
            </span>
          </div>
        ))}
      </div>
      {nextStatus && (
        <button
          onClick={advance}
          disabled={loading}
          className="h-8 px-3 rounded-lg border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 transition-colors"
        >
          {loading ? "Updating..." : `Advance to ${STATUS_LABELS[nextStatus]}`}
        </button>
      )}
      {error && <p className="text-sm text-red-500 w-full">{error}</p>}
    </div>
  );
}
