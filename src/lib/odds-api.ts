/**
 * The Odds API client — https://the-odds-api.com
 *
 * Free tier: 500 requests/month. Covers:
 *   - Outrights (tournament winner) via `soccer_fifa_world_cup_winner`
 *   - Match h2h/spreads/totals via `soccer_fifa_world_cup`
 *
 * Markets may be empty until bookmakers post lines (typically ~weeks before kickoff).
 * Callers should fall back to static odds when `data.length === 0`.
 */

const API_BASE = "https://api.the-odds-api.com/v4";

export interface BookmakerOutcome {
  name: string; // Team name, e.g. "Brazil"
  price: number; // Decimal odds, e.g. 7.5
}

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string; // ISO
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    markets: Array<{
      key: string; // "h2h" | "outrights" | ...
      outcomes: BookmakerOutcome[];
    }>;
  }>;
}

function apiKey(): string | null {
  return process.env.ODDS_API_KEY || null;
}

async function get<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;

  const qs = new URLSearchParams({ apiKey: key, ...params });
  const res = await fetch(`${API_BASE}${path}?${qs}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`[odds-api] ${path} failed: ${res.status}`, await res.text());
    return null;
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch tournament winner outrights. Returns median decimal odds per team name
 * across all bookmakers, or null if unavailable.
 */
export async function fetchTournamentWinnerOdds(): Promise<Record<string, number> | null> {
  const events = await get<OddsApiEvent[]>("/sports/soccer_fifa_world_cup_winner/odds", {
    regions: "uk,eu,us",
    markets: "outrights",
    oddsFormat: "decimal",
  });
  if (!events || events.length === 0) return null;

  // Aggregate: for each team, collect all quoted prices and take the median.
  const byTeam: Record<string, number[]> = {};
  for (const ev of events) {
    for (const bk of ev.bookmakers) {
      for (const mkt of bk.markets) {
        if (mkt.key !== "outrights") continue;
        for (const o of mkt.outcomes) {
          (byTeam[o.name] ??= []).push(o.price);
        }
      }
    }
  }

  const medians: Record<string, number> = {};
  for (const [name, prices] of Object.entries(byTeam)) {
    prices.sort((a, b) => a - b);
    medians[name] = prices[Math.floor(prices.length / 2)];
  }
  return Object.keys(medians).length > 0 ? medians : null;
}

/**
 * Fetch upcoming match h2h odds. Returns a map keyed by `${home}__${away}` with
 * median decimal odds across bookmakers, or null if unavailable.
 */
export interface LiveMatchOdds {
  commenceTime: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  /** Implied probability that total goals > 2.5, if a totals market was quoted. */
  overUnderLine?: number; // e.g. 2.5
  overProb?: number; // 0..1, de-vigged
}

export async function fetchMatchOdds(): Promise<Record<string, LiveMatchOdds> | null> {
  const events = await get<OddsApiEvent[]>("/sports/soccer_fifa_world_cup/odds", {
    regions: "uk,eu,us",
    markets: "h2h,totals",
    oddsFormat: "decimal",
  });
  if (!events || events.length === 0) return null;

  const median = (xs: number[]) => {
    if (xs.length === 0) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  const out: Record<string, LiveMatchOdds> = {};

  for (const ev of events) {
    const h2h = { home: [] as number[], draw: [] as number[], away: [] as number[] };
    // Totals keyed by line (usually 2.5, but can be 2.75, 3.0, etc.)
    const totals: Record<string, { over: number[]; under: number[] }> = {};

    for (const bk of ev.bookmakers) {
      for (const mkt of bk.markets) {
        if (mkt.key === "h2h") {
          for (const o of mkt.outcomes) {
            if (o.name === ev.home_team) h2h.home.push(o.price);
            else if (o.name === ev.away_team) h2h.away.push(o.price);
            else h2h.draw.push(o.price);
          }
        } else if (mkt.key === "totals") {
          for (const o of mkt.outcomes as Array<BookmakerOutcome & { point?: number }>) {
            if (o.point == null) continue;
            const key = String(o.point);
            (totals[key] ??= { over: [], under: [] });
            if (o.name === "Over") totals[key].over.push(o.price);
            else if (o.name === "Under") totals[key].under.push(o.price);
          }
        }
      }
    }

    const homeWin = median(h2h.home);
    const draw = median(h2h.draw);
    const awayWin = median(h2h.away);
    if (isNaN(homeWin) || isNaN(draw) || isNaN(awayWin)) continue;

    // Pick the totals line closest to 2.5 (the standard soccer line).
    let overUnderLine: number | undefined;
    let overProb: number | undefined;
    let bestDist = Infinity;
    for (const [lineStr, { over, under }] of Object.entries(totals)) {
      if (over.length === 0 || under.length === 0) continue;
      const line = parseFloat(lineStr);
      const dist = Math.abs(line - 2.5);
      if (dist >= bestDist) continue;
      const overPrice = median(over);
      const underPrice = median(under);
      // Remove vig: normalize implied probs to sum to 1.
      const pOverRaw = 1 / overPrice;
      const pUnderRaw = 1 / underPrice;
      const total = pOverRaw + pUnderRaw;
      if (total <= 0) continue;
      overUnderLine = line;
      overProb = pOverRaw / total;
      bestDist = dist;
    }

    out[`${ev.home_team}__${ev.away_team}`] = {
      commenceTime: ev.commence_time,
      homeWin,
      draw,
      awayWin,
      overUnderLine,
      overProb,
    };
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function isConfigured(): boolean {
  return apiKey() !== null;
}
