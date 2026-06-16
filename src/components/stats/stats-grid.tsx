import { cn } from "@/lib/utils";
import type { GroupStatsData } from "@/lib/group-stats";
import { RESULT_CLASSES, RESULT_LABEL } from "./result-color";
import { StatsLiveCell } from "./stats-live-cell";

function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first.length > 10 ? first.slice(0, 10) : first;
}

export function StatsGrid({ data }: { data: GroupStatsData }) {
  const { members, matches } = data;

  if (matches.length === 0) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white text-center text-sm text-neutral-400" style={{ padding: "48px 24px" }}>
        No matches have kicked off yet — the grid fills in as matches start.
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <Legend />
      {/* Hug the table's content width (scroll if it ever exceeds the viewport)
          rather than stretching the box across the whole page. */}
      <div
        className="rounded-2xl border border-neutral-200 bg-white overflow-x-auto"
        style={{ width: "fit-content", maxWidth: "100%", alignSelf: "flex-start" }}
      >
        <table className="border-collapse" style={{ minWidth: "max-content" }}>
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 bg-neutral-50 border-b border-r border-neutral-200 text-left text-xs font-semibold text-neutral-500"
                style={{ padding: "10px 14px", minWidth: 132 }}
              >
                Match
              </th>
              {members.map((m) => (
                <th
                  key={m.userId}
                  className={cn(
                    "border-b border-neutral-200 text-xs font-semibold whitespace-nowrap",
                    m.isSelf ? "bg-amber-50 text-amber-800" : "bg-neutral-50 text-neutral-600"
                  )}
                  style={{ padding: "10px 12px", minWidth: 64 }}
                  title={m.name}
                >
                  {shortName(m.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white border-b border-r border-neutral-200 text-left"
                  style={{ padding: "8px 14px", minWidth: 132 }}
                >
                  <div className="flex items-center font-semibold text-sm text-neutral-800 tabular-nums" style={{ gap: 6 }}>
                    <span>{match.homeTeamCode}</span>
                    {match.completed ? (
                      <span className="text-neutral-900 font-bold">{match.actualHomeScore}–{match.actualAwayScore}</span>
                    ) : (
                      <span className="text-neutral-300">v</span>
                    )}
                    <span>{match.awayTeamCode}</span>
                  </div>
                  {!match.completed && (
                    <span className="inline-flex items-center text-[11px] font-medium text-red-500" style={{ gap: 4 }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      In play
                    </span>
                  )}
                </th>
                {members.map((m) => {
                  const cell = match.cells[m.userId];
                  const hasPred = cell.homeScore != null;
                  return (
                    <td
                      key={m.userId}
                      className="border-b border-neutral-100 text-center"
                      style={{ padding: 6 }}
                    >
                      {!match.completed && hasPred ? (
                        <StatsLiveCell matchId={match.id} predH={cell.homeScore!} predA={cell.awayScore!} userId={m.userId} />
                      ) : (
                        <div className="flex flex-col items-center" style={{ gap: 3 }}>
                          <span
                            className={cn(
                              "inline-flex items-center justify-center rounded-lg border text-sm font-semibold tabular-nums",
                              RESULT_CLASSES[cell.result]
                            )}
                            style={{ minWidth: 44, height: 30, paddingLeft: 8, paddingRight: 8 }}
                          >
                            {hasPred ? `${cell.homeScore}–${cell.awayScore}` : "–"}
                          </span>
                          {hasPred && cell.points != null && (
                            <span className={cn("text-[11px] font-semibold tabular-nums leading-none", cell.points > 0 ? "text-pitch-700" : "text-neutral-400")}>
                              {cell.points.toFixed(1)} pts
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center text-xs text-neutral-500" style={{ gap: 14 }}>
      {(["exact", "winner", "wrong"] as const).map((r) => (
        <span key={r} className="inline-flex items-center" style={{ gap: 6 }}>
          <span className={cn("inline-block rounded border", RESULT_CLASSES[r])} style={{ width: 14, height: 14 }} />
          {RESULT_LABEL[r]}
        </span>
      ))}
      <span className="inline-flex items-center" style={{ gap: 6 }}>
        <span className="stats-live-flicker inline-block rounded border border-neutral-300 bg-neutral-100" style={{ width: 14, height: 14 }} />
        Live (provisional)
      </span>
    </div>
  );
}
