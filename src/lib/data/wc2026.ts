/**
 * FIFA World Cup 2026 — static tournament data
 * 48 teams across 12 groups (A–L), official draw
 * Match schedule sourced from football-data.org competition WC / season 2026
 */

export interface TeamData {
  name: string;
  code: string; // 3-letter FIFA/football-data code
  groupLetter: string;
  /** Approximate implied odds in decimal format (e.g. 6.0 = 6/1) */
  odds: {
    winnerOdds: number; // tournament winner
    groupWinnerOdds: number; // win their group
    qualifyOdds: number; // advance from group
  };
}

export const WC2026_TEAMS: TeamData[] = [
  // Group A
  { name: "Mexico", code: "MEX", groupLetter: "A", odds: { winnerOdds: 3500, groupWinnerOdds: 250, qualifyOdds: 130 } },
  { name: "South Africa", code: "RSA", groupLetter: "A", odds: { winnerOdds: 10000, groupWinnerOdds: 800, qualifyOdds: 320 } },
  { name: "South Korea", code: "KOR", groupLetter: "A", odds: { winnerOdds: 3500, groupWinnerOdds: 270, qualifyOdds: 138 } },
  { name: "Czechia", code: "CZE", groupLetter: "A", odds: { winnerOdds: 2000, groupWinnerOdds: 180, qualifyOdds: 110 } },

  // Group B
  { name: "Canada", code: "CAN", groupLetter: "B", odds: { winnerOdds: 3000, groupWinnerOdds: 220, qualifyOdds: 120 } },
  { name: "Bosnia-Herzegovina", code: "BIH", groupLetter: "B", odds: { winnerOdds: 6000, groupWinnerOdds: 480, qualifyOdds: 215 } },
  { name: "Qatar", code: "QAT", groupLetter: "B", odds: { winnerOdds: 12000, groupWinnerOdds: 950, qualifyOdds: 380 } },
  { name: "Switzerland", code: "SUI", groupLetter: "B", odds: { winnerOdds: 2800, groupWinnerOdds: 220, qualifyOdds: 125 } },

  // Group C
  { name: "Brazil", code: "BRA", groupLetter: "C", odds: { winnerOdds: 400, groupWinnerOdds: 55, qualifyOdds: 40 } },
  { name: "Haiti", code: "HAI", groupLetter: "C", odds: { winnerOdds: 20000, groupWinnerOdds: 2000, qualifyOdds: 750 } },
  { name: "Morocco", code: "MAR", groupLetter: "C", odds: { winnerOdds: 1800, groupWinnerOdds: 160, qualifyOdds: 100 } },
  { name: "Scotland", code: "SCO", groupLetter: "C", odds: { winnerOdds: 3500, groupWinnerOdds: 270, qualifyOdds: 140 } },

  // Group D
  { name: "Australia", code: "AUS", groupLetter: "D", odds: { winnerOdds: 5500, groupWinnerOdds: 440, qualifyOdds: 210 } },
  { name: "Paraguay", code: "PAR", groupLetter: "D", odds: { winnerOdds: 4000, groupWinnerOdds: 310, qualifyOdds: 170 } },
  { name: "Turkey", code: "TUR", groupLetter: "D", odds: { winnerOdds: 2500, groupWinnerOdds: 220, qualifyOdds: 125 } },
  { name: "United States", code: "USA", groupLetter: "D", odds: { winnerOdds: 1200, groupWinnerOdds: 130, qualifyOdds: 80 } },

  // Group E
  { name: "Germany", code: "GER", groupLetter: "E", odds: { winnerOdds: 550, groupWinnerOdds: 70, qualifyOdds: 50 } },
  { name: "Curaçao", code: "CUR", groupLetter: "E", odds: { winnerOdds: 25000, groupWinnerOdds: 2500, qualifyOdds: 900 } },
  { name: "Côte d'Ivoire", code: "CIV", groupLetter: "E", odds: { winnerOdds: 4500, groupWinnerOdds: 350, qualifyOdds: 190 } },
  { name: "Ecuador", code: "ECU", groupLetter: "E", odds: { winnerOdds: 5000, groupWinnerOdds: 400, qualifyOdds: 195 } },

  // Group F
  { name: "Netherlands", code: "NED", groupLetter: "F", odds: { winnerOdds: 1100, groupWinnerOdds: 120, qualifyOdds: 75 } },
  { name: "Japan", code: "JPN", groupLetter: "F", odds: { winnerOdds: 2200, groupWinnerOdds: 200, qualifyOdds: 115 } },
  { name: "Sweden", code: "SWE", groupLetter: "F", odds: { winnerOdds: 3000, groupWinnerOdds: 230, qualifyOdds: 125 } },
  { name: "Tunisia", code: "TUN", groupLetter: "F", odds: { winnerOdds: 5000, groupWinnerOdds: 400, qualifyOdds: 200 } },

  // Group G
  { name: "Belgium", code: "BEL", groupLetter: "G", odds: { winnerOdds: 1400, groupWinnerOdds: 135, qualifyOdds: 82 } },
  { name: "Egypt", code: "EGY", groupLetter: "G", odds: { winnerOdds: 6000, groupWinnerOdds: 500, qualifyOdds: 220 } },
  { name: "Iran", code: "IRN", groupLetter: "G", odds: { winnerOdds: 4500, groupWinnerOdds: 360, qualifyOdds: 185 } },
  { name: "New Zealand", code: "NZL", groupLetter: "G", odds: { winnerOdds: 15000, groupWinnerOdds: 1500, qualifyOdds: 530 } },

  // Group H
  { name: "Spain", code: "ESP", groupLetter: "H", odds: { winnerOdds: 450, groupWinnerOdds: 60, qualifyOdds: 45 } },
  { name: "Cape Verde Islands", code: "CPV", groupLetter: "H", odds: { winnerOdds: 15000, groupWinnerOdds: 1400, qualifyOdds: 500 } },
  { name: "Saudi Arabia", code: "KSA", groupLetter: "H", odds: { winnerOdds: 6000, groupWinnerOdds: 480, qualifyOdds: 215 } },
  { name: "Uruguay", code: "URU", groupLetter: "H", odds: { winnerOdds: 1400, groupWinnerOdds: 140, qualifyOdds: 85 } },

  // Group I
  { name: "France", code: "FRA", groupLetter: "I", odds: { winnerOdds: 500, groupWinnerOdds: 70, qualifyOdds: 50 } },
  { name: "Senegal", code: "SEN", groupLetter: "I", odds: { winnerOdds: 3500, groupWinnerOdds: 270, qualifyOdds: 140 } },
  { name: "Iraq", code: "IRQ", groupLetter: "I", odds: { winnerOdds: 6000, groupWinnerOdds: 490, qualifyOdds: 218 } },
  { name: "Norway", code: "NOR", groupLetter: "I", odds: { winnerOdds: 1400, groupWinnerOdds: 140, qualifyOdds: 85 } },

  // Group J
  { name: "Argentina", code: "ARG", groupLetter: "J", odds: { winnerOdds: 500, groupWinnerOdds: 65, qualifyOdds: 48 } },
  { name: "Algeria", code: "ALG", groupLetter: "J", odds: { winnerOdds: 5000, groupWinnerOdds: 400, qualifyOdds: 200 } },
  { name: "Austria", code: "AUT", groupLetter: "J", odds: { winnerOdds: 1600, groupWinnerOdds: 145, qualifyOdds: 88 } },
  { name: "Jordan", code: "JOR", groupLetter: "J", odds: { winnerOdds: 8000, groupWinnerOdds: 650, qualifyOdds: 270 } },

  // Group K
  { name: "Portugal", code: "POR", groupLetter: "K", odds: { winnerOdds: 700, groupWinnerOdds: 90, qualifyOdds: 60 } },
  { name: "Congo DR", code: "COD", groupLetter: "K", odds: { winnerOdds: 8000, groupWinnerOdds: 650, qualifyOdds: 270 } },
  { name: "Uzbekistan", code: "UZB", groupLetter: "K", odds: { winnerOdds: 12000, groupWinnerOdds: 950, qualifyOdds: 380 } },
  { name: "Colombia", code: "COL", groupLetter: "K", odds: { winnerOdds: 1600, groupWinnerOdds: 145, qualifyOdds: 88 } },

  // Group L
  { name: "England", code: "ENG", groupLetter: "L", odds: { winnerOdds: 600, groupWinnerOdds: 75, qualifyOdds: 52 } },
  { name: "Croatia", code: "CRO", groupLetter: "L", odds: { winnerOdds: 1800, groupWinnerOdds: 160, qualifyOdds: 100 } },
  { name: "Ghana", code: "GHA", groupLetter: "L", odds: { winnerOdds: 9000, groupWinnerOdds: 750, qualifyOdds: 300 } },
  { name: "Panama", code: "PAN", groupLetter: "L", odds: { winnerOdds: 10000, groupWinnerOdds: 800, qualifyOdds: 310 } },
];

/** Group letters in order */
export const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

/** Teams by group */
export function teamsByGroup(): Record<string, TeamData[]> {
  const result: Record<string, TeamData[]> = {};
  for (const letter of GROUP_LETTERS) {
    result[letter] = WC2026_TEAMS.filter((t) => t.groupLetter === letter);
  }
  return result;
}

export interface MatchScheduleEntry {
  groupLetter: string;
  matchday: 1 | 2 | 3;
  homeCode: string;
  awayCode: string;
  kickoffAt: string; // ISO UTC string
  externalId: number; // football-data.org match ID
}

/** Full WC 2026 group-stage schedule — sourced directly from football-data.org */
export const WC2026_GROUP_MATCHES: MatchScheduleEntry[] = [
  // Group A
  { groupLetter: "A", matchday: 1, homeCode: "MEX", awayCode: "RSA", kickoffAt: "2026-06-11T19:00:00Z", externalId: 537327 },
  { groupLetter: "A", matchday: 1, homeCode: "KOR", awayCode: "CZE", kickoffAt: "2026-06-12T02:00:00Z", externalId: 537328 },
  { groupLetter: "A", matchday: 2, homeCode: "CZE", awayCode: "RSA", kickoffAt: "2026-06-18T16:00:00Z", externalId: 537329 },
  { groupLetter: "A", matchday: 2, homeCode: "MEX", awayCode: "KOR", kickoffAt: "2026-06-19T01:00:00Z", externalId: 537330 },
  { groupLetter: "A", matchday: 3, homeCode: "CZE", awayCode: "MEX", kickoffAt: "2026-06-25T01:00:00Z", externalId: 537331 },
  { groupLetter: "A", matchday: 3, homeCode: "RSA", awayCode: "KOR", kickoffAt: "2026-06-25T01:00:00Z", externalId: 537332 },

  // Group B
  { groupLetter: "B", matchday: 1, homeCode: "CAN", awayCode: "BIH", kickoffAt: "2026-06-12T19:00:00Z", externalId: 537333 },
  { groupLetter: "B", matchday: 1, homeCode: "QAT", awayCode: "SUI", kickoffAt: "2026-06-13T19:00:00Z", externalId: 537334 },
  { groupLetter: "B", matchday: 2, homeCode: "SUI", awayCode: "BIH", kickoffAt: "2026-06-18T19:00:00Z", externalId: 537335 },
  { groupLetter: "B", matchday: 2, homeCode: "CAN", awayCode: "QAT", kickoffAt: "2026-06-18T22:00:00Z", externalId: 537336 },
  { groupLetter: "B", matchday: 3, homeCode: "SUI", awayCode: "CAN", kickoffAt: "2026-06-24T19:00:00Z", externalId: 537337 },
  { groupLetter: "B", matchday: 3, homeCode: "BIH", awayCode: "QAT", kickoffAt: "2026-06-24T19:00:00Z", externalId: 537338 },

  // Group C
  { groupLetter: "C", matchday: 1, homeCode: "BRA", awayCode: "MAR", kickoffAt: "2026-06-13T22:00:00Z", externalId: 537339 },
  { groupLetter: "C", matchday: 1, homeCode: "HAI", awayCode: "SCO", kickoffAt: "2026-06-14T01:00:00Z", externalId: 537340 },
  { groupLetter: "C", matchday: 2, homeCode: "BRA", awayCode: "HAI", kickoffAt: "2026-06-20T00:30:00Z", externalId: 537341 },
  { groupLetter: "C", matchday: 2, homeCode: "SCO", awayCode: "MAR", kickoffAt: "2026-06-19T22:00:00Z", externalId: 537342 },
  { groupLetter: "C", matchday: 3, homeCode: "SCO", awayCode: "BRA", kickoffAt: "2026-06-24T22:00:00Z", externalId: 537343 },
  { groupLetter: "C", matchday: 3, homeCode: "MAR", awayCode: "HAI", kickoffAt: "2026-06-24T22:00:00Z", externalId: 537344 },

  // Group D
  { groupLetter: "D", matchday: 1, homeCode: "USA", awayCode: "PAR", kickoffAt: "2026-06-13T01:00:00Z", externalId: 537345 },
  { groupLetter: "D", matchday: 1, homeCode: "AUS", awayCode: "TUR", kickoffAt: "2026-06-14T04:00:00Z", externalId: 537346 },
  { groupLetter: "D", matchday: 2, homeCode: "TUR", awayCode: "PAR", kickoffAt: "2026-06-20T03:00:00Z", externalId: 537347 },
  { groupLetter: "D", matchday: 2, homeCode: "USA", awayCode: "AUS", kickoffAt: "2026-06-19T19:00:00Z", externalId: 537348 },
  { groupLetter: "D", matchday: 3, homeCode: "TUR", awayCode: "USA", kickoffAt: "2026-06-26T02:00:00Z", externalId: 537349 },
  { groupLetter: "D", matchday: 3, homeCode: "PAR", awayCode: "AUS", kickoffAt: "2026-06-26T02:00:00Z", externalId: 537350 },

  // Group E
  { groupLetter: "E", matchday: 1, homeCode: "GER", awayCode: "CUR", kickoffAt: "2026-06-14T17:00:00Z", externalId: 537351 },
  { groupLetter: "E", matchday: 1, homeCode: "CIV", awayCode: "ECU", kickoffAt: "2026-06-14T23:00:00Z", externalId: 537352 },
  { groupLetter: "E", matchday: 2, homeCode: "GER", awayCode: "CIV", kickoffAt: "2026-06-20T20:00:00Z", externalId: 537353 },
  { groupLetter: "E", matchday: 2, homeCode: "ECU", awayCode: "CUR", kickoffAt: "2026-06-21T00:00:00Z", externalId: 537354 },
  { groupLetter: "E", matchday: 3, homeCode: "ECU", awayCode: "GER", kickoffAt: "2026-06-25T20:00:00Z", externalId: 537355 },
  { groupLetter: "E", matchday: 3, homeCode: "CUR", awayCode: "CIV", kickoffAt: "2026-06-25T20:00:00Z", externalId: 537356 },

  // Group F
  { groupLetter: "F", matchday: 1, homeCode: "NED", awayCode: "JPN", kickoffAt: "2026-06-14T20:00:00Z", externalId: 537357 },
  { groupLetter: "F", matchday: 1, homeCode: "SWE", awayCode: "TUN", kickoffAt: "2026-06-15T02:00:00Z", externalId: 537358 },
  { groupLetter: "F", matchday: 2, homeCode: "NED", awayCode: "SWE", kickoffAt: "2026-06-20T17:00:00Z", externalId: 537359 },
  { groupLetter: "F", matchday: 2, homeCode: "TUN", awayCode: "JPN", kickoffAt: "2026-06-21T04:00:00Z", externalId: 537360 },
  { groupLetter: "F", matchday: 3, homeCode: "TUN", awayCode: "NED", kickoffAt: "2026-06-25T23:00:00Z", externalId: 537361 },
  { groupLetter: "F", matchday: 3, homeCode: "JPN", awayCode: "SWE", kickoffAt: "2026-06-25T23:00:00Z", externalId: 537362 },

  // Group G
  { groupLetter: "G", matchday: 1, homeCode: "BEL", awayCode: "EGY", kickoffAt: "2026-06-15T19:00:00Z", externalId: 537363 },
  { groupLetter: "G", matchday: 1, homeCode: "IRN", awayCode: "NZL", kickoffAt: "2026-06-16T01:00:00Z", externalId: 537364 },
  { groupLetter: "G", matchday: 2, homeCode: "BEL", awayCode: "IRN", kickoffAt: "2026-06-21T19:00:00Z", externalId: 537365 },
  { groupLetter: "G", matchday: 2, homeCode: "NZL", awayCode: "EGY", kickoffAt: "2026-06-22T01:00:00Z", externalId: 537366 },
  { groupLetter: "G", matchday: 3, homeCode: "NZL", awayCode: "BEL", kickoffAt: "2026-06-27T03:00:00Z", externalId: 537367 },
  { groupLetter: "G", matchday: 3, homeCode: "EGY", awayCode: "IRN", kickoffAt: "2026-06-27T03:00:00Z", externalId: 537368 },

  // Group H
  { groupLetter: "H", matchday: 1, homeCode: "ESP", awayCode: "CPV", kickoffAt: "2026-06-15T16:00:00Z", externalId: 537369 },
  { groupLetter: "H", matchday: 1, homeCode: "KSA", awayCode: "URU", kickoffAt: "2026-06-15T22:00:00Z", externalId: 537370 },
  { groupLetter: "H", matchday: 2, homeCode: "ESP", awayCode: "KSA", kickoffAt: "2026-06-21T16:00:00Z", externalId: 537371 },
  { groupLetter: "H", matchday: 2, homeCode: "URU", awayCode: "CPV", kickoffAt: "2026-06-21T22:00:00Z", externalId: 537372 },
  { groupLetter: "H", matchday: 3, homeCode: "URU", awayCode: "ESP", kickoffAt: "2026-06-27T00:00:00Z", externalId: 537373 },
  { groupLetter: "H", matchday: 3, homeCode: "CPV", awayCode: "KSA", kickoffAt: "2026-06-27T00:00:00Z", externalId: 537374 },

  // Group I
  { groupLetter: "I", matchday: 1, homeCode: "FRA", awayCode: "SEN", kickoffAt: "2026-06-16T19:00:00Z", externalId: 537391 },
  { groupLetter: "I", matchday: 1, homeCode: "IRQ", awayCode: "NOR", kickoffAt: "2026-06-16T22:00:00Z", externalId: 537392 },
  { groupLetter: "I", matchday: 2, homeCode: "FRA", awayCode: "IRQ", kickoffAt: "2026-06-22T21:00:00Z", externalId: 537393 },
  { groupLetter: "I", matchday: 2, homeCode: "NOR", awayCode: "SEN", kickoffAt: "2026-06-23T00:00:00Z", externalId: 537394 },
  { groupLetter: "I", matchday: 3, homeCode: "NOR", awayCode: "FRA", kickoffAt: "2026-06-26T19:00:00Z", externalId: 537395 },
  { groupLetter: "I", matchday: 3, homeCode: "SEN", awayCode: "IRQ", kickoffAt: "2026-06-26T19:00:00Z", externalId: 537396 },

  // Group J
  { groupLetter: "J", matchday: 1, homeCode: "ARG", awayCode: "ALG", kickoffAt: "2026-06-17T01:00:00Z", externalId: 537397 },
  { groupLetter: "J", matchday: 1, homeCode: "AUT", awayCode: "JOR", kickoffAt: "2026-06-17T04:00:00Z", externalId: 537398 },
  { groupLetter: "J", matchday: 2, homeCode: "ARG", awayCode: "AUT", kickoffAt: "2026-06-22T17:00:00Z", externalId: 537399 },
  { groupLetter: "J", matchday: 2, homeCode: "JOR", awayCode: "ALG", kickoffAt: "2026-06-23T03:00:00Z", externalId: 537400 },
  { groupLetter: "J", matchday: 3, homeCode: "JOR", awayCode: "ARG", kickoffAt: "2026-06-28T02:00:00Z", externalId: 537401 },
  { groupLetter: "J", matchday: 3, homeCode: "ALG", awayCode: "AUT", kickoffAt: "2026-06-28T02:00:00Z", externalId: 537402 },

  // Group K
  { groupLetter: "K", matchday: 1, homeCode: "POR", awayCode: "COD", kickoffAt: "2026-06-17T17:00:00Z", externalId: 537403 },
  { groupLetter: "K", matchday: 1, homeCode: "UZB", awayCode: "COL", kickoffAt: "2026-06-18T02:00:00Z", externalId: 537404 },
  { groupLetter: "K", matchday: 2, homeCode: "POR", awayCode: "UZB", kickoffAt: "2026-06-23T17:00:00Z", externalId: 537405 },
  { groupLetter: "K", matchday: 2, homeCode: "COL", awayCode: "COD", kickoffAt: "2026-06-24T02:00:00Z", externalId: 537406 },
  { groupLetter: "K", matchday: 3, homeCode: "COL", awayCode: "POR", kickoffAt: "2026-06-27T23:30:00Z", externalId: 537407 },
  { groupLetter: "K", matchday: 3, homeCode: "COD", awayCode: "UZB", kickoffAt: "2026-06-27T23:30:00Z", externalId: 537408 },

  // Group L
  { groupLetter: "L", matchday: 1, homeCode: "ENG", awayCode: "CRO", kickoffAt: "2026-06-17T20:00:00Z", externalId: 537409 },
  { groupLetter: "L", matchday: 1, homeCode: "GHA", awayCode: "PAN", kickoffAt: "2026-06-17T23:00:00Z", externalId: 537410 },
  { groupLetter: "L", matchday: 2, homeCode: "ENG", awayCode: "GHA", kickoffAt: "2026-06-23T20:00:00Z", externalId: 537411 },
  { groupLetter: "L", matchday: 2, homeCode: "PAN", awayCode: "CRO", kickoffAt: "2026-06-23T23:00:00Z", externalId: 537412 },
  { groupLetter: "L", matchday: 3, homeCode: "PAN", awayCode: "ENG", kickoffAt: "2026-06-27T21:00:00Z", externalId: 537413 },
  { groupLetter: "L", matchday: 3, homeCode: "CRO", awayCode: "GHA", kickoffAt: "2026-06-27T21:00:00Z", externalId: 537414 },
];

/**
 * @deprecated Use WC2026_GROUP_MATCHES instead — this is kept for backward compatibility.
 * Returns MatchTemplate[] compatible with old initTournament shape.
 */
export interface MatchTemplate {
  groupLetter: string;
  matchday: 1 | 2 | 3;
  homeCode: string;
  awayCode: string;
}

export function generateGroupStageTemplates(): MatchTemplate[] {
  return WC2026_GROUP_MATCHES;
}

/**
 * Kickoff times for group stage — returns real UTC date from WC2026_GROUP_MATCHES.
 * The old index-based signature is kept for compatibility but is no longer used for match creation.
 */
export function groupStageKickoff(groupLetter: string, matchday: number, matchIndex: number): Date {
  const match = WC2026_GROUP_MATCHES.find(
    (m) => m.groupLetter === groupLetter && m.matchday === matchday
  );
  return match ? new Date(match.kickoffAt) : new Date("2026-06-11T18:00:00Z");
}

/** Top scorer candidates — top 10 by bookmaker odds */
export const GOLDEN_BOOT_CANDIDATES = [
  { playerName: "Kylian Mbappé", teamCode: "FRA", odds: 600 },
  { playerName: "Erling Haaland", teamCode: "NOR", odds: 800 },
  { playerName: "Vinicius Jr.", teamCode: "BRA", odds: 900 },
  { playerName: "Harry Kane", teamCode: "ENG", odds: 1000 },
  { playerName: "Lautaro Martínez", teamCode: "ARG", odds: 1200 },
  { playerName: "Bukayo Saka", teamCode: "ENG", odds: 1400 },
  { playerName: "Jude Bellingham", teamCode: "ENG", odds: 1500 },
  { playerName: "Rodrygo", teamCode: "BRA", odds: 1800 },
  { playerName: "Lionel Messi", teamCode: "ARG", odds: 2000 },
  { playerName: "Romelu Lukaku", teamCode: "BEL", odds: 2500 },
] as const;

/**
 * R32 bracket seeding for 48-team World Cup.
 * 32 teams advance: 12 group winners + 12 runners-up + 8 best 3rd-place.
 */
export const R32_MATCHUPS: Array<{ home: string; away: string }> = [
  { home: "1A", away: "3_0" },
  { home: "2D", away: "2E" },
  { home: "1B", away: "3_1" },
  { home: "2C", away: "2F" },
  { home: "1C", away: "3_2" },
  { home: "2A", away: "2H" },
  { home: "1D", away: "3_3" },
  { home: "2B", away: "2G" },
  { home: "1E", away: "3_4" },
  { home: "2J", away: "2K" },
  { home: "1F", away: "3_5" },
  { home: "2I", away: "2L" },
  { home: "1G", away: "3_6" },
  { home: "1H", away: "3_7" },
  { home: "1I", away: "1J" },
  { home: "1K", away: "1L" },
];

/**
 * Knockout kickoff times.
 * R32: Jul 2–5 (4/day), R16: Jul 6–9 (2/day), QF: Jul 10–11 (2/day),
 * SF: Jul 13–14 (1/day), Final: Jul 19
 */
export function knockoutKickoff(phase: string, matchIndex: number): Date {
  const bases: Record<string, string> = {
    R32: "2026-07-02T18:00:00Z",
    R16: "2026-07-06T18:00:00Z",
    QF: "2026-07-10T18:00:00Z",
    SF: "2026-07-13T18:00:00Z",
    FINAL: "2026-07-19T18:00:00Z",
  };
  const perDay: Record<string, number> = { R32: 4, R16: 2, QF: 2, SF: 1, FINAL: 1 };

  const base = new Date(bases[phase] ?? bases.R32);
  const matchesPerDay = perDay[phase] ?? 2;
  const dayOffset = Math.floor(matchIndex / matchesPerDay);
  const hourOffset = (matchIndex % matchesPerDay) * 3;
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(d.getHours() + hourOffset);
  return d;
}

/** Pre-tournament standard bet types */
export const PRE_TOURNAMENT_BET_TYPES = [
  {
    subType: "winner",
    name: "Tournament Winner",
    description: "Pick the team that will lift the World Cup trophy. Higher odds = bigger payout.",
    category: "PRE_TOURNAMENT" as const,
  },
  {
    subType: "runner_up",
    name: "Runner Up",
    description: "Pick the team that reaches the final but loses. Scores separately from the winner bet.",
    category: "PRE_TOURNAMENT" as const,
  },
  {
    subType: "golden_boot",
    name: "Golden Boot",
    description: "Pick the tournament's top scorer. Points are odds-scaled — backing a longshot pays more.",
    category: "PRE_TOURNAMENT" as const,
  },
  {
    subType: "group_predictions",
    name: "Group Predictions",
    description: "For each group, pick the winner and the teams that advance. 12 group winners + 20 advancing teams. Points awarded per correct pick, scaled by how unlikely the pick was.",
    category: "PRE_TOURNAMENT" as const,
  },
  {
    subType: "dark_horse",
    name: "Dark Horse",
    description: "Pick an underdog (odds > 20/1) that will reach the quarter-finals. Big points for correct calls — only long-shot teams are eligible.",
    category: "PRE_TOURNAMENT" as const,
  },
  {
    subType: "reverse_dark_horse",
    name: "Reverse Dark Horse",
    description: "Pick a favourite (top 15 by odds) that will be knocked out in the group stage. Backing a big name to crash out early pays big.",
    category: "PRE_TOURNAMENT" as const,
  },
] as const;

/** Milestone bet types — created at init but open at different tournament stages */
export const MILESTONE_BET_TYPES = [
  {
    subType: "bracket",
    name: "Knockout Bracket",
    description: "Predict the full knockout bracket — who advances through every round from R32 to the final.",
    category: "MILESTONE" as const,
  },
  {
    subType: "golden_glove",
    name: "Golden Glove",
    description: "Pick the goalkeeper awarded the Golden Glove for the best performance of the tournament.",
    category: "MILESTONE" as const,
  },
  {
    subType: "golden_ball",
    name: "Golden Ball",
    description: "Pick the player awarded the Golden Ball — given to the tournament's best overall player.",
    category: "MILESTONE" as const,
  },
  {
    subType: "semifinalists",
    name: "Semifinalists",
    description: "Pick the 4 teams that reach the semi-finals. Opens after the Round of 32, locks before the Round of 16.",
    category: "MILESTONE" as const,
  },
] as const;
