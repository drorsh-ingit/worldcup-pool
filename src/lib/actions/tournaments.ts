"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { WC2026_TEAMS, WC2026_GROUP_MATCHES, PRE_TOURNAMENT_BET_TYPES, MILESTONE_BET_TYPES, knockoutKickoff } from "@/lib/data/wc2026";
import { DEFAULT_GROUP_SETTINGS } from "@/lib/settings";

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

/**
 * Initialize a FIFA World Cup 2026 tournament for the group.
 * Creates Tournament, 48 Teams, and 72 group-stage Matches.
 * Also creates the standard pre-tournament BetTypes in DRAFT status.
 */
export async function initTournament(groupId: string) {
  await requireAdmin(groupId);

  // Only one tournament per group
  const existing = await db.tournament.findFirst({ where: { groupId } });
  if (existing) return { error: "Tournament already exists for this group" };

  const tournament = await db.tournament.create({
    data: {
      groupId,
      name: "FIFA World Cup 2026",
      status: "SETUP",
    },
  });

  // Seed all 48 teams
  await db.team.createMany({
    data: WC2026_TEAMS.map((t) => ({
      tournamentId: tournament.id,
      name: t.name,
      code: t.code,
      groupLetter: t.groupLetter,
      odds: t.odds as unknown as Prisma.InputJsonValue,
    })),
  });

  // Fetch created teams to get their IDs
  const teams = await db.team.findMany({ where: { tournamentId: tournament.id } });
  const teamByCode = Object.fromEntries(teams.map((t) => [t.code, t]));

  // Seed group-stage matches with real kickoff times and football-data.org IDs
  const matchesData = WC2026_GROUP_MATCHES.map((m) => ({
    tournamentId: tournament.id,
    homeTeamId: teamByCode[m.homeCode].id,
    awayTeamId: teamByCode[m.awayCode].id,
    phase: "GROUP" as const,
    matchday: m.matchday,
    groupLetter: m.groupLetter,
    kickoffAt: new Date(m.kickoffAt),
    externalId: String(m.externalId),
    multiplier: 1.0,
    status: "UPCOMING" as const,
  }));

  await db.match.createMany({ data: matchesData });

  // Create standard bet types with scheduled open/lock times
  const tournamentStart = new Date("2026-06-11T00:00:00Z");
  const preTournamentOpens = new Date(tournamentStart.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week before

  // Milestone timing: group stage ends ~Jul 1, R32 starts Jul 2, R16 starts Jul 6
  const firstR32Kickoff = knockoutKickoff("R32", 0); // Jul 2
  const firstR16Kickoff = knockoutKickoff("R16", 0); // Jul 6
  // Opens right after last group match (Jun 30 evening) — use Jul 1 as safe open
  const afterGroupStage = new Date("2026-07-01T00:00:00Z");
  // Opens after R32 complete (Jul 5 evening) — use Jul 5 23:00
  const afterR32 = new Date("2026-07-05T23:00:00Z");

  await db.betType.createMany({
    data: [
      ...PRE_TOURNAMENT_BET_TYPES.map((bt) => ({
        tournamentId: tournament.id,
        category: bt.category,
        subType: bt.subType,
        name: bt.name,
        description: bt.description,
        opensAt: preTournamentOpens,
        locksAt: tournamentStart,
        status: "DRAFT" as const,
        config: {},
      })),
      // Milestone bet types — open at different tournament stages
      ...MILESTONE_BET_TYPES.map((bt) => {
        const isSemifinalists = bt.subType === "semifinalists";
        return {
          tournamentId: tournament.id,
          category: bt.category,
          subType: bt.subType,
          name: bt.name,
          description: bt.description,
          opensAt: isSemifinalists ? afterR32 : afterGroupStage,
          locksAt: isSemifinalists ? firstR16Kickoff : firstR32Kickoff,
          status: "DRAFT" as const,
          config: {},
        };
      }),
      // Per-game bet types — one shared BetType per type, individual Bets have matchId
      // Opens 1 day before first match, individual match locking by kickoffAt
      {
        tournamentId: tournament.id,
        category: "PER_GAME" as const,
        subType: "match_winner",
        name: "Match Result",
        description: "Predict the result of each match — home win, draw, or away win. Points scale with how unlikely the outcome was.",
        opensAt: new Date(tournamentStart.getTime() - 1 * 24 * 60 * 60 * 1000),
        locksAt: null, // Per-match locking via match.kickoffAt
        status: "DRAFT" as const,
        config: {},
      },
      {
        tournamentId: tournament.id,
        category: "PER_GAME" as const,
        subType: "correct_score",
        name: "Correct Score",
        description: "Predict the exact final score. Harder to get right, so it pays more than the match result bet.",
        opensAt: new Date(tournamentStart.getTime() - 1 * 24 * 60 * 60 * 1000),
        locksAt: null, // Per-match locking via match.kickoffAt
        status: "DRAFT" as const,
        config: {},
      },
    ],
  });

  revalidatePath(`/group/${groupId}`);
  revalidatePath(`/group/${groupId}/admin`);

  return { success: true, tournamentId: tournament.id };
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

/** Update group scoring settings */
export async function updateGroupSettings(groupId: string, settings: Partial<typeof DEFAULT_GROUP_SETTINGS>) {
  await requireAdmin(groupId);

  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Error("Group not found");

  const current = (group.settings as typeof DEFAULT_GROUP_SETTINGS) ?? DEFAULT_GROUP_SETTINGS;
  const merged = { ...current, ...settings };

  await db.group.update({
    where: { id: groupId },
    data: { settings: merged as unknown as Prisma.InputJsonValue },
  });

  revalidatePath(`/group/${groupId}/admin`);

  return { success: true };
}
