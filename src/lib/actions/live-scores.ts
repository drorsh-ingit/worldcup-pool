"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { fetchWCSchedule, fetchCLSchedule, fetchLiveMatch, regulationScore, fdWinnerCode, type FDMatch } from "@/lib/football-data";
import { fdTlaToCode } from "@/lib/wc-team-map";
import { scoreBets } from "@/lib/scoring";
import { recalculateLeaderboard, scoreProgressiveTournamentBets } from "@/lib/actions/results";
import { fetchEspnLiveMatch } from "@/lib/espn-live";

async function requireAdmin(groupId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") throw new Error("Not authorized");
}

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
    const fdMatch = fdMatches.find(
      (m) =>
        (fdTlaToCode(m.homeTeam.tla) === match.homeTeam.code ||
          (m.homeTeam.name?.toLowerCase().includes(match.homeTeam.name.toLowerCase()) ?? false)) &&
        (fdTlaToCode(m.awayTeam.tla) === match.awayTeam.code ||
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
    include: {
      tournament: { select: { groupId: true } },
      homeTeam: { select: { code: true } },
      awayTeam: { select: { code: true } },
    },
  });
  if (!match || match.tournament.groupId !== groupId) return { error: "Not found" };
  if (!match.externalId) return { error: "Not linked" };

  // ESPN is the primary live-display source — observed faster than fd-org's
  // free-tier feed at both kickoff and final whistle. fd-org remains the
  // authoritative completion source for knockouts (penalty-aware scoring via
  // regulationScore + via-pens advancer detection in autoCompleteMatch).
  const espn = await fetchEspnLiveMatch(
    match.homeTeam.code,
    match.awayTeam.code,
    match.kickoffAt
  );
  const espnHasLiveData =
    !!espn &&
    (espn.status === "IN_PLAY" || espn.status === "PAUSED" || espn.status === "FINISHED");

  let liveScore: LiveScore | null = null;
  if (espnHasLiveData) {
    liveScore = espn;
  }

  // Fetch fd-org only when (a) ESPN didn't give live data — we need a display
  // backup; or (b) we need its pens-aware completion data for a KO match ESPN
  // has marked finished. Group-stage completion goes through ESPN directly so
  // we can skip fd-org entirely for those.
  const koNeedsFdCompletion =
    match.phase !== "GROUP" &&
    espn?.status === "FINISHED" &&
    match.status !== "COMPLETED";

  let fdMatch: FDMatch | null = null;
  if (!espnHasLiveData || koNeedsFdCompletion) {
    try {
      fdMatch = await fetchLiveMatch(parseInt(match.externalId));
    } catch {
      // Swallow — fd is the backup; if ESPN already gave us live data we still return it.
    }
  }

  if (!liveScore && fdMatch) {
    const isActive = fdMatch.status === "IN_PLAY" || fdMatch.status === "PAUSED";
    const currentHome = isActive
      ? (fdMatch.score.fullTime.home ?? fdMatch.score.halfTime.home)
      : fdMatch.score.fullTime.home;
    const currentAway = isActive
      ? (fdMatch.score.fullTime.away ?? fdMatch.score.halfTime.away)
      : fdMatch.score.fullTime.away;
    const knownStatuses = ["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "FINISHED"] as const;
    liveScore = {
      home: currentHome,
      away: currentAway,
      status: (knownStatuses as readonly string[]).includes(fdMatch.status)
        ? (fdMatch.status as LiveScore["status"])
        : "OTHER",
      minute: fdMatch.minute ?? null,
    };
  }

  // Group-stage finished auto-complete from ESPN. Groups can't go to pens, so
  // ESPN's final score equals the regulation score we score bets against.
  // 100min buffer guards against ESPN flapping to "post" mid-match.
  const now = new Date();
  if (
    match.phase === "GROUP" &&
    espn?.status === "FINISHED" &&
    espn.home != null &&
    espn.away != null &&
    match.status !== "COMPLETED" &&
    now.getTime() >= match.kickoffAt.getTime() + 100 * 60 * 1000
  ) {
    await autoCompleteGroupMatchFromEspn(
      groupId,
      matchId,
      match.tournamentId,
      espn.home,
      espn.away
    );
  }

  // KO finished auto-complete via fd-org — keeps regulationScore + via-pens
  // advancer detection authoritative for matches that can go to a shootout.
  if (fdMatch?.status === "FINISHED" && match.status !== "COMPLETED") {
    await autoCompleteMatch(groupId, matchId, match.tournamentId, fdMatch);
  }

  return { data: liveScore ?? undefined };
}

/**
 * Group-stage-only finished writer driven by ESPN. Groups can't go to penalties,
 * so ESPN's final score is the regulation score — safe to use for bet scoring.
 * Mirrors autoCompleteMatch except: no winnerTeamId (groups can draw, and the
 * field is only used for KO advancement) and no FDMatch input.
 */
async function autoCompleteGroupMatchFromEspn(
  groupId: string,
  matchId: string,
  tournamentId: string,
  home: number,
  away: number
) {
  const current = await db.match.findUnique({ where: { id: matchId } });
  if (!current || current.status === "COMPLETED") return;

  await db.match.update({
    where: { id: matchId },
    data: { actualHomeScore: home, actualAwayScore: away, status: "COMPLETED" },
  });

  await scoreBets(groupId, tournamentId, matchId);
  await scoreProgressiveTournamentBets(groupId, tournamentId);
  await recalculateLeaderboard(groupId, tournamentId);
  revalidatePath(`/group/${groupId}`);
}

/** Map a finished FD match's winner (penalties included) to our team id. */
function resolveWinnerTeamId(
  fd: FDMatch,
  home: { id: string; code: string },
  away: { id: string; code: string }
): string | null {
  const winnerCode = fdWinnerCode(fd, home.code, away.code);
  if (winnerCode === home.code) return home.id;
  if (winnerCode === away.code) return away.id;
  return null;
}

async function autoCompleteMatch(
  groupId: string,
  matchId: string,
  tournamentId: string,
  fd: FDMatch
) {
  // Guard against concurrent calls; load teams to resolve the winner.
  const current = await db.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!current || current.status === "COMPLETED") return;

  // Store the pens-excluded 90'/120' score; winnerTeamId carries the actual advancer.
  const reg = regulationScore(fd);
  if (!reg) return;
  const winnerTeamId = resolveWinnerTeamId(fd, current.homeTeam, current.awayTeam);

  await db.match.update({
    where: { id: matchId },
    data: { actualHomeScore: reg.home, actualAwayScore: reg.away, winnerTeamId, status: "COMPLETED" },
  });

  await scoreBets(groupId, tournamentId, matchId);
  await scoreProgressiveTournamentBets(groupId, tournamentId);
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
function sigWords(s: string | null | undefined): string[] {
  return normaliseName(s).split(" ").filter((w) => w.length > 3);
}

function teamMatches(fdName: string | null, fdShort: string | null, ourName: string): boolean {
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
    fdMatches = await fetchWCSchedule();
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

    // Pens-excluded 90'/120' score for bet scoring; winnerTeamId for progression.
    const reg = regulationScore(fdMatch);
    if (!reg) continue;
    const winnerTeamId = resolveWinnerTeamId(fdMatch, dbMatch.homeTeam, dbMatch.awayTeam);

    await db.match.update({
      where: { id: dbMatch.id },
      data: {
        actualHomeScore: reg.home,
        actualAwayScore: reg.away,
        winnerTeamId,
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
