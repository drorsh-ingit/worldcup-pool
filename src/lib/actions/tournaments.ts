"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getProfile, type TournamentKind } from "@/lib/tournaments/registry";
import { DEFAULT_GROUP_SETTINGS, type GroupSettings } from "@/lib/settings";
import { refreshTournamentWinnerOdds } from "@/lib/actions/refresh-odds";
import { fetchCLSchedule, FD_CLUB_IDS, type FDMatch } from "@/lib/football-data";
import type { MatchSeed } from "@/lib/tournaments/types";
import type { MatchPhase } from "@prisma/client";

/** Verify caller is admin of the group. Returns membership or throws. */
async function requireAdmin(groupId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return membership;
}

// ─── CL real-fixture helpers ──────────────────────────────────────────────

const FD_STAGE_TO_PHASE: Record<string, MatchPhase> = {
  LEAGUE_STAGE:   "GROUP",
  PLAYOFFS:       "R32",
  LAST_16:        "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS:    "SF",
  FINAL:          "FINAL",
};

const PHASE_MULTIPLIER: Record<string, number> = {
  GROUP: 1.0, R32: 1.2, R16: 1.3, QF: 1.5, SF: 1.7, FINAL: 2.0,
};

// Matchday base offset per knockout phase so numbers don't collide with league phase
const KO_MD_BASE: Record<string, number> = {
  R32: 9, R16: 11, QF: 13, SF: 15, FINAL: 17,
};

// Reverse map: football-data.org integer ID → our short code
const FD_ID_TO_CODE: Map<number, string> = new Map(
  Object.entries(FD_CLUB_IDS).map(([code, id]) => [id, code])
);

/**
 * Fetch the real CL fixture list and convert to MatchSeeds mapped to our team codes.
 * Uses exact football-data.org team ID matching — no fuzzy name logic.
 * Skips any match where either team isn't in our roster.
 */
async function fetchRealCLMatchSeeds(): Promise<MatchSeed[]> {
  const fdMatches = await fetchCLSchedule();

  // Collect per phase, then sort by date to assign leg matchdays
  const koByPhase: Record<string, { fdMatch: FDMatch; home: string; away: string }[]> = {};

  // Seed every phase — ID matching is exact, unmatched teams are just skipped cleanly
  const SEEDED_PHASES = new Set(["GROUP", "R32", "R16", "QF", "SF", "FINAL"]);

  for (const m of fdMatches) {
    const phase = FD_STAGE_TO_PHASE[m.stage];
    if (!phase || !SEEDED_PHASES.has(phase)) continue;

    const home = FD_ID_TO_CODE.get(m.homeTeam.id) ?? null;
    const away = FD_ID_TO_CODE.get(m.awayTeam.id) ?? null;
    if (!home || !away) continue;

    if (!koByPhase[phase]) koByPhase[phase] = [];
    koByPhase[phase].push({ fdMatch: m, home, away });
  }

  const allMatches: MatchSeed[] = [];
  for (const [phase, entries] of Object.entries(koByPhase)) {
    // League phase (GROUP) uses the API's matchday field directly — no leg split
    if (phase === "GROUP") {
      for (const { fdMatch, home, away } of entries) {
        allMatches.push({
          homeCode: home,
          awayCode: away,
          phase: "GROUP",
          matchday: fdMatch.matchday ?? 1,
          groupLetter: "L",
          kickoffAt: new Date(fdMatch.utcDate),
          externalId: String(fdMatch.id),
          multiplier: PHASE_MULTIPLIER.GROUP ?? 1.0,
        });
      }
      continue;
    }

    // Knockout phases: detect leg 1 vs leg 2 by the largest date gap
    const sorted = entries.sort(
      (a, b) => new Date(a.fdMatch.utcDate).getTime() - new Date(b.fdMatch.utcDate).getTime()
    );
    const base = KO_MD_BASE[phase] ?? 9;
    let splitIdx = sorted.length;
    let maxGap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const gap =
        new Date(sorted[i].fdMatch.utcDate).getTime() -
        new Date(sorted[i - 1].fdMatch.utcDate).getTime();
      if (gap > maxGap) { maxGap = gap; splitIdx = i; }
    }
    const hasTwoLegs = maxGap > 3 * 24 * 60 * 60 * 1000;
    sorted.forEach(({ fdMatch, home, away }, i) => {
      const leg = hasTwoLegs && i >= splitIdx ? 1 : 0;
      allMatches.push({
        homeCode: home,
        awayCode: away,
        phase: phase as MatchPhase,
        matchday: base + leg,
        groupLetter: null,
        kickoffAt: new Date(fdMatch.utcDate),
        externalId: String(fdMatch.id),
        multiplier: PHASE_MULTIPLIER[phase] ?? 1.0,
      });
    });
  }

  return allMatches;
}

/**
 * Initialize a tournament for the group from a TournamentProfile.
 * Creates Tournament, Teams, group-phase Matches, and BetTypes in DRAFT status.
 * Defaults to FIFA World Cup 2026; pass a different kind to seed another tournament.
 */
export async function initTournament(groupId: string, kind: TournamentKind = "WC_2026") {
  await requireAdmin(groupId);

  // Only one tournament per group
  const existing = await db.tournament.findFirst({ where: { groupId } });
  if (existing) return { error: "Tournament already exists for this group" };

  const profile = getProfile(kind);

  const tournament = await db.tournament.create({
    data: {
      groupId,
      kind: profile.id,
      name: profile.displayName,
      status: "SETUP",
    },
  });

  await db.team.createMany({
    data: profile.teams.map((t) => ({
      tournamentId: tournament.id,
      name: t.name,
      code: t.code,
      groupLetter: t.groupLetter,
      odds: t.odds as unknown as Prisma.InputJsonValue,
    })),
  });

  const teams = await db.team.findMany({ where: { tournamentId: tournament.id } });
  const teamByCode = Object.fromEntries(teams.map((t) => [t.code, t]));

  // For UCL, seed only real fixtures from football-data.org (no fictional fallback for past phases).
  let matchSeeds: readonly MatchSeed[] = profile.matches;
  if (kind === "UCL_2026") {
    try {
      const real = await fetchRealCLMatchSeeds();
      if (real.length > 0) {
        // SF/FINAL teams are often TBD in the API until confirmed — always fall back
        // to profile placeholders for those phases so those tabs exist in the DB.
        const realPhases = new Set(real.map((m) => m.phase));
        const supplement = profile.matches.filter(
          (m) => (m.phase === "SF" || m.phase === "FINAL") && !realPhases.has(m.phase)
        );
        matchSeeds = [...real, ...supplement];
      }
    } catch {
      // API unavailable — fall back to generated fixtures silently
    }
  }

  const matchesData = matchSeeds
    .filter((m) => teamByCode[m.homeCode] && teamByCode[m.awayCode])
    .map((m) => ({
      tournamentId: tournament.id,
      homeTeamId: teamByCode[m.homeCode].id,
      awayTeamId: teamByCode[m.awayCode].id,
      phase: m.phase,
      matchday: m.matchday,
      groupLetter: m.groupLetter,
      kickoffAt: m.kickoffAt,
      externalId: m.externalId,
      multiplier: m.multiplier,
      status: "UPCOMING" as const,
    }));

  await db.match.createMany({ data: matchesData });

  await db.betType.createMany({
    data: profile.betTypes.map((bt) => {
      const resolved = bt.openTrigger ? profile.resolveOpenTrigger(bt.openTrigger) : null;
      return {
        tournamentId: tournament.id,
        category: bt.category,
        subType: bt.subType,
        name: bt.name,
        description: bt.description,
        openTrigger: bt.openTrigger ?? null,
        opensAt: resolved?.opensAt ?? bt.opensAt ?? null,
        locksAt: resolved?.locksAt ?? bt.locksAt ?? null,
        status: "DRAFT" as const,
        config: (bt.config ?? {}) as Prisma.InputJsonValue,
      };
    }),
  });

  // Pull latest winner odds from the API — best-effort, never blocks init
  await refreshTournamentWinnerOdds(tournament.id).catch(() => null);

  revalidatePath(`/group/${groupId}`);
  revalidatePath(`/group/${groupId}/admin`);

  return { success: true, tournamentId: tournament.id };
}

/** Delete a tournament and all its cascaded data (teams, matches, bets, leaderboard). */
export async function deleteTournament(groupId: string) {
  await requireAdmin(groupId);

  const tournament = await db.tournament.findFirst({ where: { groupId } });
  if (!tournament) return { error: "No tournament found" };

  await db.tournament.delete({ where: { id: tournament.id } });

  revalidatePath(`/group/${groupId}`);
  revalidatePath(`/group/${groupId}/admin`);

  return { success: true };
}

/** Update tournament status (SETUP → GROUP_STAGE → KNOCKOUT → COMPLETE) */
export async function updateTournamentStatus(
  groupId: string,
  tournamentId: string,
  status: "SETUP" | "GROUP_STAGE" | "KNOCKOUT" | "COMPLETE"
) {
  await requireAdmin(groupId);

  await db.tournament.update({
    where: { id: tournamentId },
    data: { status },
  });

  revalidatePath(`/group/${groupId}`);
  revalidatePath(`/group/${groupId}/admin`);
  revalidatePath(`/group/${groupId}/bets`);

  return { success: true };
}

/** Admin debug: return raw CL fixture data for knockout phases from football-data.org. */
export async function debugCLFixtures(groupId: string) {
  await requireAdmin(groupId);

  let matches: Awaited<ReturnType<typeof fetchCLSchedule>> = [];
  let error: string | null = null;
  try {
    matches = await fetchCLSchedule();
  } catch (e) {
    error = String(e);
  }

  // Count every unique stage name (so we can see what string the API uses for R16 etc.)
  const stageCounts: Record<string, number> = {};
  for (const m of matches) {
    stageCounts[m.stage] = (stageCounts[m.stage] ?? 0) + 1;
  }

  // Show all non-LEAGUE_PHASE matches (i.e. all knockout rounds regardless of stage string)
  const filtered = matches
    .filter((m) => m.stage !== "LEAGUE_PHASE")
    .map((m) => ({
      id: m.id,
      stage: m.stage,
      status: m.status,
      utcDate: m.utcDate,
      home: { id: m.homeTeam.id, name: m.homeTeam.name, tla: m.homeTeam.tla },
      away: { id: m.awayTeam.id, name: m.awayTeam.name, tla: m.awayTeam.tla },
      homeMatchedCode: FD_ID_TO_CODE.get(m.homeTeam.id) ?? null,
      awayMatchedCode: FD_ID_TO_CODE.get(m.awayTeam.id) ?? null,
    }));

  return { error, stageCounts, matches: filtered };
}

/** Update group scoring settings */
export async function updateGroupSettings(groupId: string, settings: Partial<GroupSettings>) {
  await requireAdmin(groupId);

  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Error("Group not found");

  // Lock scoring once any bet has opened — simulation is exempt so admins can still
  // run the time machine after the tournament starts.
  const opened = await db.betType.count({
    where: { tournament: { groupId }, status: { not: "DRAFT" } },
  });
  if (opened > 0) {
    const { simulation, ...rest } = settings;
    if (Object.keys(rest).length > 0) {
      throw new Error("Scoring settings are locked — first bet has already opened.");
    }
    settings = { simulation };
  }

  const current = (group.settings as typeof DEFAULT_GROUP_SETTINGS) ?? DEFAULT_GROUP_SETTINGS;
  const merged = { ...current, ...settings };

  await db.group.update({
    where: { id: groupId },
    data: { settings: merged as unknown as Prisma.InputJsonValue },
  });

  revalidatePath(`/group/${groupId}/admin`);

  return { success: true };
}
