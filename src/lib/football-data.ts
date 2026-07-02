// football-data.org v4 API client
// Module-level cache shared across all server requests on the same instance (55s TTL)

export { FD_CLUB_IDS } from "./fd-club-ids";

export interface FDMatch {
  id: number;
  utcDate: string;
  status:
    | "SCHEDULED"
    | "TIMED"
    | "IN_PLAY"
    | "PAUSED"
    | "FINISHED"
    | "SUSPENDED"
    | "POSTPONED"
    | "CANCELLED"
    | "AWARDED";
  stage: string;
  group: string | null; // e.g. "GROUP_A" for group-stage matches; null for knockout
  matchday: number | null;
  minute: number | null;
  injuryTime: number | null;
  homeTeam: { id: number | null; name: string | null; shortName: string | null; tla: string | null };
  awayTeam: { id: number | null; name: string | null; shortName: string | null; tla: string | null };
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT" | null;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
    // Present only when a match went to ET/penalties; absent on plain 90-min matches.
    regularTime?: { home: number | null; away: number | null };
    extraTime?: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null };
  };
}

export type ScorePair = { home: number; away: number };

/**
 * The four canonical facts about a finished match, in the FEED's home/away orientation.
 * Callers map to their own orientation by team code (an ESPN-created fixture may be reversed).
 *
 *   - score90:  the 90-minute result — the ONLY score bets are graded on.
 *   - scoreFt:  end-of-match score excluding penalties (= 90' for a regular match, 120'
 *               for one that went to extra time). Display "Final".
 *   - pens:     penalty shootout score, or null.
 *   - winner:   who actually advanced (penalties included).
 *   - wentToExtraTime: true if the match went past 90'.
 */
export interface MatchResult {
  score90: ScorePair;
  scoreFt: ScorePair;
  pens: ScorePair | null;
  winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
  wentToExtraTime: boolean;
}

const pair = (p: { home: number | null; away: number | null } | undefined): ScorePair | null =>
  p && p.home != null && p.away != null ? { home: p.home, away: p.away } : null;

/**
 * Derive the complete, coherent result for a finished match — or `null` when the feed is
 * FINISHED but its score breakdown hasn't settled yet (common in the seconds after the
 * final whistle: `regularTime` may arrive as `{home:null,away:null}` before it's filled).
 *
 * Returning `null` is deliberate: it tells the caller to WAIT and retry rather than freeze
 * an incomplete completion. This is the single guard that keeps a match from being marked
 * COMPLETED without a real 90' score (the bug that mis-scored BEL–SEN on its 120' result).
 *
 * v4 feed facts this encodes:
 *   - PENALTY_SHOOTOUT: `fullTime` INCLUDES the shootout, so reconstruct FT from reg+ET.
 *   - EXTRA_TIME:       `fullTime` is the 120' result; `regularTime` is the 90'.
 *   - REGULAR:          `fullTime` is the 90' result; `regularTime` is usually absent.
 */
export function deriveMatchResult(fd: FDMatch): MatchResult | null {
  if (fd.status !== "FINISHED") return null;
  const s = fd.score;
  const wentPast90 = s.duration === "EXTRA_TIME" || s.duration === "PENALTY_SHOOTOUT";

  // 90' score: regularTime when it carries real values; otherwise fullTime, but ONLY for a
  // plain match (a match that went past 90' without a populated regularTime is not ready).
  const reg = pair(s.regularTime);
  const ft = pair(s.fullTime);
  const score90 = reg ?? (wentPast90 ? null : ft);
  if (!score90) return null; // breakdown not ready — retry next tick

  // FT excluding penalties.
  let scoreFt: ScorePair;
  if (s.duration === "PENALTY_SHOOTOUT") {
    scoreFt = { home: score90.home + (s.extraTime?.home ?? 0), away: score90.away + (s.extraTime?.away ?? 0) };
  } else {
    if (!ft) return null;
    scoreFt = ft;
  }

  return {
    score90,
    scoreFt,
    pens: pair(s.penalties),
    winner: s.winner,
    wentToExtraTime: wentPast90 || score90.home !== scoreFt.home || score90.away !== scoreFt.away,
  };
}

const _cache = new Map<string, { data: unknown; at: number }>();
const CACHE_TTL_MS = 55_000;

async function apiFetch<T>(path: string): Promise<T> {
  const cached = _cache.get(path);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data as T;

  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not configured");

  const res = await fetch(`https://api.football-data.org/v4${path}`, {
    headers: { "X-Auth-Token": key },
    cache: "no-store",
  });

  if (res.status === 429) throw new Error("Rate limit — try again shortly");
  if (!res.ok) throw new Error(`football-data.org returned ${res.status}`);

  const data = (await res.json()) as T;
  _cache.set(path, { data, at: Date.now() });
  return data;
}

export async function fetchWCSchedule(): Promise<FDMatch[]> {
  const data = await apiFetch<{ matches: FDMatch[] }>("/competitions/WC/matches");
  return data.matches;
}

export async function fetchCLSchedule(): Promise<FDMatch[]> {
  const data = await apiFetch<{ matches: FDMatch[] }>("/competitions/CL/matches?season=2025");
  return data.matches;
}

export async function fetchLiveMatch(externalId: number): Promise<FDMatch> {
  return apiFetch<FDMatch>(`/matches/${externalId}`);
}

export interface FDStandingRow {
  position: number;
  team: { id: number; name: string; tla: string | null };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface FDStandingGroup {
  stage: string;
  type: string; // "TOTAL"
  group: string | null; // e.g. "GROUP_A"
  table: FDStandingRow[];
}

/** Official group standings (FIFA tiebreakers applied by the provider). */
export async function fetchWCStandings(): Promise<FDStandingGroup[]> {
  const data = await apiFetch<{ standings: FDStandingGroup[] }>("/competitions/WC/standings");
  return data.standings;
}

export interface FDScorer {
  player: { id: number; name: string } | null;
  team: { id: number; name: string; tla: string | null } | null;
  goals: number | null;
  assists: number | null;
}

/** Top scorers — used to resolve the Golden Boot at tournament end. */
export async function fetchWCScorers(): Promise<FDScorer[]> {
  const data = await apiFetch<{ scorers: FDScorer[] }>("/competitions/WC/scorers?limit=50");
  return data.scorers;
}
