import type { CellResult } from "@/lib/group-stats";

/** Tailwind classes for a prediction cell, keyed by its result. */
export const RESULT_CLASSES: Record<CellResult, string> = {
  exact: "bg-emerald-50 text-emerald-700 border-emerald-200",
  winner: "bg-amber-50 text-amber-700 border-amber-200",
  wrong: "bg-red-50 text-red-600 border-red-200",
  pending: "bg-white text-neutral-600 border-neutral-200",
  none: "bg-neutral-50 text-neutral-300 border-neutral-150",
};

export const RESULT_LABEL: Record<Exclude<CellResult, "none" | "pending">, string> = {
  exact: "Exact score",
  winner: "Correct winner",
  wrong: "Wrong",
};

/** Provisional result of a prediction against a (possibly live) score. */
export function scoreResult(
  predH: number,
  predA: number,
  scoreH: number,
  scoreA: number
): "exact" | "winner" | "wrong" {
  if (predH === scoreH && predA === scoreA) return "exact";
  const outcome = (h: number, a: number) => (h > a ? "home" : a > h ? "away" : "draw");
  return outcome(predH, predA) === outcome(scoreH, scoreA) ? "winner" : "wrong";
}
