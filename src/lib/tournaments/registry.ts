/**
 * Tournament profile registry. Add a new tournament type by writing its
 * profile module and registering it here.
 */

import { wc2026Profile } from "./wc2026";
import { ucl2026Profile } from "./ucl2026";
import type { TournamentKind, TournamentProfile } from "./types";

export type { TournamentKind, TournamentProfile } from "./types";

export const TOURNAMENT_PROFILES: Record<TournamentKind, TournamentProfile> = {
  WC_2026: wc2026Profile,
  UCL_2026: ucl2026Profile,
};

export const TOURNAMENT_KINDS: TournamentKind[] = Object.keys(
  TOURNAMENT_PROFILES
) as TournamentKind[];

export function getProfile(kind: string): TournamentProfile {
  const profile = TOURNAMENT_PROFILES[kind as TournamentKind];
  if (!profile) throw new Error(`Unknown tournament kind: ${kind}`);
  return profile;
}

export function isTournamentKind(value: string): value is TournamentKind {
  return value in TOURNAMENT_PROFILES;
}
