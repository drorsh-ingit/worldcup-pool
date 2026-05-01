"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { CheckCircle, Lock, ChevronDown } from "lucide-react";
import { placeBet } from "@/lib/actions/bets";
import { Flag, CircleFlag } from "@/components/flag";
import { TeamBadge } from "@/components/team-badge";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
  code: string;
  groupLetter: string;
}

// ─── TeamPicker ───────────────────────────────────────────────────────────────

interface TeamPickerProps {
  groupId: string;
  tournamentId: string;
  betTypeId: string;
  isLocked: boolean;
  teams: Team[];
  teamOdds?: Record<string, number>;
  currentPrediction?: { teamCode?: string };
  pointsByTeam?: Record<string, number>;
  tournamentKind?: string;
  /** When the bet is RESOLVED, the answer used for scoring. `teamCode` for
   *  single-answer bets (winner, runner_up); `teams` for list-answer bets
   *  (dark_horse, reverse_dark_horse). */
  resolution?: { teamCode?: string; teams?: string[] };
  /** Points the user actually earned (read from the bet record). */
  earnedPoints?: number | null;
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
  tournamentKind = "WC_2026",
  resolution,
  earnedPoints,
}: TeamPickerProps) {
  const [selected, setSelected] = useState<string>(currentPrediction?.teamCode ?? "");
  const [saved, setSaved] = useState(!!currentPrediction?.teamCode);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const sortedTeams = [...teams].sort((a, b) => {
    const pa = pointsByTeam?.[a.code] ?? 0;
    const pb = pointsByTeam?.[b.code] ?? 0;
    return pa - pb;
  });

  const selectedTeam = teams.find((t) => t.code === selected);

  async function handleSelect(code: string) {
    setOpen(false);
    if (isLocked || !code || code === selected) return;
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
    const pts = selectedTeam ? pointsByTeam?.[selectedTeam.code] : undefined;
    const isResolved = !!resolution && (
      resolution.teamCode != null || (resolution.teams?.length ?? 0) > 0
    );
    const wasCorrect =
      isResolved && selectedTeam
        ? resolution!.teamCode != null
          ? resolution!.teamCode === selectedTeam.code
          : (resolution!.teams ?? []).includes(selectedTeam.code)
        : null;
    const correctTeamCode =
      isResolved && resolution!.teamCode ? resolution!.teamCode : null;
    const correctTeam = correctTeamCode
      ? teams.find((t) => t.code === correctTeamCode)
      : null;
    const correctTeams =
      isResolved && resolution!.teams && resolution!.teams.length > 0
        ? resolution!.teams
            .map((code) => teams.find((t) => t.code === code))
            .filter((t): t is Team => !!t)
        : [];

    return (
      <div className="flex flex-col gap-1.5 py-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          {selectedTeam ? (
            <>
              <TeamBadge code={selectedTeam.code} tournamentKind={tournamentKind} size="sm" />
              <span className={cn(
                "text-sm font-medium",
                wasCorrect === true ? "text-emerald-700" : wasCorrect === false ? "text-neutral-500" : "text-neutral-900"
              )}>
                {selectedTeam.name}
              </span>
              {wasCorrect === true && (
                <span className="text-xs font-bold rounded bg-emerald-500 text-white px-1.5 py-0.5 leading-none">✓</span>
              )}
              {wasCorrect === false && (
                <span className="text-xs font-bold rounded bg-red-400 text-white px-1.5 py-0.5 leading-none">✗</span>
              )}
              {isResolved ? (
                <span className={cn(
                  "text-xs tabular-nums font-semibold",
                  (earnedPoints ?? 0) > 0 ? "text-emerald-600" : "text-neutral-400"
                )}>
                  {(earnedPoints ?? 0).toFixed(1)} pts earned
                </span>
              ) : (
                pts != null && (
                  <span className="text-xs text-neutral-400 tabular-nums">{pts.toFixed(1)} potential points</span>
                )
              )}
            </>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-pitch-700">
              <Lock className="w-3.5 h-3.5" />
              No prediction entered
            </span>
          )}
        </div>
        {isResolved && correctTeam && wasCorrect === false && (
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <span>Actual:</span>
            <TeamBadge code={correctTeam.code} tournamentKind={tournamentKind} size="sm" />
            <span className="font-medium text-neutral-700">{correctTeam.name}</span>
          </div>
        )}
        {isResolved && correctTeams.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs text-neutral-500 flex-wrap">
            <span className="shrink-0">Correct picks:</span>
            <span className="flex items-center gap-1.5 flex-wrap">
              {correctTeams.map((t) => (
                <span
                  key={t.code}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5",
                    selectedTeam?.code === t.code && "bg-emerald-100 text-emerald-800"
                  )}
                >
                  <TeamBadge code={t.code} tournamentKind={tournamentKind} size="sm" />
                  <span className="font-medium">{t.name}</span>
                </span>
              ))}
            </span>
          </div>
        )}
        {isResolved && correctTeams.length === 0 && resolution!.teams && (
          <span className="text-xs text-neutral-400">No team matched the criteria.</span>
        )}
      </div>
    );
  }

  const selectedPts = selectedTeam ? pointsByTeam?.[selectedTeam.code] : undefined;

  return (
    <div className="space-y-2" ref={ref}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={isPending}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-xl border text-sm transition-colors bg-white",
            open ? "border-pitch-500 ring-2 ring-pitch-500/20" : "border-neutral-200 hover:border-neutral-300"
          )}
          style={{ paddingLeft: 12, paddingRight: 10, paddingTop: 10, paddingBottom: 10 }}
        >
          {selectedTeam ? (
            <>
              <TeamBadge code={selectedTeam.code} tournamentKind={tournamentKind} size="sm" />
              <span className="font-medium text-neutral-900 truncate">{selectedTeam.name}</span>
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
              Select a team…
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
            {sortedTeams.map((t) => {
              const pts = pointsByTeam?.[t.code];
              const isSelected = t.code === selected;
              return (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => handleSelect(t.code)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors border-b border-neutral-50 last:border-0",
                    isSelected ? "bg-pitch-50" : "bg-white hover:bg-neutral-50"
                  )}
                >
                  <TeamBadge code={t.code} tournamentKind={tournamentKind} size="sm" />
                  <span className={cn("flex-1 font-medium", isSelected ? "text-amber-900" : "text-neutral-800")}>
                    {t.name}
                  </span>
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
        {isPending && <span className="text-neutral-400">Saving…</span>}
        {saved && !isPending && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="w-3 h-3" /> Saved
          </span>
        )}
        {error && <span className="text-red-500">{error}</span>}
      </div>
    </div>
  );
}

// ─── GroupPredictionsPicker ───────────────────────────────────────────────────

type GroupStandingRow = {
  code: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

interface GroupPredictionsPickerProps {
  groupId: string;
  tournamentId: string;
  betTypeId: string;
  description?: string | null;
  isLocked: boolean;
  teamsByGroup: Record<string, Team[]>;
  currentPrediction?: Record<string, string[]>;
  pointsByTeam?: Record<string, number>;
  qualifierPointsByTeam?: Record<string, number>;
  resolution?: { winners?: Record<string, string>; advancing?: string[] };
  groupStandings?: Record<string, GroupStandingRow[]>;
}

export function GroupPredictionsPicker({
  groupId,
  tournamentId,
  betTypeId,
  isLocked,
  teamsByGroup,
  currentPrediction,
  pointsByTeam,
  qualifierPointsByTeam,
  resolution,
  groupStandings,
}: GroupPredictionsPickerProps) {
  // picks[letter] = [winner, advancer1, advancer2]
  const [picks, setPicks] = useState<Record<string, string[]>>(currentPrediction ?? {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!currentPrediction && Object.keys(currentPrediction).length > 0);
  const [error, setError] = useState<string | null>(null);

  const groups = Object.entries(teamsByGroup).sort(([a], [b]) => a.localeCompare(b));

  async function save(newPicks: Record<string, string[]>) {
    setSaving(true);
    setSaved(false);
    const result = await placeBet(groupId, { tournamentId, betTypeId, prediction: newPicks });
    setSaving(false);
    if (result.error) setError(result.error);
    else setSaved(true);
  }

  // Storage convention: picks[letter] = [winner, ...advancers]. Index 0 is the
  // winner slot — empty string "" means no winner picked yet (but advancers may
  // still be present). Omit the group entirely when both are empty.
  function commitGroup(letter: string, winner: string, advancers: string[]) {
    const filtered = advancers.filter((c) => c && c !== winner);
    const newGroup = winner || filtered.length > 0 ? [winner, ...filtered] : [];
    const newPicks = { ...picks };
    if (newGroup.length === 0) delete newPicks[letter];
    else newPicks[letter] = newGroup;
    setPicks(newPicks);
    setError(null);
    save(newPicks);
  }

  function handleWinner(letter: string, code: string) {
    if (isLocked) return;
    const current = picks[letter] ?? [];
    const winner = current[0] ?? "";
    const advancers = current.slice(1);
    const newWinner = winner === code ? "" : code;
    commitGroup(letter, newWinner, advancers);
  }

  const totalQualifiers = Object.values(picks).reduce(
    (sum, arr) => sum + Math.max(0, (arr?.length ?? 0) - 1),
    0
  );
  const MAX_QUALIFIERS = 20;

  function handleAdvancer(letter: string, code: string) {
    if (isLocked) return;
    const current = picks[letter] ?? [];
    const winner = current[0] ?? "";
    if (code === winner) return; // winner already advances
    const advancers = current.slice(1);
    const isAdv = advancers.includes(code);
    if (!isAdv && totalQualifiers >= MAX_QUALIFIERS) return; // global cap
    const newAdvancers = isAdv
      ? advancers.filter((c) => c !== code)
      : advancers.length >= 2 ? advancers : [...advancers, code];
    commitGroup(letter, winner, newAdvancers);
  }

  const winnersCount = groups.filter(([l]) => !!picks[l]?.[0]).length;
  const qualifiersFull = totalQualifiers >= MAX_QUALIFIERS;

  return (
    <div className="flex flex-col gap-6">
      {/* Status row */}
      <div className="flex items-center gap-4 text-xs mb-2 flex-wrap">
        <span className={winnersCount < groups.length ? "text-pitch-700 font-medium" : "text-emerald-600 font-medium"}>
          {winnersCount}/{groups.length} winners picked
        </span>
        <span className={totalQualifiers < MAX_QUALIFIERS ? "text-pitch-700 font-medium" : "text-emerald-600 font-medium"}>
          {totalQualifiers}/{MAX_QUALIFIERS} additional qualifiers picked
        </span>
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="inline-block w-2 h-2 rounded-full bg-pitch-500" />W = winner
        </span>
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />Q = qualifies
        </span>
        {saving && <span className="text-neutral-400">Saving…</span>}
        {saved && !saving && <span className="flex items-center gap-1 text-emerald-600"><CheckCircle className="w-3 h-3" /> Saved</span>}
        {error && <span className="text-red-500">{error}</span>}
      </div>

      {/* Group grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map(([letter, teams]) => {
          const winner = picks[letter]?.[0] ?? "";
          const advancers = new Set(picks[letter]?.slice(1) ?? []);

          const actualWinner = resolution?.winners?.[letter];
          const actualAdvancing = resolution?.advancing;
          const standings = groupStandings?.[letter];

          // When standings available, use their order; otherwise sort by resolution or keep original
          const sortedTeams = standings
            ? [...teams].sort((a, b) => {
                const ia = standings.findIndex(s => s.code === a.code);
                const ib = standings.findIndex(s => s.code === b.code);
                return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
              })
            : resolution
            ? [...teams].sort((a, b) => {
                const rankA = a.code === actualWinner ? 0 : actualAdvancing?.includes(a.code) ? 1 : 2;
                const rankB = b.code === actualWinner ? 0 : actualAdvancing?.includes(b.code) ? 1 : 2;
                return rankA - rankB;
              })
            : teams;

          return (
            <div key={letter} className="rounded-xl border border-neutral-200 overflow-hidden">
              <div className="bg-neutral-800 px-4 py-3.5">
                <span className="text-sm font-bold text-white uppercase tracking-wider">Group {letter}</span>
              </div>

              {/* Standings table header — shown when standings data available */}
              {standings && (() => {
                const showPickers = !isLocked && !resolution;
                const gridCls = showPickers
                  ? "grid grid-cols-[24px_22px_1fr_30px_30px_30px] sm:grid-cols-[28px_28px_1fr_28px_28px_28px_36px_28px_28px_34px_34px]"
                  : "grid grid-cols-[24px_22px_1fr_30px] sm:grid-cols-[28px_28px_1fr_28px_28px_28px_36px_28px_28px]";
                return (
                  <div className={cn(gridCls,
                      "text-xs font-semibold text-neutral-400 uppercase tracking-wide border-b border-neutral-100 bg-neutral-50"
                    )}
                    style={{ gap: 0, paddingLeft: 12, paddingRight: 12, paddingTop: 8, paddingBottom: 8 }}>
                    <span className="text-center">#</span>
                    <span />
                    <span>Team</span>
                    <span className="hidden sm:block text-center">P</span>
                    <span className="hidden sm:block text-center">W</span>
                    <span className="hidden sm:block text-center">D</span>
                    <span className="text-center">Pts</span>
                    <span className="hidden sm:block text-center">GF</span>
                    <span className="hidden sm:block text-center">GA</span>
                    {showPickers && <span className="text-center">W</span>}
                    {showPickers && <span className="text-center">Q</span>}
                  </div>
                );
              })()}

              <div className="divide-y divide-neutral-100 bg-white">
                {sortedTeams.map((team, idx) => {
                  const isWinner = team.code === winner;
                  const isAdvancer = advancers.has(team.code);
                  const advFull = !isAdvancer && !isWinner && (advancers.size >= 2 || qualifiersFull);

                  const winPts = pointsByTeam?.[team.code];
                  const qualPts = qualifierPointsByTeam?.[team.code];

                  const isActualWinner = actualWinner === team.code;
                  const isActualQualifier = actualAdvancing?.includes(team.code) ?? false;
                  const pickedQualifies = isWinner || isAdvancer;

                  const wCorrect = resolution && isWinner && isActualWinner;
                  const wWrong   = resolution && isWinner && !isActualWinner;
                  const qCorrect = resolution && pickedQualifies && isActualQualifier;
                  const qWrong   = resolution && pickedQualifies && !isActualQualifier;

                  const rowBg = resolution
                    ? isActualWinner ? "bg-amber-50" : isActualQualifier ? "bg-emerald-50" : ""
                    : isWinner ? "bg-pitch-50" : isAdvancer ? "bg-emerald-50" : "";

                  const st = standings?.find(s => s.code === team.code);
                  const place = standings ? idx + 1 : null;

                  if (standings && st) {
                    const showPickers = !isLocked && !resolution;
                    const gridCls = showPickers
                      ? "grid grid-cols-[24px_22px_1fr_30px_30px_30px] sm:grid-cols-[28px_28px_1fr_28px_28px_28px_36px_28px_28px_34px_34px]"
                      : "grid grid-cols-[24px_22px_1fr_30px] sm:grid-cols-[28px_28px_1fr_28px_28px_28px_36px_28px_28px]";
                    // Full standings row
                    return (
                      <div key={team.code}
                        className={cn(gridCls, "items-center divide-x-0 gap-0", rowBg)}
                        style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 10, paddingBottom: 10 }}>
                        {/* Place */}
                        <span className={cn("text-xs font-bold text-center tabular-nums",
                          place === 1 ? "text-amber-500" : place === 2 ? "text-neutral-500" : "text-neutral-300"
                        )}>{place}</span>
                        {/* Flag */}
                        <span className="flex justify-center"><Flag code={team.code} size="sm" /></span>
                        {/* Name */}
                        <span className={cn("text-sm font-medium truncate px-1",
                          isActualWinner ? "text-amber-800" : isActualQualifier ? "text-emerald-800" : "text-neutral-500"
                        )}>{team.name}</span>
                        {/* P */}
                        <span className="hidden sm:block text-xs tabular-nums text-center text-neutral-500">{st.played}</span>
                        {/* W */}
                        <span className="hidden sm:block text-xs tabular-nums text-center text-neutral-500">{st.won}</span>
                        {/* D */}
                        <span className="hidden sm:block text-xs tabular-nums text-center text-neutral-500">{st.drawn}</span>
                        {/* Pts */}
                        <span className={cn("text-xs font-bold tabular-nums text-center",
                          isActualWinner ? "text-amber-700" : isActualQualifier ? "text-emerald-700" : "text-neutral-400"
                        )}>{st.points}</span>
                        {/* GF */}
                        <span className="hidden sm:block text-xs tabular-nums text-center text-neutral-500">{st.gf}</span>
                        {/* GA */}
                        <span className="hidden sm:block text-xs tabular-nums text-center text-neutral-500">{st.ga}</span>
                        {showPickers && (
                          <span className="flex justify-center">
                            <button onClick={() => handleWinner(letter, team.code)} disabled={isLocked}
                              className={cn("w-7 h-6 rounded text-[11px] font-bold transition-colors",
                                isWinner ? "bg-pitch-500 text-white" : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"
                              )}>W</button>
                          </span>
                        )}
                        {showPickers && (
                          <span className="flex justify-center">
                            <button onClick={() => handleAdvancer(letter, team.code)} disabled={isLocked || isWinner || advFull}
                              className={cn("w-7 h-6 rounded text-[11px] font-bold transition-colors",
                                isWinner ? "bg-emerald-100 text-emerald-400 cursor-default" :
                                isAdvancer ? "bg-emerald-500 text-white" :
                                advFull ? "bg-neutral-50 text-neutral-200 cursor-not-allowed" :
                                "bg-neutral-100 text-neutral-400 hover:bg-neutral-200"
                              )}>Q</button>
                          </span>
                        )}
                      </div>
                    );
                  }

                  // Regular row (no standings data)
                  return (
                    <div key={team.code} className={cn("flex items-center gap-3 px-4 py-4", rowBg)}>
                      {place != null && (
                        <span className="text-xs font-bold text-neutral-400 w-4 text-center shrink-0">{place}</span>
                      )}
                      <Flag code={team.code} size="sm" />
                      <span className={cn(
                        "text-sm font-medium flex-1 truncate",
                        resolution
                          ? isActualWinner ? "text-amber-800" : isActualQualifier ? "text-emerald-800" : "text-neutral-500"
                          : isWinner ? "text-amber-800" : isAdvancer ? "text-emerald-800" : "text-neutral-700"
                      )}>{team.name}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex flex-col items-center gap-1">
                          {winPts != null && (
                            <span className="text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded bg-pitch-50 text-pitch-900 leading-none">+{winPts.toFixed(1)}</span>
                          )}
                          <button onClick={() => handleWinner(letter, team.code)} disabled={isLocked}
                            className={cn("w-8 h-7 rounded text-xs font-bold transition-colors",
                              wCorrect ? "bg-emerald-500 text-white" : wWrong ? "bg-red-400 text-white" :
                              isWinner ? "bg-pitch-500 text-white" : "bg-neutral-100 text-neutral-400",
                              !isLocked && !resolution && "hover:bg-neutral-200", isLocked && "cursor-default"
                            )}>W</button>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          {qualPts != null && (
                            <span className="text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 leading-none">+{qualPts.toFixed(1)}</span>
                          )}
                          <button onClick={() => handleAdvancer(letter, team.code)} disabled={isLocked || isWinner || advFull}
                            className={cn("w-8 h-7 rounded text-xs font-bold transition-colors",
                              qCorrect ? "bg-emerald-500 text-white" : qWrong ? "bg-red-400 text-white" :
                              isWinner ? "bg-emerald-100 text-emerald-400 cursor-default" :
                              isAdvancer ? "bg-emerald-500 text-white" :
                              advFull ? "bg-neutral-50 text-neutral-200 cursor-not-allowed" : "bg-neutral-100 text-neutral-400",
                              !isLocked && !resolution && "hover:bg-neutral-200", isLocked && "cursor-default"
                            )}>Q</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* W/Q picks summary shown below standings table */}
              {standings && (() => {
                const pickedTeams = sortedTeams.filter(t => picks[letter]?.includes(t.code));
                return (
                  <div className="border-t border-neutral-100 bg-neutral-50 flex flex-col gap-2" style={{ padding: "10px" }}>
                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Your predictions</span>
                    {pickedTeams.length === 0 && (
                      <span className="text-xs text-neutral-400">No picks for this group</span>
                    )}
                    {pickedTeams.map((team) => {
                      const isWinner = team.code === winner;
                      const isAdvancer = advancers.has(team.code);
                      const isActualWinner = actualWinner === team.code;
                      const isActualQualifier = actualAdvancing?.includes(team.code) ?? false;
                      const winPts = pointsByTeam?.[team.code];
                      const qualPts = qualifierPointsByTeam?.[team.code];

                      // Determine which badge to show:
                      // - Picked as winner + actually won → W points only
                      // - Picked as winner + only qualified → Q points (downgrade)
                      // - Picked as winner + eliminated → W ✗
                      // - Picked as qualifier (not winner) + qualified → Q points
                      // - Picked as qualifier (not winner) + eliminated → Q ✗
                      let badge: React.ReactNode;
                      if (isWinner) {
                        if (resolution) {
                          if (isActualWinner) {
                            badge = <span className="font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">W {winPts != null ? `+${winPts.toFixed(1)}` : "✓"}</span>;
                          } else if (isActualQualifier) {
                            badge = <span className="font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">W (Q {qualPts != null ? `+${qualPts.toFixed(1)}` : "✓"})</span>;
                          } else {
                            badge = <span className="font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600">W ✗</span>;
                          }
                        } else {
                          badge = <span className="font-bold px-1.5 py-0.5 rounded bg-pitch-50 text-pitch-900">W {winPts != null ? `+${winPts.toFixed(1)}` : ""}</span>;
                        }
                      } else if (isAdvancer) {
                        if (resolution) {
                          if (isActualQualifier) {
                            badge = <span className="font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Q {qualPts != null ? `+${qualPts.toFixed(1)}` : "✓"}</span>;
                          } else {
                            badge = <span className="font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600">Q ✗</span>;
                          }
                        } else {
                          badge = <span className="font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Q {qualPts != null ? `+${qualPts.toFixed(1)}` : ""}</span>;
                        }
                      }

                      return (
                        <div key={team.code} className="flex items-center gap-2 text-xs">
                          <Flag code={team.code} size="sm" />
                          <span className="text-neutral-700 font-medium flex-1">{team.name}</span>
                          {badge}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SemifinalistsPicker ──────────────────────────────────────────────────────

interface SemifinalistsPickerProps {
  groupId: string;
  tournamentId: string;
  betTypeId: string;
  description?: string | null;
  isLocked: boolean;
  teams: Team[];
  tournamentKind: string;
  currentPrediction?: { teams?: string[] };
  pointsByTeam?: Record<string, number>;
  resolution?: { teams?: string[] };
}

export function SemifinalistsPicker({
  groupId,
  tournamentId,
  betTypeId,
  isLocked,
  teams,
  tournamentKind,
  currentPrediction,
  pointsByTeam,
  resolution,
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
      if (next.size >= 4) return;
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

  const actualSemis = resolution?.teams ? new Set(resolution.teams) : null;
  const isResolved = actualSemis !== null;

  const sorted = [...teams].sort((a, b) =>
    pointsByTeam
      ? (pointsByTeam[b.code] ?? 0) - (pointsByTeam[a.code] ?? 0)
      : a.name.localeCompare(b.name)
  );

  const correctCount = isResolved
    ? [...picks].filter((code) => actualSemis!.has(code)).length
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs">
        {isResolved ? (
          <span className={cn("font-medium", (correctCount ?? 0) > 0 ? "text-emerald-600" : "text-neutral-500")}>
            {correctCount}/4 correct
          </span>
        ) : (
          <span className={picks.size < 4 ? "text-pitch-700 font-medium" : "text-emerald-600 font-medium"}>
            {picks.size}/4 selected
          </span>
        )}
        {saving && <span className="text-neutral-400">Saving…</span>}
        {saved && picks.size === 4 && !isResolved && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="w-3 h-3" /> Saved
          </span>
        )}
        {error && <span className="text-red-500">{error}</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {sorted.map((t) => {
          const isSelected = picks.has(t.code);
          const isDisabled = isLocked || (picks.size >= 4 && !isSelected);
          const pts = pointsByTeam?.[t.code];

          const isActualSemi = actualSemis?.has(t.code) ?? false;
          const isWrongPick = isResolved && isSelected && !isActualSemi;
          const isCorrectPick = isResolved && isSelected && isActualSemi;

          return (
            <button
              key={t.code}
              onClick={() => handleToggle(t.code)}
              disabled={isDisabled}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors",
                isCorrectPick
                  ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                  : isWrongPick
                  ? "border-neutral-200 bg-white text-neutral-400"
                  : isSelected
                  ? "border-amber-400 bg-pitch-50 text-amber-800"
                  : isDisabled
                  ? "border-neutral-100 text-neutral-300 cursor-not-allowed bg-white"
                  : "border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 bg-white"
              )}
            >
              <TeamBadge code={t.code} tournamentKind={tournamentKind} size="sm" />
              <span className="flex-1 truncate text-left">{t.name}</span>
              {isCorrectPick && pts != null && (
                <span className="text-[11px] tabular-nums font-bold text-white bg-emerald-500 rounded px-1.5 py-0.5 shrink-0">
                  +{pts.toFixed(1)}
                </span>
              )}
              {isWrongPick && (
                <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-red-400 text-white leading-none shrink-0">
                  ✗
                </span>
              )}
              {!isResolved && pts != null && (
                <span
                  className={cn(
                    "text-[11px] tabular-nums font-medium shrink-0",
                    isSelected ? "text-amber-700" : isDisabled ? "text-neutral-300" : "text-neutral-400"
                  )}
                >
                  +{pts.toFixed(1)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
