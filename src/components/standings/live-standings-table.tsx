"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials, getAvatarColor, AVATAR_COLOR_OPTIONS, dicebearUrl } from "@/lib/avatar";
import { getLiveStandingsDeltas } from "@/lib/actions/standings-live";

export interface StandingRow {
  userId: string;
  name: string;
  avatarColor: number | null;
  avatarStyle: string | null;
  avatarSeed: string | null;
  realName: string | null;
  role: string;
  totalPoints: number;
  tournamentPts: number;
  perGamePts: number;
  curatedPts: number;
  correctBets: number;
  totalBets: number;
}

interface Props {
  groupId: string;
  currentUserId: string;
  baseStandings: StandingRow[];
}

const POLL_INTERVAL_MS = 60_000;

export function LiveStandingsTable({ groupId, currentUserId, baseStandings }: Props) {
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [inPlayCount, setInPlayCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await getLiveStandingsDeltas(groupId);
        if (cancelled) return;
        setDeltas(res.deltas);
        setInPlayCount(res.inPlayCount);
      } catch {
        // silent — keep stored standings as-is
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [groupId]);

  const merged = baseStandings
    .map((s) => ({ ...s, delta: deltas[s.userId] ?? 0 }))
    .sort((a, b) => b.totalPoints + b.delta - (a.totalPoints + a.delta));

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
      {inPlayCount > 0 && (
        <div
          className="flex items-center border-b border-amber-100 bg-amber-50 text-amber-800"
          style={{ gap: 8, paddingLeft: 20, paddingRight: 20, paddingTop: 10, paddingBottom: 10 }}
        >
          <Zap className="w-3.5 h-3.5" />
          <span className="text-xs font-semibold uppercase tracking-widest">Live</span>
          <span className="text-xs text-amber-700">
            {inPlayCount === 1 ? "1 match in play" : `${inPlayCount} matches in play`} — points update every minute
          </span>
        </div>
      )}

      {/* Column header */}
      <div
        className="hidden sm:grid grid-cols-[56px_1fr_80px_88px_80px_80px] border-b border-neutral-100 text-xs font-semibold text-neutral-400 uppercase tracking-widest"
        style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 14, paddingBottom: 14, gap: 8 }}
      >
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Matches</span>
        <span className="text-right">Tournament</span>
        <span className="text-right">Bonus</span>
        <span className="text-right">Total</span>
      </div>
      <div
        className="grid sm:hidden grid-cols-[56px_1fr_72px] border-b border-neutral-100 text-xs font-semibold text-neutral-400 uppercase tracking-widest"
        style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 14, paddingBottom: 14, gap: 8 }}
      >
        <span>#</span>
        <span>Player</span>
        <span className="text-right">Total</span>
      </div>

      {merged.map((s, i) => {
        const isMe = s.userId === currentUserId;
        const medals = [
          { outer: "#f59e0b", inner: "#fbbf24", text: "#78350f" },
          { outer: "#6b7280", inner: "#9ca3af", text: "#1f2937" },
          { outer: "#b45309", inner: "#d97706", text: "#78350f" },
        ];
        const medal = i < 3 ? medals[i] : null;

        const Row = (isMe ? "div" : Link) as React.ElementType;
        const rowProps = isMe ? {} : { href: `/group/${groupId}/user/${s.userId}` };

        return (
          <Row
            key={s.userId}
            {...rowProps}
            className={cn(
              "grid grid-cols-[56px_1fr_72px] sm:grid-cols-[56px_1fr_80px_88px_80px_80px] items-center border-b border-neutral-50 last:border-0 transition-colors",
              isMe ? "bg-emerald-50/60" : "hover:bg-neutral-50 cursor-pointer"
            )}
            style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 14, paddingBottom: 14, gap: 8 }}
          >
            {/* Rank badge */}
            <div className="flex items-center">
              {medal ? (
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="16" cy="16" r="16" fill={medal.outer} />
                  <circle cx="16" cy="16" r="12" fill={medal.inner} />
                  <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="900" fill={medal.text}>
                    {i + 1}
                  </text>
                </svg>
              ) : (
                <span className="text-sm font-medium text-neutral-400 tabular-nums w-7 text-center">{i + 1}</span>
              )}
            </div>

            {/* Avatar + name */}
            <div className="flex items-center min-w-0" style={{ gap: 10 }}>
              {(() => {
                const color =
                  s.avatarColor != null ? AVATAR_COLOR_OPTIONS[s.avatarColor] : getAvatarColor(s.userId);
                return (
                  <div
                    className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                    style={{ backgroundColor: color.bg }}
                  >
                    {s.avatarStyle ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={dicebearUrl(s.avatarStyle, s.avatarSeed ?? s.userId)}
                        alt=""
                        className="w-full h-full"
                      />
                    ) : (
                      <span style={{ color: color.text, fontSize: 11, fontWeight: "bold" }}>
                        {getInitials(s.realName ?? s.name)}
                      </span>
                    )}
                  </div>
                );
              })()}
              <span className="text-sm font-medium truncate text-neutral-900">
                {s.name}
                {isMe && <span className="text-neutral-400 font-normal"> (you)</span>}
              </span>
            </div>

            {/* Breakdown — desktop only */}
            <span className="hidden sm:block text-sm text-neutral-500 text-right tabular-nums">
              {s.perGamePts.toFixed(1)}
            </span>
            <span className="hidden sm:block text-sm text-neutral-500 text-right tabular-nums">
              {s.tournamentPts.toFixed(1)}
            </span>
            <span className="hidden sm:block text-sm text-neutral-500 text-right tabular-nums">
              {s.curatedPts.toFixed(1)}
            </span>

            {/* Total — merges live delta when in play */}
            <span className="flex flex-col items-end leading-tight">
              {inPlayCount > 0 ? (
                <>
                  <span className="text-sm font-bold tabular-nums text-amber-600 animate-pulse">
                    {(s.totalPoints + s.delta).toFixed(1)}
                  </span>
                  <span className="text-[11px] italic font-semibold tabular-nums text-amber-500 animate-pulse">
                    +{s.delta.toFixed(1)} live
                  </span>
                </>
              ) : (
                <span className={cn("text-sm font-bold tabular-nums", isMe ? "text-emerald-700" : "text-neutral-900")}>
                  {s.totalPoints.toFixed(1)}
                </span>
              )}
            </span>
          </Row>
        );
      })}
    </div>
  );
}
