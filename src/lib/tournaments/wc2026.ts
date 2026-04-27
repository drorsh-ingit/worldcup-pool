/**
 * FIFA World Cup 2026 TournamentProfile.
 * Thin composition over the existing static data in src/lib/data/wc2026.ts —
 * concrete tables live there; this file adapts them to the generic
 * TournamentProfile shape consumed by initTournament and the scoring engine.
 */

import {
  WC2026_TEAMS,
  WC2026_GROUP_MATCHES,
  TOURNAMENT_BET_TYPES,
  GOLDEN_BOOT_CANDIDATES,
  resolveOpenTrigger,
} from "@/lib/data/wc2026";
import { DEFAULT_GROUP_SETTINGS } from "@/lib/settings";
import type {
  MatchSeed,
  TeamSeed,
  TournamentBetTypeDef,
  TournamentProfile,
} from "./types";

const TOURNAMENT_START = new Date("2026-06-11T00:00:00Z");
const PER_GAME_OPENS = new Date(TOURNAMENT_START.getTime() - 24 * 60 * 60 * 1000);

const teams: TeamSeed[] = WC2026_TEAMS.map((t) => ({
  name: t.name,
  code: t.code,
  groupLetter: t.groupLetter,
  odds: t.odds as unknown as Record<string, number>,
}));

const matches: MatchSeed[] = WC2026_GROUP_MATCHES.map((m) => ({
  homeCode: m.homeCode,
  awayCode: m.awayCode,
  phase: "GROUP" as const,
  matchday: m.matchday,
  groupLetter: m.groupLetter,
  kickoffAt: new Date(m.kickoffAt),
  externalId: String(m.externalId),
  multiplier: 1.0,
}));

const betTypes: TournamentBetTypeDef[] = [
  ...TOURNAMENT_BET_TYPES.map((bt) => ({
    category: "TOURNAMENT" as const,
    subType: bt.subType,
    name: bt.name,
    description: bt.description,
    openTrigger: bt.openTrigger,
  })),
  {
    category: "PER_GAME" as const,
    subType: "match_winner",
    name: "Match Result",
    description:
      "Predict the result of each match — home win, draw, or away win. Points scale with how unlikely the outcome was.",
    opensAt: PER_GAME_OPENS,
    locksAt: null,
  },
  {
    category: "PER_GAME" as const,
    subType: "correct_score",
    name: "Correct Score",
    description:
      "Predict the exact final score. Harder to get right, so it pays more than the match result bet.",
    opensAt: PER_GAME_OPENS,
    locksAt: null,
  },
];

export const wc2026Profile: TournamentProfile = {
  id: "WC_2026",
  displayName: "FIFA World Cup 2026",
  shortName: "WC 2026",
  teams,
  matches,
  betTypes,
  candidates: {
    goldenBoot: GOLDEN_BOOT_CANDIDATES,
  },
  scoringDefaults: DEFAULT_GROUP_SETTINGS,
  resolveOpenTrigger,
};
