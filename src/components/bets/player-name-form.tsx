"use client";

import { useState } from "react";
import { CheckCircle, Lock } from "lucide-react";
import { placeBet } from "@/lib/actions/bets";

interface Candidate {
  playerName: string;
  teamCode: string;
  odds: number;
}

interface PlayerNameFormProps {
  groupId: string;
  tournamentId: string;
  betTypeId: string;
  description?: string | null;
  isLocked: boolean;
  candidates: Candidate[];
  currentPrediction?: { playerName?: string; teamCode?: string };
  pointsByCandidate?: Record<string, number>;
}

export function PlayerNameForm({
  groupId,
  tournamentId,
  betTypeId,
  description,
  isLocked,
  candidates,
  currentPrediction,
  pointsByCandidate,
}: PlayerNameFormProps) {
  const currentKey = currentPrediction
    ? `${currentPrediction.playerName}|${currentPrediction.teamCode}`
    : "";
  const [selected, setSelected] = useState(currentKey);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!currentPrediction?.playerName);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(value: string) {
    if (!value) return;
    setSelected(value);
    setSaved(false);
    setSaving(true);
    setError(null);

    const [playerName, teamCode] = value.split("|");

    const result = await placeBet(groupId, {
      tournamentId,
      betTypeId,
      prediction: { playerName, teamCode },
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else setSaved(true);
  }

  if (isLocked && !currentPrediction?.playerName) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-amber-600">
        <Lock className="w-3.5 h-3.5" />
        Betting is closed — no prediction entered
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isLocked && currentPrediction?.playerName ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4 text-emerald-500" />
          <span className="font-medium">{currentPrediction.playerName}</span>
          <span className="text-neutral-400">({currentPrediction.teamCode})</span>
        </div>
      ) : (
        <div className="space-y-2">
          <select
            value={selected}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={saving}
            className="w-full h-9 px-3 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white disabled:opacity-60"
          >
            <option value="">Select a player</option>
            {candidates.map((c) => {
              const key = `${c.playerName}|${c.teamCode}`;
              const pts = pointsByCandidate?.[key];
              return (
                <option key={key} value={key}>
                  {c.playerName} ({c.teamCode}){pts != null ? ` — ${pts.toFixed(1)} pts` : ""}
                </option>
              );
            })}
          </select>
          <div className="flex items-center gap-2 h-5">
            {saving && <span className="text-xs text-neutral-400">Saving...</span>}
            {saved && !saving && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
