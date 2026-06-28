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

type ScorePair = { home: number; away: number };

/**
 * The score that bets are scored on: regulation (90') for group, 90'/120' for knockout,
 * always EXCLUDING the penalty shootout.
 *
 * Verified against the v4 feed: for a PENALTY_SHOOTOUT match `fullTime` INCLUDES the
 * shootout (e.g. a 1–1 ET draw decided 4–2 on pens reports fullTime 5–3), so we must
 * reconstruct from regularTime + extraTime. For REGULAR and EXTRA_TIME matches the
 * shootout never happened, so `fullTime` is already the 90'/120' result.
 */
export function regulationScore(fd: FDMatch): ScorePair | null {
  const s = fd.score;
  if (s.duration === "PENALTY_SHOOTOUT") {
    const reg = s.regularTime;
    if (!reg || reg.home == null || reg.away == null) return null;
    const etH = s.extraTime?.home ?? 0;
    const etA = s.extraTime?.away ?? 0;
    return { home: reg.home + etH, away: reg.away + etA };
  }
  if (s.fullTime.home == null || s.fullTime.away == null) return null;
  return { home: s.fullTime.home, away: s.fullTime.away };
}

/**
 * The 90-minute-only score, even when the match continued into extra time/penalties.
 * `regularTime` is only present on the feed once a match goes past 90', so for plain
 * REGULAR-duration matches we fall back to `fullTime`, which already is the 90' score.
 */
export function ninetyMinuteScore(fd: FDMatch): ScorePair | null {
  const reg = fd.score.regularTime ?? fd.score.fullTime;
  if (reg.home == null || reg.away == null) return null;
  return { home: reg.home, away: reg.away };
}

/**
 * The team that actually advanced (penalties included), mapped to one of the two
 * supplied team codes. Returns null for a true draw (group stage) or unknown winner.
 */
export function fdWinnerCode(
  fd: FDMatch,
  homeCode: string,
  awayCode: string
): string | null {
  if (fd.score.winner === "HOME_TEAM") return homeCode;
  if (fd.score.winner === "AWAY_TEAM") return awayCode;
  return null;
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
