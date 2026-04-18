"use client";

import { useState } from "react";
import { CheckCircle, Lock } from "lucide-react";
import { placeBet } from "@/lib/actions/bets";

interface OptionPickFormProps {
  groupId: string;
  tournamentId: string;
  betTypeId: string;
  description?: string | null;
  options: string[];
  isLocked: boolean;
  currentPrediction?: { option?: string };
}

export function OptionPickForm({
  groupId,
  tournamentId,
  betTypeId,
  description,
  options,
  isLocked,
  currentPrediction,
}: OptionPickFormProps) {
  const [selected, setSelected] = useState<string>(currentPrediction?.option ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!currentPrediction?.option);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(option: string) {
    if (isLocked) return;
    setSelected(option);
    setSaved(false);
    setSaving(true);
    setError(null);

    const result = await placeBet(groupId, {
      tournamentId,
      betTypeId,
      prediction: { option },
    });
    setSaving(false);
    if (result.error) setError(result.error);
    else setSaved(true);
  }

  return (
    <div className="space-y-3">
      {isLocked && !selected && (
        <div className="flex items-center gap-1.5 text-sm text-amber-600">
          <Lock className="w-3.5 h-3.5" />
          Betting is closed
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => handlePick(opt)}
            disabled={isLocked || saving}
            className={`h-10 px-4 rounded-lg border text-sm font-medium text-left transition-colors ${
              selected === opt
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-default"
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{opt}</span>
              {selected === opt && saved && <CheckCircle className="w-4 h-4 text-emerald-500" />}
            </div>
          </button>
        ))}
      </div>
      {saving && <p className="text-xs text-neutral-400">Saving...</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
