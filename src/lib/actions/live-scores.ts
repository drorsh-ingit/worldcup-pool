"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { fetchWCSchedule, fetchCLSchedule, fetchLiveMatch, type FDMatch } from "@/lib/football-data";
import { scoreBets } from "@/lib/scoring";
import { recalculateLeaderboard, scoreProgressiveTournamentBets } from "@/lib/actions/results";

async function requireAdmin(groupId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") throw new Error("Not authorized");
}

// TLA overrides where football-data.org differs from FIFA codes — extend as needed
const FD_TLA_TO_FIFA: Record<string, string> = {};

export async function syncFixtureIds(
  groupId: string
): Promise<{ success?: boolean; synced?: number; error?: string }> {
  try {
    await requireAdmin(groupId);
  } catch {
    return { error: "Not authorized" };
  }

  const tournament = await db.tournament.findFirst({
    where: { groupId },
    include: { matches: { include: { homeTeam: true, awayTeam: true } } },
  });
  if (!tournament) return { error: "No tournament found" };

  let fdMatches;
  try {
    fdMatches = await fetchWCSchedule();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch schedule" };
  }

  let synced = 0;

  for (const match of tournament.matches) {
    const homeCode = FD_TLA_TO_FIFA[match.homeTeam.code] ?? match.homeTeam.code;
    const awayCode = FD_TLA_TO_FIFA[match.awayTeam.code] ?? match.awayTeam.code;

    const fdMatch = fdMatches.find(
      (m) =>
        (m.homeTeam.tla === homeCode ||
          (m.homeTeam.name?.toLowerCase().includes(match.homeTeam.name.toLowerCase()) ?? false)) &&
        (m.awayTeam.tla === awayCode ||
          (m.awayTeam.name?.toLowerCase().includes(match.awayTeam.name.toLowerCase()) ?? false))
    );

    if (fdMatch) {
      await db.match.update({
        where: { id: match.id },
        data: { externalId: String(fdMatch.id) },
      });
      synced++;
    }
  }

  revalidatePath(`/group/${groupId}/admin`);
  return { success: true, synced };
}

export interface LiveScore {
  home: number | null;
  away: number | null;
  status: "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "OTHER";
  minute: number | null;
}

export async function getLiveMatchScore(
  groupId: string,
  matchId: string
): Promise<{ data?: LiveScore; error?: string }> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { tournament: { select: { groupId: true } } },
  });
  if (!match || match.tournament.groupId !== groupId) return { error: "Not found" };
  if (!match.externalId) return { error: "Not linked" };

  let fdMatch;
  try {
    fdMatch = await fetchLiveMatch(parseInt(match.externalId));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fetch failed" };
  }

  // During IN_PLAY/PAUSED use fullTime (updated live); fall back to halfTime
  const isActive = fdMatch.status === "IN_PLAY" || fdMatch.status === "PAUSED";
  const currentHome = isActive
    ? (fdMatch.score.fullTime.home ?? fdMatch.score.halfTime.home)
    : fdMatch.score.fullTime.home;
  const currentAway = isActive
    ? (fdMatch.score.fullTime.away ?? fdMatch.score.halfTime.away)
    : fdMatch.score.fullTime.away;

  const knownStatuses = ["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "FINISHED"] as const;
  const liveScore: LiveScore = {
    home: currentHome,
    away: currentAway,
    status: (knownStatuses as readonly string[]).includes(fdMatch.status)
      ? (fdMatch.status as LiveScore["status"])
      : "OTHER",
    minute: fdMatch.minute ?? null,
  };

  // Auto-complete when API says FINISHED and our DB hasn't recorded it yet
  if (
    fdMatch.status === "FINISHED" &&
    match.status !== "COMPLETED" &&
    currentHome !== null &&
    currentAway !== null
  ) {
    await autoCompleteMatch(groupId, matchId, match.tournamentId, currentHome, currentAway);
  }

  return { data: liveScore };
}

async function autoCompleteMatch(
  groupId: string,
  matchId: string,
  tournamentId: string,
  homeScore: number,
  awayScore: number
) {
  // Guard against concurrent calls
  const current = await db.match.findUnique({ where: { id: matchId }, select: { status: true } });
  if (current?.status === "COMPLETED") return;

  await db.match.update({
    where: { id: matchId },
    data: { actualHomeScore: homeScore, actualAwayScore: awayScore, status: "COMPLETED" },
  });

  await scoreBets(groupId, tournamentId, matchId);
  await recalculateLeaderboard(groupId, tournamentId);
  revalidatePath(`/group/${groupId}`);
}

// Normalise team name: strip legal suffixes, translate known city/club name variants
function normaliseName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\b(fc|cf|ac|as|sc|sk|fk|bk|rb|rsc|ss|afc|ssc|bsc|kv|cfp|bc|sv|vv)\b\.?/gi, "")
    // German → English and Italian → common names
    .replace(/münchen/g, "munich")
    .replace(/internazionale/g, "inter")
    .replace(/milano/g, "milan")
    .replace(/atletico/g, "atlético")
    .replace(/atletico/g, "atlético")
    .replace(/saint[- ]gilloise/g, "saint-gilloise")
    .replace(/\s+/g, " ")
    .trim();
}

// Returns significant words (>3 chars) for word-level overlap matching
function sigWords(s: string): string[] {
  return normaliseName(s).split(" ").filter((w) => w.length > 3);
}

function teamMatches(fdName: string, fdShort: string, ourName: string): boolean {
  const our = normaliseName(ourName);
  const n1 = normaliseName(fdName);
  const n2 = normaliseName(fdShort);

  // Substring match
  if (n1.includes(our) || our.includes(n1) || n2.includes(our) || our.includes(n2)) return true;

  // Word-level overlap: any significant word from our name appears in any FD name variant
  const ourWords = sigWords(ourName);
  const fdWords = new Set([...sigWords(fdName), ...sigWords(fdShort)]);
  return ourWords.some((w) => fdWords.has(w));
}

function findFdMatch(
  fdMatches: FDMatch[],
  kickoffAt: Date,
  homeName: string,
  awayName: string
): FDMatch | undefined {
  // Allow ±36h to handle timezone and scheduling edge cases
  const WINDOW = 36 * 60 * 60 * 1000;
  return fdMatches.find((m) => {
    const fdDate = new Date(m.utcDate);
    if (Math.abs(fdDate.getTime() - kickoffAt.getTime()) > WINDOW) return false;
    return (
      teamMatches(m.homeTeam.name, m.homeTeam.shortName, homeName) &&
      teamMatches(m.awayTeam.name, m.awayTeam.shortName, awayName)
    );
  });
}

/**
 * Fetches all finished matches for the tournament's competition from football-data.org
 * and bulk-saves results + scores to the DB. Returns how many matches were updated.
 */
export async function syncCompetitionResults(
  groupId: string
): Promise<{ success?: boolean; updated?: number; finishedInApi?: number; error?: string }> {
  try {
    await requireAdmin(groupId);
  } catch {
    return { error: "Not authorized" };
  }

  const tournament = await db.tournament.findFirst({
    where: { groupId },
    include: { matches: { include: { homeTeam: true, awayTeam: true } } },
  });
  if (!tournament) return { error: "No tournament found" };

  let fdMatches: FDMatch[];
  try {
    if (tournament.kind === "UCL_2026") {
      fdMatches = await fetchCLSchedule();
    } else if (tournament.kind === "WC_2026") {
      fdMatches = await fetchWCSchedule();
    } else {
      return { error: "Unsupported tournament kind" };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to fetch schedule" };
  }

  // Build a fast lookup map: externalId → FD match
  const fdById = new Map(fdMatches.map((m) => [String(m.id), m]));
  const finishedInApi = fdMatches.filter((m) => m.status === "FINISHED").length;

  let updated = 0;

  for (const dbMatch of tournament.matches) {
    if (dbMatch.status === "COMPLETED") continue;

    // Prefer direct externalId lookup; fall back to date+name fuzzy match
    let fdMatch: FDMatch | undefined;
    if (dbMatch.externalId) {
      fdMatch = fdById.get(dbMatch.externalId);
    }
    if (!fdMatch) {
      fdMatch = findFdMatch(
        fdMatches,
        new Date(dbMatch.kickoffAt),
        dbMatch.homeTeam.name,
        dbMatch.awayTeam.name
      );
    }

    if (!fdMatch || fdMatch.status !== "FINISHED") continue;

    const home = fdMatch.score.fullTime.home;
    const away = fdMatch.score.fullTime.away;
    if (home === null || away === null) continue;

    await db.match.update({
      where: { id: dbMatch.id },
      data: {
        actualHomeScore: home,
        actualAwayScore: away,
        status: "COMPLETED",
        externalId: String(fdMatch.id),
      },
    });

    await scoreBets(groupId, tournament.id, dbMatch.id);
    updated++;
  }

  if (updated > 0) {
    await scoreProgressiveTournamentBets(groupId, tournament.id);
    await recalculateLeaderboard(groupId, tournament.id);
    revalidatePath(`/group/${groupId}`);
  }

  return { success: true, updated, finishedInApi };
}
