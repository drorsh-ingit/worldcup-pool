"use client";

import { useState } from "react";
import { CheckCircle, Clock } from "lucide-react";
import { enterMatchResult } from "@/lib/actions/results";

interface MatchRow {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamCode: string;
  awayTeamCode: string;
  groupLetter: string | null;
  phase: string;
  matchday: number;
  kickoffAt: Date;
  status: "UPCOMING" | "LOCKED" | "COMPLETED";
  actualHomeScore: number | null;
  actualAwayScore: number | null;
}

function MatchRow({ groupId, match }: { groupId: string; match: MatchRow }) {
  const [home, setHome] = useState(match.actualHomeScore?.toString() ?? "");
  const [away, setAway] = useState(match.actualAwayScore?.toString() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(match.status === "COMPLETED");

  async function handleSave() {
    const homeScore = parseInt(home);
    const awayScore = parseInt(away);
    if (isNaN(homeScore) || isNaN(awayScore)) {
      setError("Enter valid scores");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await enterMatchResult(groupId, { matchId: match.id, homeScore, awayScore });
      if (result.error) {
        setError(result.error);
      } else {
        setSaved(true);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const kickoff = new Date(match.kickoffAt);
  const dateStr = kickoff.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeStr = kickoff.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className={`px-4 py-3 border-b border-neutral-50 last:border-0 ${saved ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Date */}
        <div className="w-20 shrink-0 text-xs text-neutral-400">
          <p>{dateStr}</p>
          <p>{timeStr}</p>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-medium text-neutral-900">{match.homeTeamCode}</span>
          <span className="text-xs text-neutral-400">vs</span>
          <span className="text-sm font-medium text-neutral-900">{match.awayTeamCode}</span>
          {match.groupLetter && (
            <span className="text-xs text-neutral-400 ml-1">Grp {match.groupLetter}</span>
          )}
        </div>

        {/* Score entry */}
        {saved ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold tabular-nums">{match.actualHomeScore}</span>
            <span className="text-neutral-400">–</span>
            <span className="font-semibold tabular-nums">{match.actualAwayScore}</span>
            <CheckCircle className="w-4 h-4 text-emerald-500 ml-1" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={30}
              value={home}
              onChange={(e) => { setHome(e.target.value); setSaved(false); }}
              className="w-12 h-8 px-2 rounded-lg border border-neutral-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-200"
              placeholder="0"
            />
            <span className="text-neutral-400 text-sm">–</span>
            <input
              type="number"
              min={0}
              max={30}
              value={away}
              onChange={(e) => { setAway(e.target.value); setSaved(false); }}
              className="w-12 h-8 px-2 rounded-lg border border-neutral-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-200"
              placeholder="0"
            />
            <button
              onClick={handleSave}
              disabled={loading || !home || !away}
              className="h-8 px-3 rounded-lg bg-pitch-500 text-white text-sm font-medium hover:bg-pitch-700 disabled:opacity-60 transition-colors"
            >
              {loading ? "..." : "Save"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-1 ml-24">{error}</p>}
    </div>
  );
}

export function MatchResultForm({
  groupId,
  matches,
}: {
  groupId: string;
  matches: MatchRow[];
}) {
  const upcoming = matches.filter((m) => m.status !== "COMPLETED");
  const completed = matches.filter((m) => m.status === "COMPLETED");
  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <div className="space-y-3">
      {upcoming.length === 0 && (
        <p className="text-sm text-neutral-400 py-4 text-center">
          No upcoming matches. Advance tournament status first.
        </p>
      )}
      {upcoming.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-neutral-100 bg-neutral-50 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
              Upcoming / Enter results
            </p>
          </div>
          {upcoming.map((m) => (
            <MatchRow key={m.id} groupId={groupId} match={m} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            {showCompleted ? "Hide" : "Show"} {completed.length} completed results
          </button>
          {showCompleted && (
            <div className="mt-2 rounded-xl border border-neutral-200 bg-white overflow-hidden">
              {completed.map((m) => (
                <MatchRow key={m.id} groupId={groupId} match={m} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
