"use client";

import { useState, useTransition } from "react";
import { CheckCircle, ChevronDown, Lock } from "lucide-react";
import { placeBet } from "@/lib/actions/bets";

interface Team {
  id: string;
  name: string;
  code: string;
  groupLetter: string;
}

interface TeamPickerProps {
  groupId: string;
  tournamentId: string;
  betTypeId: string;
  betTypeName?: string;
  description?: string | null;
  isLocked: boolean;
  teams: Team[];
  teamOdds?: Record<string, number>;
  currentPrediction?: { teamCode?: string };
  pointsByTeam?: Record<string, number>;
}

export function TeamPicker({
  groupId,
  tournamentId,
  betTypeId,
  isLocked,
  teams,
  teamOdds,
  currentPrediction,
  pointsByTeam,
}: TeamPickerProps) {
  const [selected, setSelected] = useState<string>(currentPrediction?.teamCode ?? "");
  const [saved, setSaved] = useState(!!currentPrediction?.teamCode);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Sort by points ascending (lowest = favourite = shown first)
  const sortedTeams = [...teams].sort((a, b) => {
    const pa = pointsByTeam?.[a.code] ?? 0;
    const pb = pointsByTeam?.[b.code] ?? 0;
    return pa - pb;
  });

  const selectedTeam = teams.find((t) => t.code === selected);

  async function handleSelect(code: string) {
    if (isLocked || !code) return;
    setSelected(code);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const odds = teamOdds?.[code];
      const result = await placeBet(groupId, {
        tournamentId,
        betTypeId,
        prediction: { teamCode: code, ...(odds != null && { odds }) },
      });
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  if (isLocked) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {selectedTeam ? (
          <>
            <span className="font-semibold text-neutral-900">{selectedTeam.code}</span>
            <span className="text-neutral-500">{selectedTeam.name}</span>
            {saved && <CheckCircle className="w-4 h-4 text-emerald-500" />}
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-amber-600">
            <Lock className="w-3.5 h-3.5" />
            No prediction entered
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <select
            value={selected}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={isPending}
            className="w-full h-9 pl-3 pr-8 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 appearance-none disabled:opacity-60"
          >
            <option value="">— Select a team —</option>
            {sortedTeams.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code} {t.name}{pointsByTeam?.[t.code] != null ? ` — ${pointsByTeam[t.code].toFixed(1)} pts` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        </div>
        {isPending && <span className="text-xs text-neutral-400">Saving...</span>}
        {saved && !isPending && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

interface GroupPredictionsPickerProps {
  groupId: string;
  tournamentId: string;
  betTypeId: string;
  description?: string | null;
  isLocked: boolean;
  teamsByGroup: Record<string, Team[]>;
  currentPrediction?: Record<string, string[]>;
  pointsByTeam?: Record<string, number>;
}

export function GroupPredictionsPicker({
  groupId,
  tournamentId,
  betTypeId,
  isLocked,
  teamsByGroup,
  currentPrediction,
}: GroupPredictionsPickerProps) {
  // picks: { A: ["FRA", "MEX", "BRA"], ... } — [0] = winner, rest = other advancers
  const [picks, setPicks] = useState<Record<string, string[]>>(currentPrediction ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!currentPrediction && Object.keys(currentPrediction).length > 0);
  const [error, setError] = useState<string | null>(null);

  const groups = Object.entries(teamsByGroup).sort(([a], [b]) => a.localeCompare(b));
  const groupCount = groups.length;
  const winnersCount = groups.filter(([letter]) => !!picks[letter]?.[0]).length;
  const advancersCount = Object.values(picks).reduce((sum, p) => sum + Math.max(0, p.length - 1), 0);
  const maxAdvancers = 20; // WC 2026: 12 runners-up + 8 best third-place = 20 non-winner advancers

  async function save(newPicks: Record<string, string[]>) {
    setSaving(true);
    const result = await placeBet(groupId, { tournamentId, betTypeId, prediction: newPicks });
    setSaving(false);
    if (result.error) setError(result.error);
    else setSaved(true);
  }

  function handleWinnerChange(letter: string, code: string) {
    if (isLocked) return;
    const advancers = (picks[letter] ?? []).slice(1).filter((c) => c !== code);
    const newGroup = code ? [code, ...advancers] : advancers;
    const newPicks = { ...picks, [letter]: newGroup };
    if (newGroup.length === 0) delete newPicks[letter];
    setPicks(newPicks);
    setSaved(false);
    setError(null);
    save(newPicks);
  }

  function handleAdvancerToggle(letter: string, code: string) {
    if (isLocked) return;
    const current = picks[letter] ?? [];
    const winner = current[0] ?? "";
    if (code === winner) return;
    const advancers = current.slice(1);
    const isAdding = !advancers.includes(code);
    const newAdvancers = advancers.includes(code)
      ? advancers.filter((c) => c !== code)
      : advancers.length >= 2 || (isAdding && advancersCount >= maxAdvancers)
      ? advancers
      : [...advancers, code];
    const newGroup = winner ? [winner, ...newAdvancers] : newAdvancers;
    const newPicks = { ...picks, [letter]: newGroup };
    if (newGroup.length === 0) delete newPicks[letter];
    setPicks(newPicks);
    setSaved(false);
    setError(null);
    save(newPicks);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs text-neutral-400">
        <span className={winnersCount < groupCount ? "text-amber-600" : "text-emerald-600"}>
          {winnersCount}/{groupCount} winners
        </span>
        <span className="text-neutral-300">·</span>
        <span className={advancersCount < groupCount ? "text-amber-600" : "text-neutral-500"}>
          {advancersCount}/{maxAdvancers} advancing
        </span>
        {saving && <span>Saving...</span>}
        {saved && !saving && (
          <span className="text-emerald-600 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Saved
          </span>
        )}
      </div>

      <div className="space-y-3">
        {groups.map(([letter, teams]) => {
          const groupPicks = picks[letter] ?? [];
          const winner = groupPicks[0] ?? "";
          const advancers = new Set(groupPicks.slice(1));

          return (
            <div key={letter} className="rounded-lg border border-neutral-100 bg-neutral-50/40 p-3 space-y-2.5">
              {/* Winner dropdown */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-neutral-500 w-16 shrink-0">Group {letter}</span>
                {isLocked ? (
                  <span className="text-xs text-neutral-700 font-medium">
                    {winner
                      ? `${winner} — ${teams.find((t) => t.code === winner)?.name ?? ""}`
                      : <span className="text-amber-600 flex items-center gap-1"><Lock className="w-3 h-3" />No winner picked</span>}
                  </span>
                ) : (
                  <div className="relative flex-1 max-w-xs">
                    <select
                      value={winner}
                      onChange={(e) => handleWinnerChange(letter, e.target.value)}
                      className="w-full h-8 pl-3 pr-8 rounded-lg border border-neutral-200 bg-white text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 appearance-none"
                    >
                      <option value="">— Group winner —</option>
                      {teams.map((t) => (
                        <option key={t.code} value={t.code}>{t.code} — {t.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  </div>
                )}
              </div>

              {/* Advancing checkboxes */}
              <div className="pl-[76px] grid grid-cols-2 gap-x-6 gap-y-1.5">
                {teams.map((t) => {
                  const isWinner = t.code === winner;
                  const isChecked = isWinner || advancers.has(t.code);
                  const isDisabled = isLocked || isWinner || ((advancers.size >= 2 || advancersCount >= maxAdvancers) && !advancers.has(t.code));

                  return (
                    <label
                      key={t.code}
                      className={`flex items-center gap-2 text-xs select-none ${isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isDisabled}
                        onChange={() => handleAdvancerToggle(letter, t.code)}
                        className="w-3.5 h-3.5 rounded accent-emerald-500 shrink-0"
                      />
                      <span className={isWinner ? "text-amber-700 font-semibold" : isChecked ? "text-emerald-700 font-medium" : "text-neutral-600"}>
                        {t.code} — {t.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

interface SemifinalistsPickerProps {
  groupId: string;
  tournamentId: string;
  betTypeId: string;
  description?: string | null;
  isLocked: boolean;
  teamsByGroup: Record<string, Team[]>;
  currentPrediction?: { teams?: string[] };
}

export function SemifinalistsPicker({
  groupId,
  tournamentId,
  betTypeId,
  description,
  isLocked,
  teamsByGroup,
  currentPrediction,
}: SemifinalistsPickerProps) {
  const [picks, setPicks] = useState<Set<string>>(new Set(currentPrediction?.teams ?? []));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!(currentPrediction?.teams?.length));
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(code: string) {
    if (isLocked) return;
    const next = new Set(picks);
    if (next.has(code)) {
      next.delete(code);
    } else {
      if (next.size >= 4) return; // max 4
      next.add(code);
    }
    setPicks(next);
    setSaved(false);

    if (next.size === 4) {
      setSaving(true);
      const result = await placeBet(groupId, {
        tournamentId,
        betTypeId,
        prediction: { teams: [...next] },
      });
      setSaving(false);
      if (result.error) setError(result.error);
      else setSaved(true);
    }
  }

  const groups = Object.entries(teamsByGroup).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-neutral-400">Pick exactly 4 teams ({picks.size}/4 selected)</p>
        {saved && picks.size === 4 && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle className="w-3 h-3" /> Saved
          </span>
        )}
        {saving && <span className="text-xs text-neutral-400">Saving...</span>}
      </div>

      <div className="space-y-2">
        {groups.map(([letter, teams]) => (
          <div key={letter} className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-neutral-400 w-14 shrink-0">Grp {letter}</span>
            <div className="flex gap-1.5 flex-wrap">
              {teams.map((t) => (
                <button
                  key={t.code}
                  onClick={() => handleToggle(t.code)}
                  disabled={isLocked || (picks.size >= 4 && !picks.has(t.code))}
                  className={`h-7 px-2 rounded-lg border text-xs font-medium transition-colors ${
                    picks.has(t.code)
                      ? "border-amber-400 bg-amber-50 text-amber-800"
                      : picks.size >= 4
                      ? "border-neutral-100 text-neutral-300 cursor-not-allowed"
                      : "border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  {t.code}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
