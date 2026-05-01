"use client";

import { useState } from "react";
import { FlaskConical, RotateCcw, Play, CalendarClock } from "lucide-react";
import {
  activateSimulation,
  updateSimulationDate,
  resetSimulation,
} from "@/lib/actions/simulation";
import { GOLDEN_BOOT_CANDIDATES } from "@/lib/data/wc2026";

interface SimulationControlProps {
  groupId: string;
  simulationEnabled: boolean;
  simulatedDate: string | null;
  awards?: { goldenBoot?: string; goldenBall?: string; goldenGlove?: string };
}

export function SimulationControl({
  groupId,
  simulationEnabled,
  simulatedDate,
  awards: initialAwards,
}: SimulationControlProps) {
  const [date, setDate] = useState(simulatedDate ?? "2026-06-15T12:00");
  const [goldenBoot, setGoldenBoot] = useState(initialAwards?.goldenBoot ?? "");
  const [goldenBall, setGoldenBall] = useState(initialAwards?.goldenBall ?? "");
  const [goldenGlove, setGoldenGlove] = useState(initialAwards?.goldenGlove ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildAwards() {
    const a: { goldenBoot?: string; goldenBall?: string; goldenGlove?: string } = {};
    if (goldenBoot.trim()) a.goldenBoot = goldenBoot.trim();
    if (goldenBall.trim()) a.goldenBall = goldenBall.trim();
    if (goldenGlove.trim()) a.goldenGlove = goldenGlove.trim();
    return Object.keys(a).length ? a : undefined;
  }

  async function handleActivate() {
    setLoading(true);
    setError(null);
    const result = await activateSimulation(groupId, new Date(date).toISOString(), buildAwards());
    if ("error" in result) setError(result.error ?? null);
    setLoading(false);
  }

  async function handleUpdateDate() {
    setLoading(true);
    setError(null);
    const result = await updateSimulationDate(groupId, new Date(date).toISOString(), buildAwards());
    if ("error" in result) setError(result.error ?? null);
    setLoading(false);
  }

  async function handleReset() {
    setLoading(true);
    setError(null);
    const result = await resetSimulation(groupId);
    if ("error" in result) setError(result.error ?? null);
    setLoading(false);
  }

  return (
    <section className="p-4 rounded-xl border-2 border-dashed border-amber-300 bg-pitch-50/50 space-y-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-pitch-700" />
        <h2 className="text-sm font-semibold text-amber-900">Simulation Mode</h2>
        {simulationEnabled && (
          <span className="ml-auto text-xs font-medium text-pitch-900 bg-pitch-50 px-2 py-0.5 rounded-full">
            Active
          </span>
        )}
      </div>

      <p className="text-xs text-amber-800/70">
        Set a simulated date to auto-open bets and generate random match results.
        Match scores drive all outcomes — group standings, knockout bracket, dark horse bets, and so on.
        The date can only move <strong>forward</strong> — already-scored matches and bets are never recalculated. Use <strong>Reset</strong> to start over from a snapshot.
      </p>

      {/* Current simulated date */}
      {simulationEnabled && simulatedDate && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-amber-800/60 text-xs">Now:</span>
          <span className="font-medium text-amber-900">
            {new Date(simulatedDate).toLocaleString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit", timeZone: "UTC",
            })} UTC
          </span>
        </div>
      )}

      {/* Date picker */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 flex-1">
          <CalendarClock className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 h-9 px-3 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-amber-400"
            min={
              simulationEnabled && simulatedDate
                ? simulatedDate.slice(0, 16)
                : "2026-06-01T00:00"
            }
            max="2026-07-25T00:00"
          />
        </div>

        <div className="flex gap-2">
          {!simulationEnabled ? (
            <button
              onClick={handleActivate}
              disabled={loading}
              className="h-9 px-4 rounded-lg bg-pitch-500 text-white text-sm font-medium hover:bg-pitch-700 disabled:opacity-60 transition-colors flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {loading ? "Activating..." : "Activate"}
            </button>
          ) : (
            <>
              <button
                onClick={handleUpdateDate}
                disabled={loading}
                className="h-9 px-4 rounded-lg bg-pitch-500 text-white text-sm font-medium hover:bg-pitch-700 disabled:opacity-60 transition-colors flex items-center gap-1.5"
              >
                <CalendarClock className="w-3.5 h-3.5" />
                {loading ? "Updating..." : "Update Date"}
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="h-9 px-4 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-60 transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {loading ? "Resetting..." : "Reset"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Awards — can't derive from match scores */}
      <div className="pt-1 border-t border-amber-200/60 space-y-2">
        <p className="text-xs font-medium text-amber-900">Awards (optional)</p>
        <p className="text-xs text-amber-800/60">
          These can't be derived from match scores — set them to auto-resolve the award bets.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Golden Boot</label>
            <input
              list="golden-boot-list"
              value={goldenBoot}
              onChange={(e) => setGoldenBoot(e.target.value)}
              placeholder="Player name"
              className="w-full h-8 px-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-amber-400"
            />
            <datalist id="golden-boot-list">
              {GOLDEN_BOOT_CANDIDATES.map((c) => (
                <option key={c.playerName} value={c.playerName} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Golden Ball</label>
            <input
              value={goldenBall}
              onChange={(e) => setGoldenBall(e.target.value)}
              placeholder="Player name"
              className="w-full h-8 px-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-amber-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-neutral-500">Golden Glove</label>
            <input
              value={goldenGlove}
              onChange={(e) => setGoldenGlove(e.target.value)}
              placeholder="Goalkeeper name"
              className="w-full h-8 px-2 rounded-lg border border-neutral-200 bg-white text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-pitch-500/30 focus:border-amber-400"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
