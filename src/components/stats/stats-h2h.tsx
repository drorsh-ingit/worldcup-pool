"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CellResult, GroupStatsData, StatsCell, StatsMatchRow } from "@/lib/group-stats";
import { RESULT_CLASSES, scoreResult } from "./result-color";
import { useLiveScore } from "./live-scores-context";
import { useLiveMatchDelta } from "@/components/live-deltas-context";

function SidePick({ m, cell, userId }: { m: StatsMatchRow; cell: StatsCell; userId: string }) {
  const provisionalPts = useLiveMatchDelta(m.id, userId);
  const live = useLiveScore(m.id);
  const isLive = !m.completed && cell.homeScore != null && !!live && live.home != null;

  return (
    <div className="flex flex-col items-center" style={{ gap: 3 }}>
      <PredChip matchId={m.id} completed={m.completed} result={cell.result} h={cell.homeScore} a={cell.awayScore} />
      {m.completed && cell.points != null && (
        <span
          className={cn(
            "text-[11px] font-semibold tabular-nums leading-none",
            cell.points > 0 ? "text-pitch-700" : "text-neutral-400"
          )}
        >
          {cell.points.toFixed(1)} pts
        </span>
      )}
      {isLive && (
        <span className="text-[11px] font-semibold tabular-nums leading-none text-amber-600 stats-live-flicker">
          {provisionalPts > 0 ? `${provisionalPts.toFixed(1)} pts` : "—"}
        </span>
      )}
    </div>
  );
}

function PredChip({
  matchId,
  completed,
  result,
  h,
  a,
}: {
  matchId: string;
  completed: boolean;
  result: CellResult;
  h: number | null;
  a: number | null;
}) {
  const live = useLiveScore(matchId);
  const isLive = !completed && h != null && !!live && live.home != null && live.away != null;
  const shown: CellResult = completed
    ? result
    : h == null
    ? "none"
    : isLive
    ? scoreResult(h, a!, live!.home!, live!.away!)
    : "pending";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg border text-sm font-semibold tabular-nums",
        RESULT_CLASSES[shown],
        isLive && "stats-live-flicker"
      )}
      style={{ minWidth: 48, height: 32, paddingLeft: 8, paddingRight: 8 }}
      title={isLive ? `Live ${live!.home}–${live!.away} · provisional` : undefined}
    >
      {h != null ? `${h}–${a}` : "–"}
    </span>
  );
}

export function StatsH2H({ data }: { data: GroupStatsData }) {
  const others = data.members.filter((m) => !m.isSelf);
  const [otherId, setOtherId] = useState<string>(others[0]?.userId ?? "");

  if (others.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white text-center text-sm text-neutral-400" style={{ padding: "32px 20px" }}>
        No one else to compare with yet.
      </div>
    );
  }

  const self = data.summaryByUser[data.selfId];
  const other = data.summaryByUser[otherId];
  const otherName = data.members.find((m) => m.userId === otherId)?.name ?? "";

  // Only matches where at least one of the two predicted.
  const rows = data.matches.filter(
    (m) => m.cells[data.selfId]?.homeScore != null || m.cells[otherId]?.homeScore != null
  );

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Opponent picker */}
      <label className="relative block">
        <span className="text-xs font-medium text-neutral-500">Compare with</span>
        <div className="relative" style={{ marginTop: 6 }}>
          <select
            value={otherId}
            onChange={(e) => setOtherId(e.target.value)}
            className="w-full appearance-none rounded-xl border border-neutral-200 bg-white text-sm font-medium text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            style={{ height: 44, paddingLeft: 14, paddingRight: 36 }}
          >
            {others.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </label>

      {/* Tally */}
      <div className="grid grid-cols-2" style={{ gap: 10 }}>
        <TallyCard title="You" s={self} highlight />
        <TallyCard title={otherName} s={other} />
      </div>

      {/* Match-by-match */}
      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <div className="grid items-center border-b border-neutral-100 bg-neutral-50 text-xs font-semibold text-neutral-500" style={{ gridTemplateColumns: "1fr auto auto", padding: "8px 14px", gap: 10 }}>
          <span>Match</span>
          <span style={{ minWidth: 48, textAlign: "center" }}>You</span>
          <span style={{ minWidth: 48, textAlign: "center" }}>{otherName.split(/\s+/)[0]}</span>
        </div>
        <ul className="divide-y divide-neutral-100">
          {rows.map((m) => {
            const mine = m.cells[data.selfId];
            const theirs = m.cells[otherId];
            return (
              <li key={m.id} className="grid items-center" style={{ gridTemplateColumns: "1fr auto auto", padding: "10px 14px", gap: 10 }}>
                <div className="min-w-0">
                  <div className="flex items-center text-sm font-semibold text-neutral-800 tabular-nums" style={{ gap: 5 }}>
                    <span>{m.homeTeamCode}</span>
                    {m.completed ? (
                      <span className="font-bold">{m.actualHomeScore}–{m.actualAwayScore}</span>
                    ) : (
                      <span className="text-neutral-300">v</span>
                    )}
                    <span>{m.awayTeamCode}</span>
                  </div>
                  {!m.completed && (
                    <span className="inline-flex items-center text-[11px] font-medium text-red-500" style={{ gap: 4 }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      In play
                    </span>
                  )}
                </div>
                <SidePick m={m} cell={mine} userId={data.selfId} />
                <SidePick m={m} cell={theirs} userId={otherId} />
              </li>
            );
          })}
        </ul>
        {rows.length === 0 && (
          <div className="text-center text-sm text-neutral-400" style={{ padding: "28px 16px" }}>
            No overlapping predictions yet.
          </div>
        )}
      </div>
    </div>
  );
}

function TallyCard({ title, s, highlight }: { title: string; s: { exact: number; winner: number; wrong: number; points: number }; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border", highlight ? "border-amber-200 bg-amber-50/50" : "border-neutral-200 bg-white")} style={{ padding: "12px 14px" }}>
      <div className="flex items-baseline justify-between" style={{ gap: 8, marginBottom: 8 }}>
        <span className="text-sm font-semibold text-neutral-800 truncate">{title}</span>
        <span className="shrink-0 text-base font-black tabular-nums text-neutral-900 leading-none">
          {s.points.toFixed(1)}<span className="text-[11px] font-semibold text-neutral-400" style={{ marginLeft: 2 }}>pts</span>
        </span>
      </div>
      <div className="flex items-center" style={{ gap: 12 }}>
        <Stat n={s.exact} cls="text-emerald-600" label="exact" />
        <Stat n={s.winner} cls="text-amber-600" label="win" />
        <Stat n={s.wrong} cls="text-red-500" label="wrong" />
      </div>
    </div>
  );
}

function Stat({ n, cls, label }: { n: number; cls: string; label: string }) {
  return (
    <div className="flex flex-col items-center" style={{ gap: 1 }}>
      <span className={cn("text-lg font-black tabular-nums leading-none", cls)}>{n}</span>
      <span className="text-[10px] text-neutral-400">{label}</span>
    </div>
  );
}
