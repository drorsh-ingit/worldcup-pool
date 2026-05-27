"use client";

import { useState } from "react";
import { CheckCircle, Lock, Circle, ChevronDown, ChevronUp } from "lucide-react";
import { openBetType, lockBetType, reopenBetType, resolveBetType, updateBetTypeOpenTrigger } from "@/lib/actions/bet-types";
import { BET_OPEN_TRIGGERS, BET_OPEN_TRIGGER_LABELS, type BetOpenTrigger } from "@/lib/data/wc2026";

interface BetTypeRow {
  id: string;
  name: string;
  subType: string;
  description?: string | null;
  status: "DRAFT" | "OPEN" | "LOCKED" | "RESOLVED";
  category: string;
  openTrigger: BetOpenTrigger | null;
  opensAt: Date | null;
  locksAt: Date | null;
}

function statusBadge(status: BetTypeRow["status"]) {
  const map = {
    DRAFT: "bg-neutral-100 text-neutral-500",
    OPEN: "bg-emerald-50 text-emerald-600",
    LOCKED: "bg-pitch-50 text-pitch-700",
    RESOLVED: "bg-neutral-100 text-neutral-400",
  };
  return `text-xs rounded-full font-medium ${map[status]}`;
}

function ResolutionForm({
  groupId,
  betType,
  onDone,
}: {
  groupId: string;
  betType: BetTypeRow;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState("");

  async function handleResolve() {
    setLoading(true);
    setError(null);
    try {
      let resolution: Record<string, unknown> = {};

      if (["winner", "runner_up", "dark_horse"].includes(betType.subType)) {
        resolution = { teamCode: value.toUpperCase().trim() };
      } else if (["golden_boot", "golden_glove"].includes(betType.subType)) {
        const [name, code] = value.split(",").map((s) => s.trim());
        resolution = { playerName: name, teamCode: code?.toUpperCase() };
      } else if (["golden_ball"].includes(betType.subType)) {
        const [name, code] = value.split(",").map((s) => s.trim());
        resolution = { playerName: name, teamCode: code?.toUpperCase() };
      } else if (betType.subType === "group_predictions") {
        // Format: "A:FRA,B:USA,C:POR,..." (winners) — advancing is auto-computed
        const pairs = value.split(",").map((s) => s.trim());
        const winners = Object.fromEntries(pairs.map((p) => p.split(":").map((s) => s.trim())));
        // For manual resolution, admin enters winners; advancing would need separate input
        // but typically this is auto-resolved by simulation
        resolution = { winners, advancing: [] };
      } else if (betType.subType === "semifinalists") {
        const teams = value.split(",").map((s) => s.trim().toUpperCase());
        resolution = { teams };
      } else {
        resolution = { option: value.trim() };
      }

      const result = await resolveBetType(groupId, betType.id, resolution);
      if ("error" in result) {
        setError(result.error as string);
      } else {
        onDone();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function placeholder() {
    if (["winner", "runner_up", "dark_horse"].includes(betType.subType)) return "Team code (e.g. BRA)";
    if (["golden_boot", "golden_glove", "golden_ball"].includes(betType.subType)) return "Player name, TEAM (e.g. Mbappe, FRA)";
    if (betType.subType === "group_predictions") return "A:FRA,B:USA,C:POR,... (group winners)";
    if (betType.subType === "semifinalists") return "FRA,ENG,BRA,ARG";
    return "Answer / option";
  }

  return (
    <div className="border-t border-neutral-100" style={{ marginTop: 12, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <p className="text-xs text-neutral-500 font-medium uppercase tracking-wider">Enter resolution</p>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder()}
        className="w-full h-9 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white"
        style={{ padding: "0 12px" }}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex" style={{ gap: 8 }}>
        <button
          onClick={handleResolve}
          disabled={loading || !value.trim()}
          className="h-8 rounded-lg bg-pitch-500 text-white text-sm font-medium hover:bg-pitch-700 disabled:opacity-60 transition-colors"
          style={{ padding: "0 12px" }}
        >
          {loading ? "Resolving..." : "Resolve"}
        </button>
        <button
          onClick={onDone}
          className="h-8 rounded-lg border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
          style={{ padding: "0 12px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function BetTypeRow({
  groupId,
  betType,
}: {
  groupId: string;
  betType: BetTypeRow;
}) {
  const [loading, setLoading] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  async function handleOpen() {
    setLoading(true);
    try { await openBetType(groupId, betType.id); } finally { setLoading(false); }
  }

  async function handleLock() {
    setLoading(true);
    try { await lockBetType(groupId, betType.id); } finally { setLoading(false); }
  }

  async function handleReopen() {
    setLoading(true);
    try { await reopenBetType(groupId, betType.id); } finally { setLoading(false); }
  }

  async function handleTriggerChange(next: BetOpenTrigger) {
    setLoading(true);
    setTriggerError(null);
    try {
      const result = await updateBetTypeOpenTrigger(groupId, betType.id, next);
      if ("error" in result) setTriggerError(result.error as string);
    } finally {
      setLoading(false);
    }
  }

  const showTriggerDropdown =
    betType.category === "TOURNAMENT" && betType.status === "DRAFT";

  return (
    <div className="border-b border-neutral-50 last:border-0" style={{ padding: "12px 16px" }}>
      <div className="flex items-start justify-between" style={{ gap: 12 }}>
        <div className="flex items-center min-w-0" style={{ gap: 10 }}>
          <div className="shrink-0" style={{ marginTop: 2 }}>
            {betType.status === "RESOLVED" ? (
              <CheckCircle className="w-4 h-4 text-emerald-500" />
            ) : betType.status === "LOCKED" ? (
              <Lock className="w-4 h-4 text-amber-400" />
            ) : (
              <Circle className="w-4 h-4 text-neutral-300" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">{betType.name}</p>
            {betType.description
              ? <p className="text-xs text-neutral-400 leading-relaxed">{betType.description}</p>
              : <p className="text-xs text-neutral-400">{betType.subType}</p>
            }
          </div>
        </div>
        <div className="flex items-center shrink-0" style={{ gap: 8 }}>
          <span className={statusBadge(betType.status)} style={{ padding: "2px 8px" }}>{betType.status}</span>
          {betType.status === "DRAFT" && (
            <button
              onClick={handleOpen}
              disabled={loading}
              className="h-7 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-60 transition-colors"
              style={{ padding: "0 10px" }}
            >
              Open
            </button>
          )}
          {betType.status === "OPEN" && (
            <button
              onClick={handleLock}
              disabled={loading}
              className="h-7 rounded-lg bg-pitch-50 text-pitch-900 text-xs font-medium hover:bg-pitch-50 disabled:opacity-60 transition-colors"
              style={{ padding: "0 10px" }}
            >
              Lock
            </button>
          )}
          {betType.status === "LOCKED" && (
            <>
              <button
                onClick={handleReopen}
                disabled={loading}
                className="h-7 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 disabled:opacity-60 transition-colors"
                style={{ padding: "0 10px" }}
              >
                Reopen
              </button>
              <button
                onClick={() => setShowResolve((v) => !v)}
                className="h-7 rounded-lg bg-neutral-100 text-neutral-700 text-xs font-medium hover:bg-neutral-200 transition-colors flex items-center"
                style={{ padding: "0 10px", gap: 4 }}
              >
                Resolve
                {showResolve ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </>
          )}
        </div>
      </div>
      {showTriggerDropdown && (
        <div style={{ marginTop: 8, paddingLeft: 26 }}>
          <select
            value={betType.openTrigger ?? "PRE_TOURNAMENT"}
            onChange={(e) => handleTriggerChange(e.target.value as BetOpenTrigger)}
            disabled={loading}
            className="h-7 rounded-lg border border-neutral-200 bg-white text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:opacity-60 w-full max-w-xs"
            style={{ padding: "0 8px" }}
            title="When this bet opens"
          >
            {BET_OPEN_TRIGGERS.map((t) => (
              <option key={t} value={t}>
                Opens: {BET_OPEN_TRIGGER_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      )}
      {triggerError && (
        <p className="text-xs text-red-500" style={{ marginTop: 4 }}>{triggerError}</p>
      )}
      {showResolve && (
        <ResolutionForm
          groupId={groupId}
          betType={betType}
          onDone={() => setShowResolve(false)}
        />
      )}
    </div>
  );
}

export function BetTypeControls({
  groupId,
  betTypes,
}: {
  groupId: string;
  betTypes: BetTypeRow[];
}) {
  // Canonical display order for tournament bets — matches the bets page.
  const TOURNAMENT_BET_ORDER = [
    "winner",
    "runner_up",
    "golden_boot",
    "dark_horse",
    "reverse_dark_horse",
    "group_predictions",
    "bracket",
    "golden_ball",
    "golden_glove",
    "semifinalists",
  ];
  const tournamentRank = (subType: string) => {
    const i = TOURNAMENT_BET_ORDER.indexOf(subType);
    return i === -1 ? TOURNAMENT_BET_ORDER.length : i;
  };

  const grouped = betTypes.reduce(
    (acc, bt) => {
      const key = bt.category;
      if (!acc[key]) acc[key] = [];
      acc[key].push(bt);
      return acc;
    },
    {} as Record<string, BetTypeRow[]>
  );
  if (grouped.TOURNAMENT) {
    grouped.TOURNAMENT.sort((a, b) => tournamentRank(a.subType) - tournamentRank(b.subType));
  }

  const categoryLabel: Record<string, string> = {
    TOURNAMENT: "Tournament",
    PER_GAME: "Per Game",
    CURATED: "Bonus Bets",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {Object.entries(grouped).map(([category, bts]) => (
        <div key={category} className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <div className="border-b border-neutral-100 bg-neutral-50" style={{ padding: "10px 16px" }}>
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              {categoryLabel[category] ?? category}
            </p>
          </div>
          {bts.map((bt) => (
            <BetTypeRow key={bt.id} groupId={groupId} betType={bt} />
          ))}
        </div>
      ))}
    </div>
  );
}
