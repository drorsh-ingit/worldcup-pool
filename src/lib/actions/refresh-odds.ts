"use server";

import { db } from "@/lib/db";
import { Prisma, BetCategory } from "@prisma/client";
import { fetchTournamentWinnerOdds, fetchMatchOdds, fetchPlayerAwardOdds, isConfigured } from "@/lib/odds-api";
import { sendPushToGroup } from "@/lib/push";
import { deriveScoreOdds, impliedTotalGoals } from "@/lib/match-odds";
import { WC2026_API_NAME_TO_CODE, GOLDEN_BALL_CANDIDATES, GOLDEN_GLOVE_CANDIDATES, GOLDEN_BOOT_CANDIDATES } from "@/lib/data/wc2026";

interface RefreshResult {
  refreshed: boolean;
  reason?: string;
  updated?: number;
}

/**
 * Pull tournament-winner odds from The Odds API and update Team.odds.winnerOdds
 * for every team in the tournament. Silently no-ops if API key is missing or
 * the market isn't posted yet.
 */
export async function refreshTournamentWinnerOdds(tournamentId: string): Promise<RefreshResult> {
  if (!isConfigured()) return { refreshed: false, reason: "ODDS_API_KEY not set" };

  const live = await fetchTournamentWinnerOdds();
  if (!live) return { refreshed: false, reason: "No outright market available yet" };

  const teams = await db.team.findMany({ where: { tournamentId } });
  let updated = 0;

  // Build reverse lookup: API team name → decimal odds
  // API names sometimes differ from our team.name — WC2026_API_NAME_TO_CODE handles those.
  const liveByCode: Record<string, number> = {};
  for (const [apiName, decimalOdds] of Object.entries(live)) {
    const code = WC2026_API_NAME_TO_CODE[apiName] ?? null;
    if (code) {
      liveByCode[code] = decimalOdds;
    } else {
      // Fall back to exact name match (most teams match directly)
      liveByCode[`name:${apiName}`] = decimalOdds;
    }
  }

  // First pass: update winnerOdds from live API data
  const teamsWithLive = teams.map((team) => {
    const liveOdds = liveByCode[team.code] ?? liveByCode[`name:${team.name}`] ?? null;
    const existing = (team.odds as Record<string, unknown>) ?? {};
    if (liveOdds != null) {
      updated++;
      return { ...team, odds: { ...existing, winnerOdds: Math.round(liveOdds * 100) } };
    }
    return { ...team, odds: existing };
  });

  // Second pass: derive groupWinnerOdds and qualifyOdds using Bradley-Terry model.
  // Groups teams by groupLetter, computes relative strengths, then simulates
  // group-stage outcomes to get win-group and qualify (top-2-in-group) probabilities.
  const derived = deriveGroupOdds(teamsWithLive);

  // Update teams individually (no wrapping transaction) to avoid deadlocks when
  // concurrent page loads both trigger odds refresh. Each update is idempotent
  // so partial completion is harmless.
  for (const team of teamsWithLive) {
    const groupOdds = derived[team.code];
    const merged = {
      ...team.odds,
      ...(groupOdds ?? {}),
    };
    await db.team.update({
      where: { id: team.id },
      data: { odds: merged as unknown as Prisma.InputJsonValue },
    });
  }

  return { refreshed: true, updated };
}

/**
 * Bradley-Terry derivation of groupWinnerOdds and qualifyOdds from winnerOdds.
 *
 * The Odds API only provides tournament-winner outright odds. We derive the
 * two group-stage odds (win group, qualify from group) by:
 *  1. Computing a relative "strength" for each team: s_i = (100 / winnerOdds_i)^α
 *     where α = 0.5 flattens the power gap (a 100x favourite isn't 100x stronger in a group).
 *  2. Within each 4-team group, running a round-robin simulation using pairwise
 *     Bradley-Terry win probabilities: P(i beats j) = s_i / (s_i + s_j).
 *  3. Enumerating all possible group outcomes (3^6 = 729 for 6 matches between 4 teams)
 *     to compute P(win group) and P(top 2 = qualify) for each team.
 *  4. Converting probabilities back to odds × 100 format.
 *
 * This produces reasonable odds that move in lockstep with the live winner market.
 */
function deriveGroupOdds(
  teams: { code: string; groupLetter: string; odds: Record<string, unknown> }[]
): Record<string, { groupWinnerOdds: number; qualifyOdds: number }> {
  const ALPHA = 0.5;
  const result: Record<string, { groupWinnerOdds: number; qualifyOdds: number }> = {};

  // Group teams by letter
  const groups: Record<string, typeof teams> = {};
  for (const t of teams) {
    if (!t.groupLetter) continue;
    if (!groups[t.groupLetter]) groups[t.groupLetter] = [];
    groups[t.groupLetter].push(t);
  }

  for (const groupTeams of Object.values(groups)) {
    if (groupTeams.length < 2) continue;

    // Compute strengths
    const strengths: Record<string, number> = {};
    for (const t of groupTeams) {
      const wo = (t.odds.winnerOdds as number) ?? 100000;
      strengths[t.code] = Math.pow(100 / Math.max(wo, 1), ALPHA);
    }

    // For a 4-team group, enumerate all 3^6 = 729 outcomes of 6 pairwise matches.
    // Each match has 3 outcomes: team i wins, draw, team j wins.
    // Points: win=3, draw=1, loss=0.
    const codes = groupTeams.map((t) => t.code);
    const n = codes.length;
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairs.push([i, j]);
      }
    }

    // Pairwise probabilities: P(i beats j), P(draw), P(j beats i)
    // Draw probability ~ 25% for group matches, adjusted slightly by strength gap
    const pairProbs: { pWin: number; pDraw: number; pLoss: number }[] = [];
    for (const [i, j] of pairs) {
      const si = strengths[codes[i]];
      const sj = strengths[codes[j]];
      const rawP = si / (si + sj); // Bradley-Terry P(i beats j)
      // Allocate ~25% base draw probability, slightly less for lopsided matchups
      const gap = Math.abs(rawP - 0.5);
      const drawProb = Math.max(0.15, 0.28 - 0.3 * gap);
      const pWin = rawP * (1 - drawProb);
      const pLoss = (1 - rawP) * (1 - drawProb);
      pairProbs.push({ pWin, pDraw: drawProb, pLoss });
    }

    // Accumulate probabilities for each team finishing in each position
    const winGroupProb: Record<string, number> = {};
    const qualifyProb: Record<string, number> = {};
    for (const code of codes) {
      winGroupProb[code] = 0;
      qualifyProb[code] = 0;
    }

    // Enumerate all outcomes: each match has 3 possible results
    const totalCombos = Math.pow(3, pairs.length);
    for (let combo = 0; combo < totalCombos; combo++) {
      // Decode combo into per-match outcomes (0=i wins, 1=draw, 2=j wins)
      const points = new Array(n).fill(0);
      let prob = 1;
      let temp = combo;
      for (let m = 0; m < pairs.length; m++) {
        const outcome = temp % 3;
        temp = Math.floor(temp / 3);
        const [i, j] = pairs[m];
        const pp = pairProbs[m];
        if (outcome === 0) {
          points[i] += 3;
          prob *= pp.pWin;
        } else if (outcome === 1) {
          points[i] += 1;
          points[j] += 1;
          prob *= pp.pDraw;
        } else {
          points[j] += 3;
          prob *= pp.pLoss;
        }
      }

      if (prob < 1e-12) continue; // skip negligible

      // Rank by points (ties broken by strength as proxy for goal difference)
      const ranked = codes
        .map((code, idx) => ({ code, pts: points[idx], str: strengths[code] }))
        .sort((a, b) => b.pts - a.pts || b.str - a.str);

      winGroupProb[ranked[0].code] += prob;
      // Top 2 qualify (FIFA 2026: top 2 from each group of 4, plus best 3rds — we approximate as top 2)
      qualifyProb[ranked[0].code] += prob;
      qualifyProb[ranked[1].code] += prob;
    }

    // Convert to odds × 100 format: odds = 100 / probability
    for (const t of groupTeams) {
      const wp = winGroupProb[t.code];
      const qp = qualifyProb[t.code];
      result[t.code] = {
        groupWinnerOdds: Math.round(100 / Math.max(wp, 0.005)),
        qualifyOdds: Math.round(100 / Math.max(qp, 0.005)),
      };
    }
  }

  return result;
}

/**
 * Pull match h2h odds from The Odds API and update Match.oddsData for every
 * match in the tournament that we can match by team name + kickoff date.
 * Also derives correct-score odds from the refreshed h2h prices.
 */
/**
 * Copy match oddsData from a sibling tournament (same kind) to the given tournament.
 * Used so late-created groups get identical odds to already-opened groups rather than
 * re-fetching from the API and potentially getting different values.
 * Returns the number of matches updated, or 0 if no sibling had odds yet.
 */
export async function copyMatchOddsFromSibling(tournamentId: string, matchIds?: string[]): Promise<number> {
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: { kind: true },
  });
  if (!tournament) return 0;

  // Find a sibling tournament that already has match odds
  const sibling = await db.tournament.findFirst({
    where: {
      kind: tournament.kind,
      id: { not: tournamentId },
      matches: { some: { oddsData: { not: Prisma.JsonNull } } },
    },
    include: {
      matches: {
        where: { oddsData: { not: Prisma.JsonNull }, status: "UPCOMING" },
        include: { homeTeam: true, awayTeam: true },
      },
    },
  });

  if (!sibling || sibling.matches.length === 0) return 0;

  // Build lookup from sibling: homeCode+awayCode → oddsData
  const siblingOdds = new Map<string, unknown>();
  for (const m of sibling.matches) {
    siblingOdds.set(`${m.homeTeam.code}__${m.awayTeam.code}`, m.oddsData);
  }

  // Apply to this tournament's matches (skip already-frozen ones)
  const matches = await db.match.findMany({
    where: {
      tournamentId,
      status: "UPCOMING",
      oddsLockedAt: null,
      ...(matchIds && { id: { in: matchIds } }),
    },
    include: { homeTeam: true, awayTeam: true },
  });

  let updated = 0;
  for (const m of matches) {
    const key = `${m.homeTeam.code}__${m.awayTeam.code}`;
    const odds = siblingOdds.get(key);
    if (!odds) continue;
    await db.match.update({
      where: { id: m.id },
      data: { oddsData: odds as Prisma.InputJsonValue },
    });
    updated++;
  }

  return updated;
}

export async function refreshAllMatchOdds(
  tournamentId: string,
  matchIds?: string[]
): Promise<RefreshResult> {
  if (!isConfigured()) return { refreshed: false, reason: "ODDS_API_KEY not set" };

  const live = await fetchMatchOdds();
  if (!live) return { refreshed: false, reason: "No match odds available yet" };

  const matches = await db.match.findMany({
    where: {
      tournamentId,
      status: "UPCOMING",
      oddsLockedAt: null,
      ...(matchIds && { id: { in: matchIds } }),
    },
    include: { homeTeam: true, awayTeam: true },
  });

  let updated = 0;

  for (const m of matches) {
    const key = `${m.homeTeam.name}__${m.awayTeam.name}`;
    const live1 = live[key];
    if (!live1) continue;

    // Sanity check kickoff within 24h so we don't cross-wire a future rematch.
    const apiTime = new Date(live1.commenceTime).getTime();
    if (Math.abs(apiTime - m.kickoffAt.getTime()) > 24 * 60 * 60 * 1000) continue;

    // Back expected-total-goals out of the over/under line if we have one;
    // otherwise fall back to the static WC-average 2.6.
    const avgGoals =
      live1.overUnderLine != null && live1.overProb != null
        ? impliedTotalGoals(live1.overUnderLine, live1.overProb)
        : undefined;

    const correctScores = deriveScoreOdds(live1.homeWin, live1.awayWin, 6, avgGoals);

    const oddsData = {
      homeWin: Math.round(live1.homeWin * 100) / 100,
      draw: Math.round(live1.draw * 100) / 100,
      awayWin: Math.round(live1.awayWin * 100) / 100,
      expectedGoals: avgGoals != null ? Math.round(avgGoals * 100) / 100 : null,
      correctScores,
      source: "the-odds-api",
      fetchedAt: new Date().toISOString(),
    };

    await db.match.update({
      where: { id: m.id },
      data: { oddsData: oddsData as unknown as Prisma.InputJsonValue },
    });
    updated++;
  }

  return { refreshed: true, updated };
}

/**
 * Snapshot relevant odds for a bet type at the moment it opens.
 * Result is stored on BetType.frozenOdds and used for display + scoring,
 * so that future Team.odds refreshes don't change points for bets already in flight.
 *
 * For tournament bets: snapshots all team odds (winnerOdds, groupWinnerOdds, qualifyOdds).
 * For per-game / curated: returns null — those use per-Match oddsData / per-bet captured odds.
 */
export async function snapshotOddsForBetType(
  tournamentId: string,
  category: string,
  subType?: string
): Promise<Prisma.InputJsonValue | null> {
  if (category !== "TOURNAMENT") return null;

  // For player-award bets: try live API first, fall back to static list.
  // The static list is always used as a baseline — live API results override it
  // when available, giving fresher odds at bet-open time.
  const playerAwardSubType =
    subType === "golden_boot" ? "golden_boot"
    : subType === "golden_ball" ? "golden_ball"
    : subType === "golden_glove" ? "golden_glove"
    : null;

  if (playerAwardSubType) {
    const staticFallback = {
      golden_boot: GOLDEN_BOOT_CANDIDATES,
      golden_ball: GOLDEN_BALL_CANDIDATES,
      golden_glove: GOLDEN_GLOVE_CANDIDATES,
    }[playerAwardSubType];

    // Try live API (may return null if market not posted yet)
    const live = await fetchPlayerAwardOdds(playerAwardSubType).catch(() => null);

    if (live && live.length > 0) {
      // Merge: live data wins for known players, static fills in missing ones
      const liveByName = new Map(live.map((p) => [p.playerName.toLowerCase(), p]));
      const merged = live.map((p) => ({ playerName: p.playerName, teamCode: "", odds: p.odds }));

      // Add static candidates not present in live (preserving teamCode from static)
      for (const s of staticFallback) {
        if (!liveByName.has(s.playerName.toLowerCase())) {
          merged.push({ playerName: s.playerName, teamCode: s.teamCode, odds: s.odds });
        } else {
          // Enrich live entry with teamCode from static
          const idx = merged.findIndex((p) => p.playerName.toLowerCase() === s.playerName.toLowerCase());
          if (idx !== -1) merged[idx].teamCode = s.teamCode;
        }
      }

      const candidates = merged.filter((p) => p.teamCode).sort((a, b) => a.odds - b.odds);
      return { candidates } as unknown as Prisma.InputJsonValue;
    }

    // API unavailable — use static list
    const candidates = [...staticFallback].sort((a, b) => a.odds - b.odds);
    return { candidates } as unknown as Prisma.InputJsonValue;
  }

  const teams = await db.team.findMany({
    where: { tournamentId },
    select: { code: true, odds: true },
  });

  const teamsByCode: Record<string, unknown> = {};
  for (const t of teams) {
    teamsByCode[t.code] = t.odds;
  }

  return { teams: teamsByCode } as unknown as Prisma.InputJsonValue;
}

/**
 * Called before a bet type transitions to OPEN. Refreshes the odds most
 * relevant to that bet type's market. Never throws — odds refresh is
 * best-effort; callers proceed even on failure.
 */
export async function refreshOddsForBetType(
  tournamentId: string,
  category: string,
  subType: string
): Promise<RefreshResult> {
  try {
    // All TOURNAMENT bet types ultimately depend on team odds (winnerOdds,
    // groupWinnerOdds, qualifyOdds), so refresh the outright market for any
    // tournament-level bet — not just "winner". The derivation step inside
    // refreshTournamentWinnerOdds computes group/qualify odds from the live
    // winner market, benefiting group_predictions, semifinalists, dark_horse, etc.
    if (category === "TOURNAMENT") {
      return await refreshTournamentWinnerOdds(tournamentId);
    }
    if (category === "PER_GAME") {
      return await refreshAllMatchOdds(tournamentId);
    }
    return { refreshed: false, reason: "No odds source for this bet type" };
  } catch (err) {
    console.error("[refresh-odds] failed:", err);
    return { refreshed: false, reason: "Refresh threw — see logs" };
  }
}

/**
 * Atomically promote a bet subType across ALL groups running the same tournament kind.
 *
 * Flow:
 *  1. Fetch live odds (one API call, cached for 30 min)
 *  2. Snapshot/freeze the odds for this bet subType
 *  3. Mark every matching DRAFT bet type as OPEN with the frozen snapshot
 *
 * This ensures all groups see identical frozen odds and open at the same time,
 * regardless of which group's page load triggered the promotion.
 */
export async function promoteBetTypeGlobally(
  triggeringTournamentId: string,
  tournamentKind: string,
  betType: { category: string; subType: string; opensAt: Date | null; locksAt?: Date | null },
  options?: { skipRefresh?: boolean; isolated?: boolean }
): Promise<void> {
  let frozen: Prisma.InputJsonValue | null = null;

  // Check if any group has already opened this bet type with frozen odds.
  // If so, reuse those exact odds — all groups in the same tournament must share
  // the same frozen snapshot so late-joining groups don't get different point values.
  const alreadyOpen = await db.betType.findFirst({
    where: {
      subType: betType.subType,
      category: betType.category as BetCategory,
      status: { in: ["OPEN", "LOCKED", "RESOLVED"] },
      tournament: { kind: tournamentKind },
      frozenOdds: { not: Prisma.JsonNull },
    },
    select: { frozenOdds: true },
  });

  if (alreadyOpen?.frozenOdds != null) {
    // Reuse existing frozen odds — don't re-fetch from the API.
    frozen = alreadyOpen.frozenOdds as Prisma.InputJsonValue;
  } else {
    // First group to open this bet type — fetch fresh odds now.
    if (betType.category === "TOURNAMENT") {
      if (!options?.skipRefresh) {
        await refreshOddsForBetType(triggeringTournamentId, betType.category, betType.subType).catch(() => null);
      }
      frozen = await snapshotOddsForBetType(triggeringTournamentId, betType.category, betType.subType);
    } else if (betType.category === "PER_GAME") {
      if (!options?.skipRefresh) {
        // Find all tournaments of this kind that don't yet have match odds.
        // For each, try to copy from a sibling first; only hit the API if no sibling has odds.
        const tournaments = await db.tournament.findMany({
          where: { kind: tournamentKind },
          select: { id: true },
        });
        for (const t of tournaments) {
          const copied = await copyMatchOddsFromSibling(t.id).catch(() => 0);
          if (copied === 0) {
            // No sibling had odds — fetch from API (first group to open)
            await refreshOddsForBetType(t.id, betType.category, betType.subType).catch(() => null);
          }
        }
      }
    }
  }

  // Find affected groups BEFORE opening so we know who to notify.
  const affectedGroups = options?.isolated
    ? await db.tournament.findUnique({ where: { id: triggeringTournamentId }, select: { groupId: true } })
        .then((t) => t ? [t.groupId] : [])
    : await db.tournament.findMany({ where: { kind: tournamentKind }, select: { groupId: true } })
        .then((ts) => ts.map((t) => t.groupId));

  // Open DRAFT bet types — either just this tournament (isolated/simulation mode)
  // or all groups of the same tournament kind (normal mode).
  await db.betType.updateMany({
    where: {
      subType: betType.subType,
      category: betType.category as BetCategory,
      status: "DRAFT",
      ...(options?.isolated
        ? { tournamentId: triggeringTournamentId }
        : { tournament: { kind: tournamentKind } }),
    },
    data: {
      status: "OPEN",
      ...(frozen != null && { frozenOdds: frozen }),
    },
  });

  // Send push notifications to members of affected groups (skip for simulated groups).
  // Deduplicate: send one notification per user even if they're in multiple groups.
  if (!options?.isolated && affectedGroups.length > 0) {
    const betLabel = betType.subType
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    const locksText = betType.locksAt
      ? ` — closes ${new Date(betType.locksAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
      : "";

    // Collect unique users with push subscriptions across all affected groups
    const members = await db.groupMembership.findMany({
      where: { groupId: { in: affectedGroups }, status: "APPROVED" },
      select: {
        groupId: true,
        user: {
          select: {
            id: true,
            pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
          },
        },
      },
    });

    // Deduplicate by userId — pick first groupId for the URL
    const userMap = new Map<string, { groupId: string }>();
    for (const m of members) {
      if (m.user.pushSubscriptions.length > 0 && !userMap.has(m.user.id)) {
        userMap.set(m.user.id, { groupId: m.groupId });
      }
    }

    const uniqueUserIds = [...userMap.keys()];
    if (uniqueUserIds.length > 0) {
      // Find users who already placed this bet (in any group) and skip them
      const existingBets = await db.bet.findMany({
        where: {
          userId: { in: uniqueUserIds },
          betType: { subType: betType.subType, category: betType.category as BetCategory },
        },
        select: { userId: true },
      });
      const alreadyBetUserIds = new Set(existingBets.map((b) => b.userId));
      const pendingUserIds = uniqueUserIds.filter((id) => !alreadyBetUserIds.has(id));

      if (pendingUserIds.length > 0) {
        // Use sendPushToGroup-style logic but for specific users
        const webpush = (await import("web-push")).default;
        webpush.setVapidDetails(
          process.env.VAPID_EMAIL!,
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
          process.env.VAPID_PRIVATE_KEY!
        );

        const subs = await db.pushSubscription.findMany({
          where: { userId: { in: pendingUserIds } },
        });

        for (const sub of subs) {
          const groupId = userMap.get(sub.userId)?.groupId ?? affectedGroups[0];
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({
              title: `New bet open: ${betLabel}`,
              body: `Place your prediction now${locksText}.`,
              url: betType.category === "PER_GAME"
                ? `/group/${groupId}/matches`
                : `/group/${groupId}/bets`,
            })
          ).catch(() => null);
        }
      }
    }
  }
}
