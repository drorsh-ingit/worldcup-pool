/**
 * Lightweight tournament catalog safe for client bundles.
 * Lists kinds + display names without pulling in team/match/bet-type data.
 * Keep in sync with the profiles registered in ./registry.ts.
 */

import type { TournamentKind } from "./types";

export const TOURNAMENT_CATALOG: ReadonlyArray<{
  id: TournamentKind;
  displayName: string;
  shortName: string;
}> = [
  { id: "WC_2026", displayName: "FIFA World Cup 2026", shortName: "WC 2026" },
  { id: "UCL_2026", displayName: "UEFA Champions League 2025–26", shortName: "UCL 2026" },
];
