// ESPN public scoreboard fallback — used when football-data.org's feed is stale
// (e.g. match has kicked off in reality but their API still reports SCHEDULED/TIMED).
// We only use ESPN for displaying live state; finished-match scoring continues to
// go through football-data.org so penalties / regulation-time handling stays
// authoritative via regulationScore().

export interface EspnLiveScore {
  home: number | null;
  away: number | null;
  status: "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "OTHER";
  minute: number | null;
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  team: { abbreviation?: string; displayName?: string };
  score?: string;
}

interface EspnEvent {
  id: string;
  date: string;
  status?: {
    displayClock?: string;
    period?: number;
    type?: { state?: string; description?: string; completed?: boolean };
  };
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
}

interface EspnScoreboard {
  events?: EspnEvent[];
}

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

// Short in-memory cache. Polls from all clients hit the same warm function
// instance for a few seconds; this prevents fan-out hammering ESPN per match.
const CACHE_TTL_MS = 30_000;
const scoreboardCache = new Map<string, { fetchedAt: number; events: EspnEvent[] }>();

function fmtUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchScoreboard(dateStr: string): Promise<EspnEvent[]> {
  const cached = scoreboardCache.get(dateStr);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.events;

  const res = await fetch(`${BASE}?dates=${dateStr}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  const data = (await res.json()) as EspnScoreboard;
  const events = data.events ?? [];
  scoreboardCache.set(dateStr, { fetchedAt: Date.now(), events });
  return events;
}

function findMatch(events: EspnEvent[], homeCode: string, awayCode: string): EspnEvent | undefined {
  return events.find((e) => {
    const teams = e.competitions?.[0]?.competitors ?? [];
    const home = teams.find((t) => t.homeAway === "home")?.team.abbreviation;
    const away = teams.find((t) => t.homeAway === "away")?.team.abbreviation;
    return home === homeCode && away === awayCode;
  });
}

function eventToLiveScore(e: EspnEvent): EspnLiveScore {
  const t = e.status?.type ?? {};
  const teams = e.competitions?.[0]?.competitors ?? [];
  const home = teams.find((c) => c.homeAway === "home");
  const away = teams.find((c) => c.homeAway === "away");
  const homeScoreRaw = home?.score != null ? parseInt(home.score, 10) : NaN;
  const awayScoreRaw = away?.score != null ? parseInt(away.score, 10) : NaN;

  let status: EspnLiveScore["status"];
  if (t.completed || t.state === "post") status = "FINISHED";
  else if (t.state === "in") {
    status = (t.description ?? "").toLowerCase().includes("halftime") ? "PAUSED" : "IN_PLAY";
  } else if (t.state === "pre") status = "SCHEDULED";
  else status = "OTHER";

  const minuteMatch = e.status?.displayClock?.match(/(\d+)/);
  const minute = minuteMatch ? parseInt(minuteMatch[1], 10) : null;

  return {
    home: Number.isNaN(homeScoreRaw) ? null : homeScoreRaw,
    away: Number.isNaN(awayScoreRaw) ? null : awayScoreRaw,
    status,
    minute,
  };
}

/**
 * Try to fetch live match state from ESPN. Returns null if not found or on error.
 * ESPN's scoreboard endpoint groups by US-ET day; we try both the kickoff UTC date
 * and the day before to cover matches that straddle the timezone boundary.
 */
export async function fetchEspnLiveMatch(
  homeCode: string,
  awayCode: string,
  kickoffAt: Date
): Promise<EspnLiveScore | null> {
  const dates = [
    fmtUtcDate(kickoffAt),
    fmtUtcDate(new Date(kickoffAt.getTime() - 24 * 60 * 60 * 1000)),
  ];
  for (const dateStr of dates) {
    try {
      const events = await fetchScoreboard(dateStr);
      const event = findMatch(events, homeCode, awayCode);
      if (event) return eventToLiveScore(event);
    } catch {
      // Try next date / give up.
    }
  }
  return null;
}
