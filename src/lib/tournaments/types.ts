/**
 * TournamentProfile — everything that varies between tournament types
 * (World Cup, Champions League, Euros, etc.) lives here. One profile per
 * tournament kind; the engine (initTournament, scoring, bet-type controls)
 * consumes profiles generically so adding a new tournament is a matter of
 * writing one module.
 */

import type { BetCategory, BetOpenTrigger, MatchPhase } from "@prisma/client";
import type { DEFAULT_GROUP_SETTINGS } from "@/lib/settings";

export type TournamentKind = "WC_2026" | "UCL_2026";

export interface TeamSeed {
  name: string;
  code: string;
  groupLetter: string;
  odds: Record<string, number>;
}

export interface MatchSeed {
  homeCode: string;
  awayCode: string;
  phase: MatchPhase;
  matchday: number;
  groupLetter: string | null;
  kickoffAt: Date;
  externalId: string | null;
  multiplier: number;
}

export interface TournamentBetTypeDef {
  category: BetCategory;
  subType: string;
  name: string;
  description: string;
  /** Required for TOURNAMENT category; null/undefined for PER_GAME and CURATED. */
  openTrigger?: BetOpenTrigger;
  /** Overrides opensAt for PER_GAME/CURATED bets when no trigger applies. */
  opensAt?: Date;
  locksAt?: Date | null;
  config?: Record<string, unknown>;
}

export interface PlayerCandidate {
  playerName: string;
  teamCode: string;
  odds: number;
}

export interface TournamentProfile {
  /** Stable identifier stored on Tournament.kind. */
  id: TournamentKind;
  /** Full display name, e.g. "FIFA World Cup 2026". */
  displayName: string;
  /** Short display name, e.g. "WC 2026". */
  shortName: string;

  /** Team roster (seeded at init). */
  teams: readonly TeamSeed[];
  /** Group-phase matches (seeded at init). Knockout matches are created later. */
  matches: readonly MatchSeed[];
  /** Bet type catalog (seeded at init). */
  betTypes: readonly TournamentBetTypeDef[];

  /** Special candidate lists used by certain bet types (e.g., Golden Boot). */
  candidates?: {
    goldenBoot?: readonly PlayerCandidate[];
    goldenBall?: readonly PlayerCandidate[];
    goldenGlove?: readonly PlayerCandidate[];
  };

  /** Default scoring/settings for this profile (merged with group overrides). */
  scoringDefaults: typeof DEFAULT_GROUP_SETTINGS;

  /** Resolve a BetOpenTrigger into concrete opensAt / locksAt datetimes for this profile. */
  resolveOpenTrigger(trigger: BetOpenTrigger): { opensAt: Date; locksAt: Date };
}
