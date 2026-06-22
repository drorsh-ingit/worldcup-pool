"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import type { StandingsTrend } from "@/lib/group-stats";

// Muted, distinct line colors for non-self members. Self is always amber-500.
const PALETTE = ["#0284c7", "#059669", "#e11d48", "#7c3aed", "#0d9488", "#d97706", "#db2777", "#475569"];
const SELF_COLOR = "#f59e0b";

const W = 720;
const H = 300;
const PAD = { top: 16, right: 16, bottom: 28, left: 36 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function colorFor(index: number, isSelf: boolean): string {
  return isSelf ? SELF_COLOR : PALETTE[index % PALETTE.length];
}

/** Format a YYYY-MM-DD key as a short "12 Jun" label. */
function shortDate(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Ordinal suffix for a place number: 1 → "st", 2 → "nd", 3 → "rd", else "th". */
function ordinalSuffix(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

export function StandingsTrendChart({ trend }: { trend: StandingsTrend }) {
  const [active, setActive] = useState<string | null>(null);

  if (trend.dates.length < 2) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white" style={{ padding: 20 }}>
        <Header />
        <p className="text-sm text-neutral-500" style={{ marginTop: 12 }}>
          The trend appears once there are at least two daily standings snapshots. Snapshots are
          recorded each time the daily analysis is saved.
        </p>
      </section>
    );
  }

  const n = trend.dates.length;
  const maxRank = Math.max(2, trend.maxRank);

  const x = (i: number) => PAD.left + (n === 1 ? PLOT_W / 2 : (PLOT_W * i) / (n - 1));
  // Inverted: place 1 (best) sits at the top, maxRank at the bottom.
  const y = (rank: number) => PAD.top + (PLOT_H * (rank - 1)) / (maxRank - 1);

  // One gridline/label per integer place, thinned if there are many members.
  const rankEvery = Math.max(1, Math.ceil(maxRank / 10));
  const yTicks: number[] = [];
  for (let r = 1; r <= maxRank; r += rankEvery) yTicks.push(r);
  if (yTicks[yTicks.length - 1] !== maxRank) yTicks.push(maxRank);

  // X labels: thin to ~6 to avoid crowding.
  const labelEvery = Math.max(1, Math.ceil(n / 6));

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white" style={{ padding: 20 }}>
      <Header />

      <div style={{ marginTop: 16, width: "100%" }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Standings place over time" style={{ display: "block" }}>
          {/* Y grid + labels */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} y1={y(v)} x2={W - PAD.right} y2={y(v)} stroke="#f1f1f1" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#a3a3a3">
                {v}
                <tspan dx={1}>{ordinalSuffix(v)}</tspan>
              </text>
            </g>
          ))}

          {/* X labels */}
          {trend.dates.map((d, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#a3a3a3">
                {shortDate(d)}
              </text>
            ) : null
          )}

          {/* Lines */}
          {trend.series.map((s, idx) => {
            const color = colorFor(idx, s.isSelf);
            const dimmed = active != null && active !== s.userId;
            const pts = s.ranks
              .map((r, i) => (r == null ? null : `${x(i)},${y(r)}`))
              .filter((p): p is string => p != null);
            if (pts.length === 0) return null;
            return (
              <polyline
                key={s.userId}
                points={pts.join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={s.isSelf ? 3 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={dimmed ? 0.15 : 1}
                style={{ transition: "opacity 150ms" }}
              />
            );
          })}

          {/* End dots for emphasis */}
          {trend.series.map((s, idx) => {
            const color = colorFor(idx, s.isSelf);
            const dimmed = active != null && active !== s.userId;
            let lastI = -1;
            for (let i = s.ranks.length - 1; i >= 0; i--) if (s.ranks[i] != null) { lastI = i; break; }
            if (lastI < 0) return null;
            return (
              <circle
                key={s.userId}
                cx={x(lastI)}
                cy={y(s.ranks[lastI]!)}
                r={s.isSelf ? 4 : 3}
                fill={color}
                opacity={dimmed ? 0.15 : 1}
                style={{ transition: "opacity 150ms" }}
              />
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap" style={{ gap: 10, marginTop: 12 }}>
        {trend.series.map((s, idx) => {
          const color = colorFor(idx, s.isSelf);
          const dimmed = active != null && active !== s.userId;
          return (
            <button
              key={s.userId}
              onMouseEnter={() => setActive(s.userId)}
              onMouseLeave={() => setActive(null)}
              className="flex items-center rounded-full border border-neutral-200 hover:bg-neutral-50 transition-colors"
              style={{ gap: 6, padding: "3px 10px", opacity: dimmed ? 0.4 : 1 }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 9999, background: color, display: "inline-block" }} />
              <span className={`text-xs ${s.isSelf ? "font-semibold text-neutral-900" : "text-neutral-600"}`}>
                {s.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      <div className="inline-flex items-center justify-center rounded-xl bg-amber-50" style={{ width: 32, height: 32 }}>
        <TrendingUp className="w-4 h-4 text-amber-600" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-neutral-900 leading-tight">Standings trend</h2>
        <p className="text-xs text-neutral-500 leading-tight">Each member&apos;s place over time</p>
      </div>
    </div>
  );
}
