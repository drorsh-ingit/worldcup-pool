"use client";

import { useState } from "react";
import { Sliders, ChevronDown, RotateCcw, Save, AlertTriangle, Check } from "lucide-react";
import { updateGroupSettings } from "@/lib/actions/tournaments";
import { DEFAULT_GROUP_SETTINGS, type GroupSettings } from "@/lib/settings";

// ─── Labels ───

const TIER_LABELS: Record<string, string> = {
  preTournament: "Pre-Tournament",
  perGame: "Per Game",
  milestone: "Milestone",
  curated: "Curated",
};

const BET_LABELS: Record<string, string> = {
  winner: "Winner",
  runnerUp: "Runner Up",
  goldenBoot: "Golden Boot",
  groupPredictions: "Group Predictions",
  darkHorse: "Dark Horse",
  reverseDarkHorse: "Reverse Dark Horse",
  matchWinner: "Match Winner",
  correctScore: "Correct Score",
  bracket: "Knockout Bracket",
  goldenGlove: "Golden Glove",
  goldenBall: "Golden Ball",
  semifinalists: "Semifinalists",
  props: "Curated Props",
};

const BET_DESCRIPTIONS: Record<string, string> = {
  winner: "Pick the team that lifts the trophy. Higher odds = bigger payout.",
  runnerUp: "Pick the team that reaches the final but loses.",
  goldenBoot: "Pick the tournament's top scorer.",
  groupPredictions: "Pick each group's winner + which teams advance. Points per correct pick.",
  darkHorse: "Pick an underdog (odds > 20/1) to reach the quarter-finals.",
  reverseDarkHorse: "Pick a favourite that fails to advance beyond the group stage.",
  matchWinner: "Predict home win, draw, or away win for each match.",
  correctScore: "Predict the exact final score for each match.",
  bracket: "Predict the full knockout bracket — who advances every round.",
  goldenGlove: "Pick the goalkeeper awarded the Golden Glove.",
  goldenBall: "Pick the player awarded the Golden Ball (best player).",
  semifinalists: "Pick all 4 teams that reach the semi-finals.",
  props: "Admin-defined custom prop bets.",
};

const PHASE_LABELS: Record<string, string> = {
  GROUP: "Group Stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-Finals",
  SF: "Semi-Finals",
  FINAL: "Final",
};

const TIER_KEYS = ["preTournament", "perGame", "milestone", "curated"] as const;

// Which bet types belong to which tier
const BET_TYPES_BY_TIER: Record<string, string[]> = {
  preTournament: ["winner", "runnerUp", "goldenBoot", "groupPredictions", "darkHorse", "reverseDarkHorse"],
  perGame: ["matchWinner", "correctScore"],
  milestone: ["bracket", "goldenGlove", "goldenBall", "semifinalists"],
  curated: ["props"],
};

// Reverse lookup: bet type → tier
const TIER_FOR_BET: Record<string, string> = {};
for (const [tier, keys] of Object.entries(BET_TYPES_BY_TIER)) {
  for (const key of keys) TIER_FOR_BET[key] = tier;
}

// ─── Types ───

export type OddsEntry = { label: string; odds: number; points?: number };
export type OddsData = Record<string, OddsEntry[]>;

// ─── Helpers ───

type Draft = typeof DEFAULT_GROUP_SETTINGS;

function deepClone(obj: Draft): Draft {
  return JSON.parse(JSON.stringify(obj));
}

function sumValues(obj: Record<string, number>): number {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

function pct(v: number): number {
  return Math.round(v * 1000) / 10;
}

function fromPct(v: number): number {
  return v / 100;
}

function betSubPool(draft: Draft, betKey: string): number {
  const tier = TIER_FOR_BET[betKey];
  if (!tier) return 0;
  const tierPool = draft.totalPool * (draft.tierWeights[tier as keyof typeof draft.tierWeights] ?? 0);
  const subWeights = draft.subWeights[tier as keyof typeof draft.subWeights] as Record<string, number>;
  return tierPool * (subWeights[betKey] ?? 0);
}

// ─── Collapsible Section ───

function Section({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-neutral-100 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 text-left"
      >
        <span className="text-sm font-medium text-neutral-800">{title}</span>
        <span className="flex items-center gap-2">
          {summary && !open && (
            <span className="text-xs text-neutral-400">{summary}</span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-neutral-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

// ─── Sum Indicator ───

function SumIndicator({ values, target = 100 }: { values: Record<string, number>; target?: number }) {
  const sum = Math.round(sumValues(values) * 10) / 10;
  const ok = Math.abs(sum - target) < 0.2;
  return (
    <div className={`flex items-center gap-1 text-xs mt-1 ${ok ? "text-emerald-600" : "text-red-500"}`}>
      {ok ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      Sum: {sum}%{!ok && ` (must be ${target}%)`}
    </div>
  );
}

// ─── Number Input ───

function NumInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
  hint,
  className: extraClass,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={extraClass}>
      {label && <label className="text-xs text-neutral-500 block mb-0.5">{label}</label>}
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-20 h-8 px-2 rounded-lg border border-neutral-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
        {suffix && <span className="text-xs text-neutral-400">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-amber-600 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Expandable Odds List ───

function OddsList({
  entries,
  threshold,
}: {
  entries: OddsEntry[];
  threshold: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => a.odds - b.odds);
  const clampedCount = sorted.filter((e) => e.odds > threshold).length;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-neutral-400 hover:text-neutral-600 flex items-center gap-1 transition-colors"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        {expanded ? "Hide odds" : `Show odds`}
        {clampedCount > 0 && (
          <span className="text-amber-500">({clampedCount} clamped)</span>
        )}
      </button>
      {expanded && (
        <div className="mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-neutral-100 bg-neutral-50">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-neutral-400">
                <th className="text-left py-1 px-2 font-medium">Option</th>
                <th className="text-right py-1 px-2 font-medium">Odds</th>
                <th className="text-right py-1 px-2 font-medium">Points</th>
                <th className="text-right py-1 px-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => {
                const isClamped = e.odds > threshold;
                return (
                  <tr key={e.label} className="border-b border-neutral-100 last:border-b-0">
                    <td className="py-1 px-2 text-neutral-700">{e.label}</td>
                    <td className="py-1 px-2 text-right tabular-nums text-neutral-500">
                      {Math.round(e.odds / 100)}/1
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums text-neutral-600 font-medium">
                      {e.points !== undefined ? e.points.toFixed(1) : "—"}
                    </td>
                    <td className={`py-1 px-2 text-right ${isClamped ? "text-amber-500 font-medium" : "text-neutral-400"}`}>
                      {isClamped ? "clamped" : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Bet Type Row (Base + Clamping + Odds) ───

function BetTypeRow({
  betKey,
  draft,
  oddsEntries,
  onBasePctChange,
  onThresholdChange,
}: {
  betKey: string;
  draft: Draft;
  oddsEntries?: OddsEntry[];
  onBasePctChange: (key: string, pctVal: number) => void;
  onThresholdChange: (key: string, val: number) => void;
}) {
  const budget = betSubPool(draft, betKey);
  const basePctVal = draft.basePct[betKey as keyof typeof draft.basePct] ?? 0;
  const basePts = budget * basePctVal;
  const threshold = draft.outlierThresholds[betKey as keyof typeof draft.outlierThresholds] ?? 100000;

  return (
    <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-3">
      <p className={`text-xs font-medium text-neutral-700 ${BET_DESCRIPTIONS[betKey] ? "" : "mb-2"}`}>{BET_LABELS[betKey] ?? betKey}</p>
      {BET_DESCRIPTIONS[betKey] && (
        <p className="text-xs text-neutral-400 mt-0.5 mb-2">{BET_DESCRIPTIONS[betKey]}</p>
      )}
      <div className="flex flex-wrap gap-4 items-start">
        <NumInput
          label="Base %"
          value={pct(basePctVal)}
          onChange={(v) => onBasePctChange(betKey, v)}
          min={0}
          max={100}
          step={1}
          suffix="%"
          hint={`${basePts.toFixed(1)} / ${budget.toFixed(1)} pts`}
        />
        <NumInput
          label="Outlier cap"
          value={threshold}
          onChange={(v) => onThresholdChange(betKey, v)}
          min={1}
          step={100}
          suffix={threshold >= 100000 ? "(none)" : `(${Math.round(threshold / 100)}/1)`}
        />
      </div>
      {oddsEntries && oddsEntries.length > 0 && (
        <OddsList entries={oddsEntries} threshold={threshold} />
      )}
    </div>
  );
}

// ─── Main Component ───

export function ScoringSettings({
  groupId,
  settings,
  oddsData,
}: {
  groupId: string;
  settings: GroupSettings;
  oddsData?: OddsData;
}) {
  const initial: Draft = {
    ...DEFAULT_GROUP_SETTINGS,
    ...settings,
    tierWeights: { ...DEFAULT_GROUP_SETTINGS.tierWeights, ...settings.tierWeights },
    subWeights: {
      preTournament: { ...DEFAULT_GROUP_SETTINGS.subWeights.preTournament, ...settings.subWeights?.preTournament },
      perGame: { ...DEFAULT_GROUP_SETTINGS.subWeights.perGame, ...settings.subWeights?.perGame },
      milestone: { ...DEFAULT_GROUP_SETTINGS.subWeights.milestone, ...settings.subWeights?.milestone },
      curated: { ...DEFAULT_GROUP_SETTINGS.subWeights.curated, ...settings.subWeights?.curated },
    },
    basePct: { ...DEFAULT_GROUP_SETTINGS.basePct, ...settings.basePct },
    outlierThresholds: { ...DEFAULT_GROUP_SETTINGS.outlierThresholds, ...settings.outlierThresholds },
    knockoutMultipliers: { ...DEFAULT_GROUP_SETTINGS.knockoutMultipliers, ...settings.knockoutMultipliers },
  };

  const [draft, setDraft] = useState<Draft>(() => deepClone(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  // ─── Validation ───

  const tierPcts = Object.fromEntries(
    TIER_KEYS.map((k) => [k, pct(draft.tierWeights[k])])
  );
  const tierSumOk = Math.abs(sumValues(tierPcts) - 100) < 0.2;

  const subSumOk: Record<string, boolean> = {};
  for (const tier of TIER_KEYS) {
    const vals = Object.fromEntries(
      Object.entries(draft.subWeights[tier]).map(([k, v]) => [k, pct(v)])
    );
    subSumOk[tier] = Math.abs(sumValues(vals) - 100) < 0.2;
  }

  const valid = tierSumOk && Object.values(subSumOk).every(Boolean);

  // ─── Updaters ───

  function setTierWeight(key: string, pctVal: number) {
    setDraft((d) => ({ ...d, tierWeights: { ...d.tierWeights, [key]: fromPct(pctVal) } }));
    setSaved(false);
  }

  function setSubWeight(tier: string, key: string, pctVal: number) {
    setDraft((d) => ({
      ...d,
      subWeights: {
        ...d.subWeights,
        [tier]: { ...d.subWeights[tier as keyof typeof d.subWeights], [key]: fromPct(pctVal) },
      },
    }));
    setSaved(false);
  }

  function setBasePct(key: string, pctVal: number) {
    setDraft((d) => ({ ...d, basePct: { ...d.basePct, [key]: fromPct(pctVal) } }));
    setSaved(false);
  }

  function setThreshold(key: string, val: number) {
    setDraft((d) => ({
      ...d,
      outlierThresholds: { ...d.outlierThresholds, [key]: Math.max(1, Math.round(val)) },
    }));
    setSaved(false);
  }

  function setMultiplier(key: string, val: number) {
    setDraft((d) => ({
      ...d,
      knockoutMultipliers: { ...d.knockoutMultipliers, [key]: Math.max(1, val) },
    }));
    setSaved(false);
  }

  function setTotalPool(val: number) {
    setDraft((d) => ({ ...d, totalPool: Math.max(1, Math.round(val)) }));
    setSaved(false);
  }

  function handleReset() {
    setDraft(deepClone(DEFAULT_GROUP_SETTINGS));
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const toSave = { ...draft, simulation: settings.simulation };
      await updateGroupSettings(groupId, toSave);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-neutral-500" />
          <h2 className="text-sm font-semibold text-neutral-900">Scoring Settings</h2>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-neutral-400 hover:text-neutral-600 flex items-center gap-1 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Reset to defaults
        </button>
      </div>

      <div className="px-4">
        {/* Total Pool */}
        <Section title="Total Pool" summary={`${draft.totalPool} pts`}>
          <NumInput
            label="Base point pool"
            value={draft.totalPool}
            onChange={setTotalPool}
            min={1}
            step={100}
            suffix="pts"
          />
          <p className="text-xs text-neutral-400 mt-1">
            Total points distributed across all bet types. Higher = bigger spreads between players.
          </p>
        </Section>

        {/* Tier Weights */}
        <Section title="Tier Weights" summary={tierSumOk ? "100%" : `${Math.round(sumValues(tierPcts))}%`}>
          <p className="text-xs text-neutral-400 mb-3">
            How much of the total pool goes to each category. Must sum to 100%.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TIER_KEYS.map((k) => {
              const tierPool = draft.totalPool * draft.tierWeights[k];
              return (
                <NumInput
                  key={k}
                  label={TIER_LABELS[k]}
                  value={pct(draft.tierWeights[k])}
                  onChange={(v) => setTierWeight(k, v)}
                  min={0}
                  max={100}
                  step={0.5}
                  suffix="%"
                  hint={`${tierPool.toFixed(1)} pts`}
                />
              );
            })}
          </div>
          <SumIndicator values={tierPcts} />
        </Section>

        {/* Sub-Weights */}
        <Section title="Sub-Weights" summary="per bet type within each tier">
          <p className="text-xs text-neutral-400 mb-3">
            How each tier's pool is split among its bet types. Must sum to 100% within each tier.
          </p>
          {TIER_KEYS.map((tier) => {
            const entries = Object.entries(draft.subWeights[tier]);
            const pctVals = Object.fromEntries(entries.map(([k, v]) => [k, pct(v)]));
            const tierPool = draft.totalPool * draft.tierWeights[tier];
            return (
              <div key={tier} className="mb-4 last:mb-0">
                <p className="text-xs font-medium text-neutral-700 mb-2">
                  {TIER_LABELS[tier]}
                  <span className="text-neutral-400 font-normal ml-1">({tierPool.toFixed(1)} pts)</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {entries.map(([key, val]) => {
                    const budget = tierPool * val;
                    return (
                      <NumInput
                        key={key}
                        label={BET_LABELS[key] ?? key}
                        value={pct(val)}
                        onChange={(v) => setSubWeight(tier, key, v)}
                        min={0}
                        max={100}
                        step={0.5}
                        suffix="%"
                        hint={`${budget.toFixed(1)} pts max`}
                      />
                    );
                  })}
                </div>
                <SumIndicator values={pctVals} />
              </div>
            );
          })}
        </Section>

        {/* Base + Bonus & Outlier Clamping — combined per bet type */}
        <Section title="Base + Bonus & Clamping" summary="per bet type scoring rules">
          <p className="text-xs text-neutral-400 mb-3">
            Each correct pick earns base points (guaranteed floor) + bonus points (odds-scaled).
            The outlier cap sets the maximum odds beyond which all picks get the same max bonus.
          </p>
          {TIER_KEYS.map((tier) => (
            <div key={tier} className="mb-4 last:mb-0">
              <p className="text-xs font-medium text-neutral-700 mb-2">{TIER_LABELS[tier]}</p>
              <div className="space-y-2">
                {BET_TYPES_BY_TIER[tier].map((key) => (
                  <BetTypeRow
                    key={key}
                    betKey={key}
                    draft={draft}
                    oddsEntries={oddsData?.[key]}
                    onBasePctChange={setBasePct}
                    onThresholdChange={setThreshold}
                  />
                ))}
              </div>
            </div>
          ))}
        </Section>

        {/* Knockout Multipliers */}
        <Section title="Knockout Multipliers" summary="per-game scaling by round">
          <p className="text-xs text-neutral-400 mb-3">
            Per-game bet points are multiplied by these values in knockout stages.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Object.entries(draft.knockoutMultipliers).map(([key, val]) => (
              <NumInput
                key={key}
                label={PHASE_LABELS[key] ?? key}
                value={val}
                onChange={(v) => setMultiplier(key, v)}
                min={1}
                max={10}
                step={0.1}
                suffix="x"
              />
            ))}
          </div>
        </Section>
      </div>

      {/* Footer: Save / status */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100">
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-500">{error}</span>}
          {saved && !dirty && (
            <span className="text-xs text-emerald-600 flex items-center gap-1">
              <Check className="w-3 h-3" /> Saved
            </span>
          )}
          {dirty && !valid && (
            <span className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Fix validation errors before saving
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || !valid || saving}
          className="h-9 px-4 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </section>
  );
}
