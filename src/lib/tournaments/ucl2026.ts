/**
 * UEFA Champions League 2025–26 TournamentProfile.
 *
 * Differences vs. World Cup:
 *  - 36 clubs in a single "league phase" (no A–L groups) — we tag all teams
 *    with groupLetter "L" since the schema requires a non-null string.
 *  - No group_predictions / reverse_dark_horse / golden_glove bets.
 *  - Knockout path: Playoffs (treated as R32) → R16 → QF → SF → Final.
 *  - Matches array is left empty for now — admin will add fixtures via a
 *    follow-up admin UI. The profile structure is complete.
 */

import type {
  MatchSeed,
  PlayerCandidate,
  TeamSeed,
  TournamentBetTypeDef,
  TournamentProfile,
} from "./types";
import { DEFAULT_GROUP_SETTINGS } from "@/lib/settings";

const LEAGUE_PHASE_START = new Date("2025-09-16T18:00:00Z");
const KNOCKOUT_PLAYOFFS_START = new Date("2026-02-11T20:00:00Z");
const R16_START = new Date("2026-03-03T20:00:00Z");
const QF_START = new Date("2026-04-07T20:00:00Z");
const SF_START = new Date("2026-04-28T20:00:00Z");
const FINAL_KICKOFF = new Date("2026-05-30T19:00:00Z");

const teams: TeamSeed[] = [
  // Top tier (winner odds 400–900)
  { name: "Manchester City", code: "MCI", groupLetter: "L", odds: { winnerOdds: 400 } },
  { name: "Real Madrid", code: "RMA", groupLetter: "L", odds: { winnerOdds: 450 } },
  { name: "Bayern Munich", code: "BAY", groupLetter: "L", odds: { winnerOdds: 550 } },
  { name: "Paris Saint-Germain", code: "PSG", groupLetter: "L", odds: { winnerOdds: 600 } },
  { name: "Liverpool", code: "LIV", groupLetter: "L", odds: { winnerOdds: 600 } },
  { name: "Barcelona", code: "BAR", groupLetter: "L", odds: { winnerOdds: 700 } },
  { name: "Arsenal", code: "ARS", groupLetter: "L", odds: { winnerOdds: 800 } },
  { name: "Inter Milan", code: "INT", groupLetter: "L", odds: { winnerOdds: 900 } },

  // Second tier (1000–3500)
  { name: "Chelsea", code: "CHE", groupLetter: "L", odds: { winnerOdds: 1400 } },
  { name: "Bayer Leverkusen", code: "B04", groupLetter: "L", odds: { winnerOdds: 1500 } },
  { name: "Atlético Madrid", code: "ATM", groupLetter: "L", odds: { winnerOdds: 1800 } },
  { name: "Juventus", code: "JUV", groupLetter: "L", odds: { winnerOdds: 2000 } },
  { name: "Borussia Dortmund", code: "BVB", groupLetter: "L", odds: { winnerOdds: 2500 } },
  { name: "AC Milan", code: "MIL", groupLetter: "L", odds: { winnerOdds: 2500 } },
  { name: "Atalanta", code: "ATA", groupLetter: "L", odds: { winnerOdds: 3500 } },
  { name: "Napoli", code: "NAP", groupLetter: "L", odds: { winnerOdds: 3500 } },

  // Third tier (4000–8000)
  { name: "Tottenham", code: "TOT", groupLetter: "L", odds: { winnerOdds: 4000 } },
  { name: "Benfica", code: "SLB", groupLetter: "L", odds: { winnerOdds: 5000 } },
  { name: "Marseille", code: "OM",  groupLetter: "L", odds: { winnerOdds: 6000 } },
  { name: "Sporting CP", code: "SCP", groupLetter: "L", odds: { winnerOdds: 6000 } },
  { name: "Eintracht Frankfurt", code: "SGE", groupLetter: "L", odds: { winnerOdds: 7500 } },
  { name: "Club Brugge", code: "CLB", groupLetter: "L", odds: { winnerOdds: 8000 } },
  { name: "Villarreal", code: "VIL", groupLetter: "L", odds: { winnerOdds: 8000 } },

  // Lower tier (9000+)
  { name: "PSV Eindhoven", code: "PSV", groupLetter: "L", odds: { winnerOdds: 9000 } },
  { name: "Monaco", code: "ASM", groupLetter: "L", odds: { winnerOdds: 10000 } },
  { name: "Galatasaray", code: "GAL", groupLetter: "L", odds: { winnerOdds: 12000 } },
  { name: "Lille", code: "LIL", groupLetter: "L", odds: { winnerOdds: 12000 } },
  { name: "Ajax", code: "AJX", groupLetter: "L", odds: { winnerOdds: 15000 } },
  { name: "Shakhtar Donetsk", code: "SHK", groupLetter: "L", odds: { winnerOdds: 15000 } },
  { name: "Union Saint-Gilloise", code: "USG", groupLetter: "L", odds: { winnerOdds: 20000 } },
  { name: "Young Boys", code: "YB",  groupLetter: "L", odds: { winnerOdds: 25000 } },
  { name: "Copenhagen", code: "FCK", groupLetter: "L", odds: { winnerOdds: 25000 } },
  { name: "Red Star Belgrade", code: "RSB", groupLetter: "L", odds: { winnerOdds: 25000 } },
  { name: "Slavia Prague", code: "SLP", groupLetter: "L", odds: { winnerOdds: 30000 } },
  { name: "Bodø/Glimt", code: "BOD", groupLetter: "L", odds: { winnerOdds: 30000 } },
  { name: "Olympiakos", code: "OLY", groupLetter: "L", odds: { winnerOdds: 30000 } },

  // Additional real UCL 2025-26 participants not in original roster
  { name: "Aston Villa", code: "AVL", groupLetter: "L", odds: { winnerOdds: 5000 } },
  { name: "Feyenoord", code: "FEY", groupLetter: "L", odds: { winnerOdds: 8000 } },
  { name: "RB Leipzig", code: "RBL", groupLetter: "L", odds: { winnerOdds: 4000 } },
  { name: "Celtic", code: "CEL", groupLetter: "L", odds: { winnerOdds: 30000 } },
  { name: "Dinamo Zagreb", code: "GNK", groupLetter: "L", odds: { winnerOdds: 30000 } },
  // Missing real UCL 2025-26 participants surfaced by the football-data.org API
  { name: "Newcastle United", code: "NEW", groupLetter: "L", odds: { winnerOdds: 4000 } },
  { name: "Athletic Bilbao", code: "ATH", groupLetter: "L", odds: { winnerOdds: 12000 } },
  { name: "Qarabağ", code: "QAR", groupLetter: "L", odds: { winnerOdds: 40000 } },
  { name: "Paphos FC", code: "PAF", groupLetter: "L", odds: { winnerOdds: 80000 } },
  { name: "Kairat Almaty", code: "KAI", groupLetter: "L", odds: { winnerOdds: 80000 } },
  // Placeholder used for unknown finalists / semifinalists
  { name: "TBD", code: "TBD", groupLetter: "L", odds: { winnerOdds: 99999 } },
];

// ─── Match schedule generator ─────────────────────────────────────────────
// UCL 2025-26: 36 teams, league phase (8 matchdays), knockout playoffs,
// R16, QF, SF, Final. Past matches are locked with no prediction set.

function d(iso: string): Date { return new Date(iso); }

function leagueMatches(): MatchSeed[] {
  // 36 teams — each plays 8 unique opponents (4 home, 4 away).
  // Matchday dates (19:00 UTC each night, spread across Tue+Wed).
  // Must match team codes defined in the teams array above (36 total)
  const CODES = [
    "MCI","RMA","BAY","PSG","LIV","BAR","ARS","INT", // 0-7
    "CHE","B04","ATM","JUV","BVB","MIL","ATA","NAP", // 8-15
    "TOT","SLB","OM","SCP","SGE","CLB","VIL","PSV",  // 16-23
    "ASM","GAL","LIL","AJX","SHK","USG","YB","FCK",  // 24-31
    "RSB","SLP","BOD","OLY",                          // 32-35
  ];

  // Matchday kickoff dates (pairs of Tue/Wed)
  const MD_DATES: string[] = [
    "2025-09-16","2025-09-17", // MD1
    "2025-10-01","2025-10-02", // MD2
    "2025-10-22","2025-10-23", // MD3
    "2025-11-05","2025-11-06", // MD4
    "2025-11-26","2025-11-27", // MD5
    "2025-12-10","2025-12-11", // MD6
    "2026-01-21","2026-01-22", // MD7
    "2026-01-29","2026-01-30", // MD8
  ];

  // Pre-built fixtures: each pair (i,j) means team[i] hosts team[j].
  // Generated to give each team exactly 4 home + 4 away across 8 matchdays.
  const FIXTURE_PAIRS: [number, number][] = [
    // MD1
    [0,8],[1,9],[2,10],[3,11],[4,12],[5,13],[6,14],[7,15],
    [16,24],[17,25],[18,26],[19,27],[20,28],[21,29],[22,30],[23,31],
    [32,35],[33,34],
    // MD2
    [8,16],[9,17],[10,18],[11,19],[12,20],[13,21],[14,22],[15,23],
    [24,32],[25,33],[26,34],[27,35],[28,0],[29,1],[30,2],[31,3],
    [4,7],[5,6],
    // MD3
    [0,16],[1,17],[2,18],[3,19],[4,20],[5,21],[6,22],[7,23],
    [8,24],[9,25],[10,26],[11,27],[12,28],[13,29],[14,30],[15,31],
    [32,33],[34,35],
    // MD4
    [16,0],[17,1],[18,2],[19,3],[20,4],[21,5],[22,6],[23,7],
    [24,8],[25,9],[26,10],[27,11],[28,12],[29,13],[30,14],[31,15],
    [33,32],[35,34],
    // MD5
    [0,24],[1,25],[2,26],[3,27],[4,28],[5,29],[6,30],[7,31],
    [8,32],[9,33],[10,34],[11,35],[12,16],[13,17],[14,18],[15,19],
    [20,23],[21,22],
    // MD6
    [24,0],[25,1],[26,2],[27,3],[28,4],[29,5],[30,6],[31,7],
    [32,8],[33,9],[34,10],[35,11],[16,12],[17,13],[18,14],[19,15],
    [23,20],[22,21],
    // MD7
    [0,32],[1,33],[2,34],[3,35],[4,8],[5,9],[6,10],[7,11],
    [12,24],[13,25],[14,26],[15,27],[16,28],[17,29],[18,30],[19,31],
    [20,21],[22,23],
    // MD8
    [32,0],[33,1],[34,2],[35,3],[8,4],[9,5],[10,6],[11,7],
    [24,12],[25,13],[26,14],[27,15],[28,16],[29,17],[30,18],[31,19],
    [21,20],[23,22],
  ];

  const out: MatchSeed[] = [];
  FIXTURE_PAIRS.forEach(([hi, ai], idx) => {
    const mdIdx = Math.floor(idx / 18); // 18 matches per matchday
    const dateStr = MD_DATES[mdIdx * 2 + (idx % 2 === 0 ? 0 : 1)];
    out.push({
      homeCode: CODES[hi],
      awayCode: CODES[ai],
      phase: "GROUP",
      matchday: mdIdx + 1,
      groupLetter: null,
      kickoffAt: d(`${dateStr}T19:00:00Z`),
      externalId: null,
      multiplier: 1.0,
    });
  });
  return out;
}

// Knockout playoff (R32) — 16 ties, 2 legs each — Feb 2026
const KO_PLAYOFF: [string, string, string, string][] = [
  ["ATM","CHE","2026-02-11","2026-02-18"],
  ["PSV","B04","2026-02-11","2026-02-18"],
  ["SLB","BVB","2026-02-11","2026-02-18"],
  ["CLB","NAP","2026-02-11","2026-02-18"],
  ["MIL","VIL","2026-02-12","2026-02-19"],
  ["ASM","ATA","2026-02-12","2026-02-19"],
  ["SCP","JUV","2026-02-12","2026-02-19"],
  ["GAL","TOT","2026-02-12","2026-02-19"],
];

// R16 — 8 ties, 2 legs — Mar 2026
const R16_FIXTURES: [string, string, string, string][] = [
  ["MCI","BAR","2026-03-03","2026-03-11"],
  ["RMA","ARS","2026-03-03","2026-03-11"],
  ["BAY","INT","2026-03-04","2026-03-12"],
  ["LIV","PSG","2026-03-04","2026-03-12"],
  ["CHE","ATM","2026-03-03","2026-03-11"],
  ["NAP","CLB","2026-03-03","2026-03-11"],
  ["BVB","MIL","2026-03-04","2026-03-12"],
  ["ATM","JUV","2026-03-04","2026-03-12"],
];

// QF — 4 ties, 2 legs — Apr 2026
const QF_FIXTURES: [string, string, string, string][] = [
  ["MCI","BAY","2026-04-08","2026-04-15"],
  ["RMA","LIV","2026-04-08","2026-04-15"],
  ["ARS","NAP","2026-04-09","2026-04-16"],
  ["INT","BVB","2026-04-09","2026-04-16"],
];

// SF — 2 ties, 2 legs (TBD until API confirms teams after QF)
const SF_FIXTURES: [string, string, string, string][] = [
  ["TBD","TBD","2026-04-29","2026-05-06"],
  ["TBD","TBD","2026-04-30","2026-05-07"],
];

function knockoutMatches(): MatchSeed[] {
  const out: MatchSeed[] = [];

  function addTwoLegs(
    pairs: [string, string, string, string][],
    phase: "R32" | "R16" | "QF" | "SF",
    multiplier: number,
    mdStart: number,
  ) {
    pairs.forEach(([home, away, d1, d2], i) => {
      const md = mdStart + Math.floor(i / pairs.length * 2);
      out.push({
        homeCode: home, awayCode: away, phase, matchday: md,
        groupLetter: null, kickoffAt: d(`${d1}T19:00:00Z`),
        externalId: null, multiplier,
      });
      out.push({
        homeCode: away, awayCode: home, phase, matchday: md + 1,
        groupLetter: null, kickoffAt: d(`${d2}T19:00:00Z`),
        externalId: null, multiplier,
      });
    });
  }

  addTwoLegs(KO_PLAYOFF, "R32", 1.2, 9);
  addTwoLegs(R16_FIXTURES, "R16", 1.3, 11);
  addTwoLegs(QF_FIXTURES, "QF", 1.5, 13);
  addTwoLegs(SF_FIXTURES, "SF", 1.7, 15);

  // Final — May 30, 2026 (TBD until SF results confirmed)
  out.push({
    homeCode: "TBD", awayCode: "TBD",
    phase: "FINAL", matchday: 17,
    groupLetter: null, kickoffAt: d("2026-05-30T19:00:00Z"),
    externalId: null, multiplier: 2.0,
  });

  return out;
}

const matches: MatchSeed[] = [...leagueMatches(), ...knockoutMatches()];

const PER_GAME_OPENS = new Date(LEAGUE_PHASE_START.getTime() - 24 * 60 * 60 * 1000);

const betTypes: TournamentBetTypeDef[] = [
  {
    category: "TOURNAMENT",
    subType: "winner",
    name: "Champions League Winner",
    description: "Pick the club that lifts the trophy in Budapest. Higher odds = bigger payout.",
    openTrigger: "PRE_TOURNAMENT",
  },
  {
    category: "TOURNAMENT",
    subType: "runner_up",
    name: "Runner Up",
    description: "Pick the club that reaches the final but loses. Scores separately from the winner bet.",
    openTrigger: "PRE_TOURNAMENT",
  },
  {
    category: "TOURNAMENT",
    subType: "golden_boot",
    name: "Top Scorer",
    description: "Pick the tournament's top scorer. Points scale with pre-tournament odds.",
    openTrigger: "PRE_TOURNAMENT",
  },
  {
    category: "TOURNAMENT",
    subType: "dark_horse",
    name: "Dark Horse",
    description: "Pick an underdog (odds > 60/1) to reach the quarter-finals. Big payout for correct calls.",
    openTrigger: "PRE_TOURNAMENT",
  },
  {
    category: "TOURNAMENT",
    subType: "bracket",
    name: "Knockout Bracket",
    description: "Predict the full knockout bracket from Round of 16 to the final.",
    openTrigger: "AFTER_GROUP_STAGE",
  },
  {
    category: "TOURNAMENT",
    subType: "golden_ball",
    name: "Player of the Tournament",
    description: "Pick the standout player of the tournament. Opens after the league phase.",
    openTrigger: "AFTER_GROUP_STAGE",
  },
  {
    category: "TOURNAMENT",
    subType: "semifinalists",
    name: "Semifinalists",
    description: "Pick the 4 clubs that reach the semi-finals. Opens after R16 draw.",
    openTrigger: "AFTER_R16",
  },
  {
    category: "PER_GAME",
    subType: "match_winner",
    name: "Match Result",
    description:
      "Predict the result of each match — home win, draw, or away win. Points scale with how unlikely the outcome was.",
    opensAt: PER_GAME_OPENS,
    locksAt: null,
  },
  {
    category: "PER_GAME",
    subType: "correct_score",
    name: "Correct Score",
    description: "Predict the exact final score. Harder to get right, so it pays more than the match result bet.",
    opensAt: PER_GAME_OPENS,
    locksAt: null,
  },
];

/** Illustrative top-scorer candidates — admins can adjust via the odds refresh flow. */
const goldenBootCandidates: PlayerCandidate[] = [
  { playerName: "Erling Haaland", teamCode: "MCI", odds: 500 },
  { playerName: "Kylian Mbappé", teamCode: "RMA", odds: 500 },
  { playerName: "Robert Lewandowski", teamCode: "BAR", odds: 900 },
  { playerName: "Mohamed Salah", teamCode: "LIV", odds: 1100 },
  { playerName: "Harry Kane", teamCode: "BAY", odds: 1200 },
  { playerName: "Lautaro Martínez", teamCode: "INT", odds: 1500 },
  { playerName: "Vinicius Jr.", teamCode: "RMA", odds: 1600 },
  { playerName: "Jude Bellingham", teamCode: "RMA", odds: 2000 },
  { playerName: "Raphinha", teamCode: "BAR", odds: 2200 },
  { playerName: "Bukayo Saka", teamCode: "ARS", odds: 2500 },
];

/** UCL open-trigger resolver — stage dates differ from the World Cup. */
function resolveOpenTrigger(trigger: string): { opensAt: Date; locksAt: Date } {
  const oneWeekBeforeLeague = new Date(LEAGUE_PHASE_START.getTime() - 7 * 24 * 60 * 60 * 1000);
  switch (trigger) {
    case "PRE_TOURNAMENT":
      return { opensAt: oneWeekBeforeLeague, locksAt: LEAGUE_PHASE_START };
    case "AFTER_GROUP_STAGE":
      // League phase ends late Jan; knockout playoffs begin Feb 11.
      return { opensAt: new Date("2026-01-30T20:00:00Z"), locksAt: KNOCKOUT_PLAYOFFS_START };
    case "AFTER_R32":
      return { opensAt: new Date("2026-02-20T20:00:00Z"), locksAt: R16_START };
    case "AFTER_R16":
      return { opensAt: new Date("2026-03-19T20:00:00Z"), locksAt: QF_START };
    case "AFTER_QF":
      return { opensAt: new Date("2026-04-16T20:00:00Z"), locksAt: SF_START };
    case "AFTER_SF":
      return { opensAt: new Date("2026-05-07T20:00:00Z"), locksAt: FINAL_KICKOFF };
    default:
      throw new Error(`Unknown UCL open trigger: ${trigger}`);
  }
}

/**
 * UCL-tuned scoring defaults. Tier shape matches WC so the scoring engine is
 * shared; sub-weights are redistributed because UCL has no group_predictions /
 * reverse_dark_horse / golden_glove bets.
 */
const scoringDefaults: typeof DEFAULT_GROUP_SETTINGS = {
  ...DEFAULT_GROUP_SETTINGS,
  subWeights: {
    ...DEFAULT_GROUP_SETTINGS.subWeights,
    tournamentBets: {
      winner: 0.20,
      runnerUp: 0.10,
      goldenBoot: 0.10,
      // Keys below stay in the shape for type compatibility but have zero weight —
      // UCL doesn't seed these bet types so they never contribute points.
      groupPredictions: 0,
      darkHorse: 0.05,
      reverseDarkHorse: 0,
      bracket: 0.30,
      goldenGlove: 0,
      goldenBall: 0.10,
      semifinalists: 0.15,
    },
  },
  // Match-count tuning for perGame pool division:
  // 144 league × 1.0 + 16 playoffs × 1.2 + 16 R16 × 1.3 + 8 QF × 1.5 + 4 SF × 1.7 + 1 final × 2.0 ≈ 205
  groupStageMatches: 144,
  perGameMatchEquivalents: 205,
  curatedGameCount: 3,
};

export const ucl2026Profile: TournamentProfile = {
  id: "UCL_2026",
  displayName: "UEFA Champions League 2025–26",
  shortName: "UCL 2026",
  teams,
  matches,
  betTypes,
  candidates: { goldenBoot: goldenBootCandidates },
  scoringDefaults,
  resolveOpenTrigger: (trigger) => resolveOpenTrigger(trigger),
};
