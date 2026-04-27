"use client";

import { useState, useRef, useEffect } from "react";
import { Lock, ChevronDown, CheckCircle } from "lucide-react";
import { placeBet } from "@/lib/actions/bets";
import { Flag, CircleFlag } from "@/components/flag";
import { cn } from "@/lib/utils";

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedCandidate = candidates.find(
    (c) => `${c.playerName}|${c.teamCode}` === selected
  );

  async function handleSelect(value: string) {
    setOpen(false);
    if (!value || value === selected) return;
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

  if (isLocked) {
    const pts = selected ? pointsByCandidate?.[selected] : undefined;
    return (
      <div className="flex items-center gap-2.5 py-1">
        {selectedCandidate ? (
          <>
            <CircleFlag code={selectedCandidate.teamCode} size="xs" />
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="text-sm font-medium text-neutral-900">{selectedCandidate.playerName}</span>
              <span className="text-xs text-neutral-400">{selectedCandidate.teamCode}</span>
            </div>
            {pts != null && (
              <span className="text-xs text-neutral-400 tabular-nums ml-auto">{pts.toFixed(1)} potential points</span>
            )}
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-pitch-700">
            <Lock className="w-3.5 h-3.5" />
            No prediction entered
          </span>
        )}
      </div>
    );
  }

  const selectedPts = selected ? pointsByCandidate?.[selected] : undefined;

  return (
    <div className="space-y-2" ref={ref}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={saving}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-xl border text-sm transition-colors bg-white",
            open ? "border-pitch-500 ring-2 ring-pitch-500/20" : "border-neutral-200 hover:border-neutral-300"
          )}
          style={{ paddingLeft: 12, paddingRight: 10, paddingTop: 10, paddingBottom: 10 }}
        >
          {selectedCandidate ? (
            <>
              <Flag code={selectedCandidate.teamCode} size="sm" />
              <span className="font-medium text-neutral-900 truncate">{selectedCandidate.playerName}</span>
              <span className="text-xs text-neutral-400">{selectedCandidate.teamCode}</span>
              {selectedPts != null && (
                <span
                  className="text-xs text-neutral-400 tabular-nums shrink-0"
                  style={{ marginLeft: "auto" }}
                >
                  {selectedPts.toFixed(1)} potential points
                </span>
              )}
            </>
          ) : (
            <span className="text-neutral-400" style={{ flex: 1, textAlign: "left" }}>
              Select a player…
            </span>
          )}
          <ChevronDown
            className={cn(
              "w-4 h-4 text-neutral-400 shrink-0 transition-transform",
              open && "rotate-180"
            )}
            style={selectedPts == null ? { marginLeft: "auto" } : undefined}
          />
        </button>

        {open && (
          <div
            className="absolute left-0 right-0 z-20 bg-white rounded-xl border border-neutral-200 shadow-xl overflow-hidden"
            style={{ marginTop: 4, maxHeight: 320, overflowY: "auto" }}
          >
            {candidates.map((c) => {
              const key = `${c.playerName}|${c.teamCode}`;
              const pts = pointsByCandidate?.[key];
              const isSelected = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelect(key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b border-neutral-50 last:border-0",
                    isSelected ? "bg-pitch-50" : "bg-white hover:bg-neutral-50"
                  )}
                >
                  <Flag code={c.teamCode} size="sm" />
                  <span className={cn("flex-1 text-sm font-medium", isSelected ? "text-amber-900" : "text-neutral-800")}>
                    {c.playerName}
                  </span>
                  <span className="text-xs text-neutral-400 shrink-0">{c.teamCode}</span>
                  {pts != null && (
                    <span className="text-xs text-neutral-400 tabular-nums shrink-0">{pts.toFixed(1)} potential points</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs">
        {saving && <span className="text-neutral-400">Saving…</span>}
        {saved && !saving && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="w-3 h-3" /> Saved
          </span>
        )}
        {error && <span className="text-red-500">{error}</span>}
      </div>
    </div>
  );
}
