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
  matchday: number | null;
  minute: number | null;
  injuryTime: number | null;
  homeTeam: { id: number; name: string; shortName: string; tla: string };
  awayTeam: { id: number; name: string; shortName: string; tla: string };
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
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
