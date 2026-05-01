"use client";

import { useState, useTransition } from "react";
import { CheckCircle, Trophy, Lock } from "lucide-react";
import { placeBet } from "@/lib/actions/bets";
import { TeamBadge } from "@/components/team-badge";
import { cn } from "@/lib/utils";

interface BracketTeam {
  code: string;
  name: string;
}

interface BracketMatch {
  id: string;
  homeTeam: BracketTeam;
  awayTeam: BracketTeam;
  phase: string;
  status: string;
  kickoffAt: Date | string;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
}

interface BracketPickerProps {
  groupId: string;
  tournamentId: string;
  betTypeId: string;
  isLocked: boolean;
  tournamentKind: string;
  matches: BracketMatch[];
  currentPrediction?: { picks?: Record<string, string> };
  resolution?: { winners?: Record<string, string> };
  pointsByPickKey?: Record<string, number>;
}

const PHASE_ORDER = ["R32", "R16", "QF", "SF", "FINAL"] as const;
type Phase = (typeof PHASE_ORDER)[number];

const PHASE_LABELS: Record<Phase, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-Finals",
  SF: "Semi-Finals",
  FINAL: "Final",
};
const PHASE_COUNTS: Record<Phase, number> = {
  R32: 16,
  R16: 8,
  QF: 4,
  SF: 2,
  FINAL: 1,
};
const PREV_PHASE: Record<Phase, Phase | null> = {
  R32: null,
  R16: "R32",
  QF: "R16",
  SF: "QF",
  FINAL: "SF",
};

interface Slot {
  key: string;
  phase: Phase;
  index: number;
  matchId?: string;
  homeTeam?: BracketTeam;
  awayTeam?: BracketTeam;
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  isReal: boolean;
}

function buildSlots(
  matches: BracketMatch[],
  picks: Record<string, string>,
  teamByCode: Record<string, BracketTeam>
): Record<string, Slot> {
  const slots: Record<string, Slot> = {};

  // R32 is the base round — slots always come from real matches so the user can see
  // who is actually playing before picking. R16 and beyond always derive from the
  // user's picks so the bracket always shows their prediction path, not reality.
  const r32Matches = matches
    .filter((m) => m.phase === "R32")
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

  for (const phase of PHASE_ORDER) {
    for (let i = 0; i < PHASE_COUNTS[phase]; i++) {
      const key = `${phase}-${i}`;

      if (phase === "R32") {
        const real = r32Matches[i];
        if (real) {
          slots[key] = {
            key, phase, index: i,
            matchId: real.id,
            homeTeam: real.homeTeam,
            awayTeam: real.awayTeam,
            status: real.status,
            homeScore: real.actualHomeScore,
            awayScore: real.actualAwayScore,
            isReal: true,
          };
        } else {
          slots[key] = { key, phase, index: i, isReal: false };
        }
      } else {
        // R16+ always derived from user's picks — bracket shows the prediction path
        const prev = PREV_PHASE[phase]!;
        const homeCode = picks[`${prev}-${i * 2}`];
        const awayCode = picks[`${prev}-${i * 2 + 1}`];
        slots[key] = {
          key, phase, index: i,
          homeTeam: homeCode ? teamByCode[homeCode] : undefined,
          awayTeam: awayCode ? teamByCode[awayCode] : undefined,
          isReal: false,
        };
      }
    }
  }

  return slots;
}

function getSlotTeams(slot: Slot): BracketTeam[] {
  return [slot.homeTeam, slot.awayTeam].filter(Boolean) as BracketTeam[];
}

const SLOT_KEY_RE = /^(R32|R16|QF|SF|FINAL)-\d+$/;

function cleanupPicks(
  picks: Record<string, string>,
  matches: BracketMatch[],
  teamByCode: Record<string, BracketTeam>,
  cascade = true
): Record<string, string> {
  // Drop any keys that aren't valid slot identifiers (e.g. legacy match-id keys
  // saved before the slot-based refactor).
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(picks)) {
    if (SLOT_KEY_RE.test(key)) cleaned[key] = value;
  }
  // When the bet is locked we skip the cascade validation so eliminated teams
  // remain visible in derived downstream slots — letting the user see their full
  // prediction path with ✓/✗ markers rather than seeing TBD everywhere.
  if (!cascade) return cleaned;
  for (const phase of ["R16", "QF", "SF", "FINAL"] as Phase[]) {
    const slots = buildSlots(matches, cleaned, teamByCode);
    for (let i = 0; i < PHASE_COUNTS[phase]; i++) {
      const key = `${phase}-${i}`;
      const pick = cleaned[key];
      if (!pick) continue;
      const slot = slots[key];
      const validCodes = getSlotTeams(slot).map((t) => t.code);
      if (!validCodes.includes(pick)) {
        delete cleaned[key];
      }
    }
  }
  return cleaned;
}

export function BracketPicker({
  groupId,
  tournamentId,
  betTypeId,
  isLocked,
  tournamentKind,
  matches,
  currentPrediction,
  resolution,
  pointsByPickKey,
}: BracketPickerProps) {
  const teamByCode: Record<string, BracketTeam> = {};
  for (const m of matches) {
    if (m.homeTeam) teamByCode[m.homeTeam.code] = m.homeTeam;
    if (m.awayTeam) teamByCode[m.awayTeam.code] = m.awayTeam;
  }

  const [picks, setPicks] = useState<Record<string, string>>(() =>
    cleanupPicks(currentPrediction?.picks ?? {}, matches, teamByCode, !isLocked)
  );
  const [saved, setSaved] = useState(
    !!currentPrediction?.picks && Object.keys(currentPrediction.picks).length > 0
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Effective winners: prefer match-derived (when COMPLETED) so the bracket lights up
  // ✓/✗ as games finish, falling back to admin-set resolution.winners.
  const actualWinners: Record<string, string> = {};
  for (const phase of PHASE_ORDER) {
    const phaseMatches = matches
      .filter((m) => m.phase === phase)
      .sort(
        (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()
      );
    phaseMatches.forEach((m, i) => {
      if (
        m.status === "COMPLETED" &&
        m.actualHomeScore != null &&
        m.actualAwayScore != null
      ) {
        actualWinners[`${phase}-${i}`] =
          m.actualHomeScore >= m.actualAwayScore
            ? m.homeTeam.code
            : m.awayTeam.code;
      }
    });
  }
  for (const [k, v] of Object.entries(resolution?.winners ?? {})) {
    if (!actualWinners[k]) actualWinners[k] = v;
  }

  const slots = buildSlots(matches, picks, teamByCode);

  // Any team that lost a resolved match is eliminated — used to show ✗ in downstream slots.
  const eliminatedSet = new Set<string>();
  for (const [slotKey, winnerCode] of Object.entries(actualWinners)) {
    const slot = slots[slotKey];
    for (const t of [slot?.homeTeam, slot?.awayTeam]) {
      if (t && t.code !== winnerCode) eliminatedSet.add(t.code);
    }
  }

  async function handlePick(slotKey: string, teamCode: string) {
    if (isLocked) return;
    const slot = slots[slotKey];
    if (!slot) return;
    const validCodes = getSlotTeams(slot).map((t) => t.code);
    if (!validCodes.includes(teamCode)) return;

    const current = picks[slotKey];
    let next = current === teamCode
      ? (() => { const n = { ...picks }; delete n[slotKey]; return n; })()
      : { ...picks, [slotKey]: teamCode };

    next = cleanupPicks(next, matches, teamByCode);
    setPicks(next);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const result = await placeBet(groupId, {
        tournamentId,
        betTypeId,
        prediction: { picks: next },
      });
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  const totalSlots = PHASE_ORDER.reduce((sum, p) => sum + PHASE_COUNTS[p], 0);
  const totalPicks = Object.keys(picks).length;
  const correctPicks = Object.entries(picks).filter(
    ([key, code]) => actualWinners[key] === code
  ).length;
  const totalResolved = Object.keys(actualWinners).length;

  const hasAnyMatches = matches.length > 0;

  if (isLocked && totalPicks === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-400 py-2">
        <Lock className="w-4 h-4" />
        No prediction entered
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Status row */}
      <div className="flex items-center gap-4 text-xs flex-wrap">
        {totalResolved > 0 ? (
          <span
            className={cn(
              "font-medium",
              correctPicks > 0 ? "text-emerald-600" : "text-neutral-500"
            )}
          >
            {correctPicks}/{totalResolved} correct
          </span>
        ) : (
          <span
            className={cn(
              "font-medium",
              totalPicks < totalSlots ? "text-pitch-700" : "text-emerald-600"
            )}
          >
            {totalPicks}/{totalSlots} picked
          </span>
        )}
        {isPending && <span className="text-neutral-400">Saving…</span>}
        {saved && !isPending && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle className="w-3 h-3" /> Saved
          </span>
        )}
        {error && <span className="text-red-500">{error}</span>}
      </div>

      {!hasAnyMatches ? (
        <p className="text-sm text-neutral-400 text-center py-4">
          Knockout matches will appear here once the group stage bracket is set.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            {/* Phase headers */}
            <div
              className="grid mb-3 min-w-[900px]"
              style={{
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "16px",
              }}
            >
              {PHASE_ORDER.map((phase) => (
                <div key={phase} className="text-center">
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                    {PHASE_LABELS[phase]}
                  </span>
                </div>
              ))}
            </div>

            {/* Bracket grid: 16 rows × 5 columns */}
            <div
              className="grid min-w-[900px]"
              style={{
                gridTemplateColumns: "repeat(5, 1fr)",
                gridTemplateRows: "repeat(16, 96px)",
                columnGap: "16px",
                rowGap: "0",
              }}
            >
              {PHASE_ORDER.map((phase, colIdx) => {
                const span = Math.pow(2, colIdx);
                return Array.from({ length: PHASE_COUNTS[phase] }).map((_, idx) => {
                  const slot = slots[`${phase}-${idx}`];
                  const gridRow = `${idx * span + 1} / span ${span}`;
                  const gridColumn = `${colIdx + 1}`;
                  const pickedCode = picks[slot.key];
                  const actualWinner = actualWinners[slot.key];
                  const isCompleted =
                    slot.isReal && slot.status === "COMPLETED";

                  return (
                    <div
                      key={slot.key}
                      style={{ gridRow, gridColumn }}
                      className="flex items-center"
                    >
                      <BracketSlotCard
                        slot={slot}
                        pickedCode={pickedCode}
                        actualWinner={actualWinner}
                        isCompleted={isCompleted}
                        isLocked={isLocked}
                        isFinal={phase === "FINAL"}
                        eliminatedSet={eliminatedSet}
                        pointsByPickKey={pointsByPickKey}
                        tournamentKind={tournamentKind}
                        onPick={(code) => handlePick(slot.key, code)}
                      />
                    </div>
                  );
                });
              })}
            </div>
          </div>

          {/* Champion display */}
          {(picks["FINAL-0"] || actualWinners["FINAL-0"]) && (
            <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-50 border border-amber-200">
              <Trophy className="w-4 h-4 text-amber-600" />
              <span className="text-xs uppercase tracking-wider font-bold text-amber-700">
                {actualWinners["FINAL-0"] ? "Champion" : "Your Champion"}
              </span>
              {(() => {
                const code =
                  actualWinners["FINAL-0"] ?? picks["FINAL-0"]!;
                const team = teamByCode[code];
                if (!team) return null;
                return (
                  <span className="flex items-center gap-2">
                    <TeamBadge code={team.code} tournamentKind={tournamentKind} size="sm" />
                    <span className="text-sm font-semibold text-amber-900">
                      {team.name}
                    </span>
                  </span>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BracketSlotCard({
  slot,
  pickedCode,
  actualWinner,
  isCompleted,
  isLocked,
  isFinal,
  eliminatedSet,
  pointsByPickKey,
  tournamentKind,
  onPick,
}: {
  slot: Slot;
  pickedCode?: string;
  actualWinner?: string;
  isCompleted: boolean;
  isLocked: boolean;
  isFinal: boolean;
  eliminatedSet: Set<string>;
  pointsByPickKey?: Record<string, number>;
  tournamentKind: string;
  onPick: (code: string) => void;
}) {
  const pointsFor = (code: string): number | undefined =>
    pointsByPickKey?.[`${slot.phase}|${code}`];
  const teams: Array<{ team: BracketTeam | undefined; score: number | null | undefined }> = [
    { team: slot.homeTeam, score: slot.homeScore },
    { team: slot.awayTeam, score: slot.awayScore },
  ];

  const hasBothTeams = !!slot.homeTeam && !!slot.awayTeam;

  return (
    <div
      className={cn(
        "w-full rounded-lg border overflow-hidden bg-white shadow-sm",
        hasBothTeams ? "border-neutral-200" : "border-dashed border-neutral-200"
      )}
    >
      {teams.map(({ team, score }, i) => {
        if (!team) {
          return (
            <div
              key={`empty-${i}`}
              className={cn(
                "w-full flex items-center bg-neutral-50/50",
                i === 0 ? "border-b border-neutral-100" : ""
              )}
              style={{ paddingLeft: 14, paddingRight: 14, paddingTop: 10, paddingBottom: 10 }}
            >
              <span className="text-[11px] text-neutral-300">TBD</span>
            </div>
          );
        }

        const isPicked = pickedCode === team.code;
        const isActualWinner = actualWinner === team.code;
        const isActualLoser = !!actualWinner && actualWinner !== team.code;
        // Team was eliminated in an upstream slot — carry ✗ forward into derived slots.
        const isUpstreamEliminated = !actualWinner && eliminatedSet.has(team.code);

        let rowBg = "bg-white";
        let textColor = "text-neutral-700";
        let leftBorderColor: string | null = null;

        if (actualWinner) {
          if (isActualWinner) {
            rowBg = isPicked ? "bg-emerald-50" : "bg-white";
            textColor = "text-neutral-900 font-semibold";
          } else {
            textColor = "text-neutral-400";
          }
        } else if (isUpstreamEliminated && isPicked) {
          textColor = "text-neutral-400";
        } else if (isPicked) {
          rowBg = isFinal ? "bg-amber-50" : "bg-pitch-50";
          textColor = isFinal
            ? "text-amber-900 font-semibold"
            : "text-amber-900 font-medium";
          leftBorderColor = isFinal ? "#f59e0b" : "#4a8c2a";
        }

        const disabled = isLocked || !!actualWinner || isUpstreamEliminated;

        return (
          <button
            key={team.code}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onPick(team.code)}
            className={cn(
              "w-full flex items-center gap-2 text-left transition-colors",
              i === 0 ? "border-b border-neutral-100" : "",
              rowBg,
              !disabled && "hover:bg-neutral-50 cursor-pointer",
              disabled && "cursor-default"
            )}
            style={{
              paddingLeft: 14,
              paddingRight: 14,
              paddingTop: 10,
              paddingBottom: 10,
              borderLeft: leftBorderColor ? `2px solid ${leftBorderColor}` : undefined,
            }}
          >
            <TeamBadge code={team.code} tournamentKind={tournamentKind} size="sm" />
            <span className={cn("flex-1 text-xs truncate", textColor)}>
              {team.name}
            </span>

            {!actualWinner && !isUpstreamEliminated && isPicked && (() => {
              const pts = pointsFor(team.code);
              return (
                <span
                  className={cn(
                    "font-bold rounded text-white leading-none tabular-nums",
                    isFinal ? "bg-amber-500" : "bg-pitch-500"
                  )}
                  style={{ fontSize: 12, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3 }}
                >
                  {pts != null ? `+${pts.toFixed(1)}` : "✓"}
                </span>
              );
            })()}
            {isUpstreamEliminated && isPicked && (
              <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-red-400 text-white leading-none">
                ✗
              </span>
            )}
            {!actualWinner && !isUpstreamEliminated && !isPicked && !isLocked && (() => {
              const pts = pointsFor(team.code);
              if (pts == null) return null;
              return (
                <span
                  className="text-neutral-400 tabular-nums font-medium"
                  style={{ fontSize: 12 }}
                >
                  +{pts.toFixed(1)}
                </span>
              );
            })()}
            {actualWinner && isPicked && (
              isActualWinner ? (() => {
                const pts = pointsFor(team.code);
                return (
                  <span
                    className="font-bold rounded bg-emerald-500 text-white leading-none tabular-nums"
                    style={{ fontSize: 12, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3 }}
                  >
                    {pts != null ? `+${pts.toFixed(1)}` : "✓"}
                  </span>
                );
              })() : isActualLoser ? (
                <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-red-400 text-white leading-none">
                  ✗
                </span>
              ) : null
            )}
            {isCompleted && score != null && (
              <span
                className={cn(
                  "text-xs font-bold tabular-nums w-4 text-center",
                  isActualWinner ? "text-neutral-900" : "text-neutral-400"
                )}
              >
                {score}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
