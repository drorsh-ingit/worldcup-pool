/**
 * Tournament Engine — group standings, knockout bracket generation, advancement.
 * Used by simulation to auto-progress through tournament stages.
 */

import { db } from "@/lib/db";
import { R32_MATCHUPS, knockoutKickoff } from "@/lib/data/wc2026";
import type { MatchPhase } from "@prisma/client";

export type TeamStanding = {
  teamId: string;
  code: string;
  groupLetter: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

type MatchWithTeams = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  phase: string;
  groupLetter: string | null;
  kickoffAt: Date;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  status: string;
  homeTeam: { id: string; code: string; groupLetter: string };
  awayTeam: { id: string; code: string; groupLetter: string };
};

/**
 * Calculate group standings from completed group-stage matches.
 * Returns standings keyed by group letter, each sorted by rank.
 */
export function calculateGroupStandings(
  matches: MatchWithTeams[],
  teams: Array<{ id: string; code: string; groupLetter: string }>
): Record<string, TeamStanding[]> {
  // Initialize standings for all teams
  const standingMap: Record<string, TeamStanding> = {};
  for (const team of teams) {
    standingMap[team.id] = {
      teamId: team.id,
      code: team.code,
      groupLetter: team.groupLetter,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    };
  }

  // Process completed group matches
  for (const m of matches) {
    if (m.phase !== "GROUP" || m.status !== "COMPLETED") continue;
    if (m.actualHomeScore == null || m.actualAwayScore == null) continue;

    const home = standingMap[m.homeTeamId];
    const away = standingMap[m.awayTeamId];
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.gf += m.actualHomeScore;
    home.ga += m.actualAwayScore;
    away.gf += m.actualAwayScore;
    away.ga += m.actualHomeScore;

    if (m.actualHomeScore > m.actualAwayScore) {
      home.won++;
      home.points += 3;
      away.lost++;
    } else if (m.actualHomeScore < m.actualAwayScore) {
      away.won++;
      away.points += 3;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += 1;
      away.points += 1;
    }
  }

  // Update goal difference
  for (const s of Object.values(standingMap)) {
    s.gd = s.gf - s.ga;
  }

  // Group by letter and sort
  const grouped: Record<string, TeamStanding[]> = {};
  for (const s of Object.values(standingMap)) {
    if (!grouped[s.groupLetter]) grouped[s.groupLetter] = [];
    grouped[s.groupLetter].push(s);
  }

  for (const letter of Object.keys(grouped)) {
    grouped[letter].sort(standingComparator);
  }

  return grouped;
}

function standingComparator(a: TeamStanding, b: TeamStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return a.code.localeCompare(b.code);
}

/**
 * Get the 8 best 3rd-place teams across all groups.
 */
export function bestThirdPlaceTeams(
  standings: Record<string, TeamStanding[]>
): TeamStanding[] {
  const thirdPlace: TeamStanding[] = [];
  for (const group of Object.values(standings)) {
    if (group.length >= 3) {
      thirdPlace.push(group[2]); // 0-indexed: [0]=1st, [1]=2nd, [2]=3rd
    }
  }
  thirdPlace.sort(standingComparator);
  return thirdPlace.slice(0, 8);
}

/**
 * Check if all group-stage matches are completed.
 */
export function isGroupStageComplete(matches: MatchWithTeams[]): boolean {
  const groupMatches = matches.filter((m) => m.phase === "GROUP");
  return groupMatches.length > 0 && groupMatches.every((m) => m.status === "COMPLETED");
}

/**
 * Create R32 knockout matches based on group standings.
 * Returns the created match IDs.
 */
export async function createR32Matches(
  tournamentId: string,
  standings: Record<string, TeamStanding[]>
): Promise<string[]> {
  const third = bestThirdPlaceTeams(standings);

  // Build lookup: "1A" → teamId, "2B" → teamId, "3_0" → first best 3rd, etc.
  const lookup: Record<string, string> = {};
  for (const [letter, group] of Object.entries(standings)) {
    if (group[0]) lookup[`1${letter}`] = group[0].teamId;
    if (group[1]) lookup[`2${letter}`] = group[1].teamId;
  }
  for (let i = 0; i < third.length; i++) {
    lookup[`3_${i}`] = third[i].teamId;
  }

  const matchIds: string[] = [];
  for (let i = 0; i < R32_MATCHUPS.length; i++) {
    const slot = R32_MATCHUPS[i];
    const homeId = lookup[slot.home];
    const awayId = lookup[slot.away];
    if (!homeId || !awayId) continue;

    const match = await db.match.create({
      data: {
        tournamentId,
        homeTeamId: homeId,
        awayTeamId: awayId,
        phase: "R32" as MatchPhase,
        matchday: 1,
        groupLetter: null,
        kickoffAt: knockoutKickoff("R32", i),
        multiplier: 1.2,
        status: "UPCOMING",
      },
    });
    matchIds.push(match.id);
  }

  return matchIds;
}

/**
 * Get winners from completed knockout matches of a given phase.
 * Returns team IDs in match order (for bracket pairing in next round).
 */
export function getKnockoutWinners(
  matches: MatchWithTeams[],
  phase: string
): string[] {
  const phaseMatches = matches
    .filter((m) => m.phase === phase && m.status === "COMPLETED")
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());

  return phaseMatches.map((m) => {
    if (m.actualHomeScore == null || m.actualAwayScore == null) return "";
    return m.actualHomeScore >= m.actualAwayScore ? m.homeTeamId : m.awayTeamId;
  }).filter(Boolean);
}

/**
 * Get the loser of the final match.
 */
export function getFinalLoser(matches: MatchWithTeams[]): string | null {
  const final = matches.find((m) => m.phase === "FINAL" && m.status === "COMPLETED");
  if (!final || final.actualHomeScore == null || final.actualAwayScore == null) return null;
  return final.actualHomeScore >= final.actualAwayScore ? final.awayTeamId : final.homeTeamId;
}

/**
 * Check if all matches of a given phase are completed.
 */
export function isPhaseComplete(matches: MatchWithTeams[], phase: string): boolean {
  const phaseMatches = matches.filter((m) => m.phase === phase);
  return phaseMatches.length > 0 && phaseMatches.every((m) => m.status === "COMPLETED");
}

const NEXT_PHASE: Record<string, string> = {
  R32: "R16",
  R16: "QF",
  QF: "SF",
  SF: "FINAL",
};

const PHASE_MULTIPLIER: Record<string, number> = {
  R32: 1.2,
  R16: 1.3,
  QF: 1.5,
  SF: 1.7,
  FINAL: 2.0,
};

/**
 * Create matches for the next knockout round from the winners of the current round.
 * Winners are paired sequentially: [0 vs 1], [2 vs 3], etc.
 */
export async function createNextRoundMatches(
  tournamentId: string,
  currentPhase: string,
  winners: string[]
): Promise<string[]> {
  const nextPhase = NEXT_PHASE[currentPhase];
  if (!nextPhase) return [];

  const matchIds: string[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    if (!winners[i + 1]) break;
    const match = await db.match.create({
      data: {
        tournamentId,
        homeTeamId: winners[i],
        awayTeamId: winners[i + 1],
        phase: nextPhase as MatchPhase,
        matchday: 1,
        groupLetter: null,
        kickoffAt: knockoutKickoff(nextPhase, Math.floor(i / 2)),
        multiplier: PHASE_MULTIPLIER[nextPhase] ?? 1.0,
        status: "UPCOMING",
      },
    });
    matchIds.push(match.id);
  }

  return matchIds;
}

/**
 * Generate a knockout score (no draws allowed).
 */
export function generateKnockoutScore(): { homeScore: number; awayScore: number } {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const homeScore = randomGoals();
    const awayScore = randomGoals();
    if (homeScore !== awayScore) return { homeScore, awayScore };
  }
}

function randomGoals(): number {
  const r = Math.random();
  if (r < 0.25) return 0;
  if (r < 0.6) return 1;
  if (r < 0.82) return 2;
  if (r < 0.94) return 3;
  if (r < 0.98) return 4;
  return 5;
}
