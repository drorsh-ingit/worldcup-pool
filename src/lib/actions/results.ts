"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { scoreBets, scoreBracketPerPick, calculatePoints } from "@/lib/scoring";
import { resolveGroupSettings } from "@/lib/settings";
import { z } from "zod";

async function requireAdmin(groupId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") throw new Error("Not authorized");
}

const enterResultSchema = z.object({
  matchId: z.string().cuid(),
  homeScore: z.number().int().min(0).max(30),
  awayScore: z.number().int().min(0).max(30),
});

/**
 * Enter the result for a match, mark it COMPLETED,
 * score all per-game bets, and update the leaderboard.
 */
export async function enterMatchResult(groupId: string, input: unknown) {
  await requireAdmin(groupId);

  const parsed = enterResultSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { matchId, homeScore, awayScore } = parsed.data;

  // Get match + tournament
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { tournament: { include: { group: true } } },
  });
  if (!match) return { error: "Match not found" };
  if (match.tournament.groupId !== groupId) return { error: "Match not in this group" };

  // Update match result
  await db.match.update({
    where: { id: matchId },
    data: {
      actualHomeScore: homeScore,
      actualAwayScore: awayScore,
      status: "COMPLETED",
    },
  });

  // Score all per-game bets for this match
  await scoreBets(groupId, match.tournamentId, matchId);

  // Progressively score bracket + semifinalist bets from match data
  await scoreProgressiveTournamentBets(groupId, match.tournamentId);

  // Recalculate leaderboard
  await recalculateLeaderboard(groupId, match.tournamentId);

  revalidatePath(`/group/${groupId}`);
  revalidatePath(`/group/${groupId}/bets`);
  revalidatePath(`/group/${groupId}/admin`);

  return { success: true };
}

/**
 * Score and resolve a tournament/curated bet type.
 * Called after resolveBetType sets the resolution.
 */
export async function scoreResolvedBetType(
  groupId: string,
  tournamentId: string,
  betTypeId: string
) {
  await requireAdmin(groupId);
  await scoreBets(groupId, tournamentId, null, betTypeId);
  await recalculateLeaderboard(groupId, tournamentId);

  revalidatePath(`/group/${groupId}`);
  revalidatePath(`/group/${groupId}/admin`);

  return { success: true };
}

/**
 * Progressively score bracket and semifinalist bets based on completed match data,
 * without requiring admin to formally resolve the bet type.
 * Called after every match result so the leaderboard stays live.
 */
export async function scoreProgressiveTournamentBets(groupId: string, tournamentId: string) {
  const group = await db.group.findUnique({ where: { id: groupId } });
  const settings = resolveGroupSettings(group?.settings);
  const totalPool = settings.totalPool ?? 1000;
  const memberCount = Math.max(
    await db.groupMembership.count({ where: { groupId, status: "APPROVED" } }),
    1
  );

  // --- Bracket ---
  const bracketBetType = await db.betType.findFirst({
    where: { tournamentId, subType: "bracket" },
  });
  if (bracketBetType && bracketBetType.status !== "DRAFT") {
    // Derive winners from completed matches across all knockout phases.
    const knockoutMatches = await db.match.findMany({
      where: { tournamentId, phase: { in: ["R32", "R16", "QF", "SF", "FINAL"] } },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { kickoffAt: "asc" },
    });
    const derivedWinners: Record<string, string> = {};
    const phaseIndexMap: Record<string, number> = {};
    for (const m of knockoutMatches) {
      const phase = m.phase;
      const idx = phaseIndexMap[phase] ?? 0;
      phaseIndexMap[phase] = idx + 1;
      if (m.status === "COMPLETED" && m.actualHomeScore != null && m.actualAwayScore != null) {
        derivedWinners[`${phase}-${idx}`] =
          m.actualHomeScore >= m.actualAwayScore ? m.homeTeam.code : m.awayTeam.code;
      }
    }
    // Also fold in admin-set resolution.winners for any slots not covered by match data
    const adminWinners = (bracketBetType.resolution as { winners?: Record<string, string> } | null)?.winners ?? {};
    for (const [k, v] of Object.entries(adminWinners)) {
      if (!derivedWinners[k]) derivedWinners[k] = v;
    }

    const frozenTeamOdds =
      (bracketBetType.frozenOdds as { teams?: Record<string, unknown> } | null)?.teams ?? {};
    const teams = await db.team.findMany({ where: { tournamentId } });
    const teamByCode: Record<string, typeof teams[number]> = {};
    for (const t of teams) {
      teamByCode[t.code] = { ...t, odds: (frozenTeamOdds[t.code] ?? t.odds) as typeof t.odds };
    }

    const bracketBets = await db.bet.findMany({ where: { betTypeId: bracketBetType.id } });
    for (const bet of bracketBets) {
      const per = scoreBracketPerPick(
        bet.prediction as { picks?: Record<string, string> },
        { winners: derivedWinners },
        teamByCode,
        settings,
        totalPool,
        memberCount
      );
      await db.bet.update({
        where: { id: bet.id },
        data: {
          isCorrect: per.totalPoints > 0,
          basePoints: per.basePoints,
          bonusPoints: per.bonusPoints,
          totalPoints: per.totalPoints,
          scoredAt: new Date(),
        },
      });
    }
  }

  // --- Semifinalists ---
  const semiBetType = await db.betType.findFirst({
    where: { tournamentId, subType: "semifinalists" },
  });
  if (semiBetType && semiBetType.status !== "DRAFT") {
    // Derive actual semifinalists from SF match participants (set when QF results are entered).
    const sfMatches = await db.match.findMany({
      where: { tournamentId, phase: "SF" },
      include: { homeTeam: true, awayTeam: true },
    });
    const sfTeams = new Set<string>();
    for (const m of sfMatches) {
      if (m.homeTeam?.code && m.homeTeam.code !== "TBD") sfTeams.add(m.homeTeam.code);
      if (m.awayTeam?.code && m.awayTeam.code !== "TBD") sfTeams.add(m.awayTeam.code);
    }
    // Also use admin resolution as fallback
    const adminSemiTeams = (semiBetType.resolution as { teams?: string[] } | null)?.teams ?? [];
    for (const t of adminSemiTeams) sfTeams.add(t);

    if (sfTeams.size >= 4) {
      const effectiveTeams = [...sfTeams].slice(0, 4);
      const semiBets = await db.bet.findMany({ where: { betTypeId: semiBetType.id } });
      for (const bet of semiBets) {
        const predTeams = new Set((bet.prediction as { teams?: string[] })?.teams ?? []);
        let correct = 0;
        for (const t of effectiveTeams) {
          if (predTeams.has(t)) correct++;
        }
        const partialScore = correct / 4;
        const pts = calculatePoints(
          partialScore > 0,
          "semifinalists",
          Math.max(partialScore, 0.05),
          settings,
          "GROUP",
          totalPool,
          memberCount
        );
        await db.bet.update({
          where: { id: bet.id },
          data: {
            isCorrect: partialScore > 0,
            basePoints: pts.basePoints,
            bonusPoints: pts.bonusPoints,
            totalPoints: pts.totalPoints,
            scoredAt: new Date(),
          },
        });
      }
    }
  }
}

/** Admin-triggered full rescore: re-runs progressive bracket/semi scoring then rebuilds leaderboard. */
export async function recalculateStandings(groupId: string) {
  await requireAdmin(groupId);
  const tournament = await db.tournament.findFirst({ where: { groupId } });
  if (!tournament) return { error: "No tournament" };
  await scoreProgressiveTournamentBets(groupId, tournament.id);
  await recalculateLeaderboard(groupId, tournament.id);
  revalidatePath(`/group/${groupId}`);
  revalidatePath(`/group/${groupId}/bets`);
  return { success: true };
}

/**
 * Recalculate and persist leaderboard entries for all approved members.
 */
export async function recalculateLeaderboard(groupId: string, tournamentId: string) {
  const members = await db.groupMembership.findMany({
    where: { groupId, status: "APPROVED" },
    select: { userId: true },
  });

  for (const { userId } of members) {
    const bets = await db.bet.findMany({
      where: { userId, tournamentId, scoredAt: { not: null } },
      include: { betType: true },
    });

    let tournamentPts = 0;
    let perGamePts = 0;
    let curatedPts = 0;
    let correctBets = 0;

    for (const bet of bets) {
      const pts = bet.totalPoints ?? 0;
      if (bet.betType.category === "TOURNAMENT") tournamentPts += pts;
      else if (bet.betType.category === "PER_GAME") perGamePts += pts;
      else if (bet.betType.category === "CURATED") curatedPts += pts;
      if (bet.isCorrect) correctBets++;
    }

    const totalPoints = tournamentPts + perGamePts + curatedPts;

    await db.leaderboardEntry.upsert({
      where: { userId_groupId_tournamentId: { userId, groupId, tournamentId } },
      create: {
        userId,
        groupId,
        tournamentId,
        totalPoints,
        tournamentPts,
        perGamePts,
        curatedPts,
        correctBets,
        totalBets: bets.length,
        rank: 0,
      },
      update: {
        totalPoints,
        tournamentPts,
        perGamePts,
        curatedPts,
        correctBets,
        totalBets: bets.length,
      },
    });
  }

  // Update ranks
  const entries = await db.leaderboardEntry.findMany({
    where: { groupId, tournamentId },
    orderBy: { totalPoints: "desc" },
  });

  await Promise.all(
    entries.map((e, i) =>
      db.leaderboardEntry.update({
        where: { id: e.id },
        data: { rank: i + 1 },
      })
    )
  );
}
