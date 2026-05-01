"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { DEFAULT_GROUP_SETTINGS, resolveGroupSettings, type GroupSettings, type SimulationSnapshot, type SimulationAwards } from "@/lib/settings";
import { WC2026_TEAMS } from "@/lib/data/wc2026";
import { generateRandomScore } from "@/lib/simulation";
import { scoreBets } from "@/lib/scoring";
import { recalculateLeaderboard } from "@/lib/actions/results";
import {
  calculateGroupStandings,
  bestThirdPlaceTeams,
  isGroupStageComplete,
  isPhaseComplete,
  createR32Matches,
  getKnockoutWinners,
  createNextRoundMatches,
  generateKnockoutScore,
} from "@/lib/tournament-engine";
import { Prisma } from "@prisma/client";

async function requireAdmin(groupId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") throw new Error("Not authorized");
  return session;
}

/**
 * Core simulation logic: complete matches, progress through knockout stages,
 * and auto-resolve bet types. Used by both activate and update.
 */
async function simulateTournamentProgression(
  groupId: string,
  tournamentId: string,
  simulatedDate: Date,
  awards?: SimulationAwards
) {
  // Helper: complete upcoming matches before simulated date and score them
  async function completeMatchesBefore(date: Date, useKnockoutScoring: boolean) {
    const matches = await db.match.findMany({
      where: { tournamentId, status: "UPCOMING", kickoffAt: { lt: date }, actualHomeScore: null },
    });

    for (const match of matches) {
      const score = useKnockoutScoring && match.phase !== "GROUP"
        ? generateKnockoutScore()
        : generateRandomScore();

      await db.match.update({
        where: { id: match.id },
        data: {
          actualHomeScore: score.homeScore,
          actualAwayScore: score.awayScore,
          status: "COMPLETED",
        },
      });

      await scoreBets(groupId, tournamentId, match.id);
    }

    return matches.length;
  }

  // Step 1: Complete group-stage matches before simulated date
  let totalCompleted = await completeMatchesBefore(simulatedDate, false);

  // Step 2: Check if group stage is now complete → generate R32
  const allMatches = await db.match.findMany({
    where: { tournamentId },
    include: { homeTeam: true, awayTeam: true },
  });
  const teams = await db.team.findMany({ where: { tournamentId } });

  if (isGroupStageComplete(allMatches)) {
    const hasR32 = allMatches.some((m) => m.phase === "R32");
    const standings = calculateGroupStandings(allMatches, teams);

    // Idempotent helpers — hoisted out of the !hasR32 branch so re-running simulation
    // can backfill scoring even when R32 was already created in a prior pass.
    await autoResolveGroupPredictions(groupId, tournamentId, standings, allMatches);

    const { bestThirdPlaceTeams: btp } = await import("@/lib/tournament-engine");
    const advancingCodes = new Set<string>();
    for (const group of Object.values(standings)) {
      if (group[0]) advancingCodes.add(group[0].code);
      if (group[1]) advancingCodes.add(group[1].code);
    }
    for (const t of btp(standings as Parameters<typeof btp>[0])) advancingCodes.add(t.code);
    await autoResolveReverseDarkHorse(groupId, tournamentId, advancingCodes);

    if (!hasR32) {
      await createR32Matches(tournamentId, standings);
      await autoOpenPostGroupBets(tournamentId, simulatedDate);
      totalCompleted += await completeMatchesBefore(simulatedDate, true);
    }
  }

  // Step 3: Chain through knockout rounds
  const KNOCKOUT_PHASES = ["R32", "R16", "QF", "SF"] as const;

  for (const phase of KNOCKOUT_PHASES) {
    // Re-fetch matches to see newly created ones
    const currentMatches = await db.match.findMany({
      where: { tournamentId },
      include: { homeTeam: true, awayTeam: true },
    });

    if (!isPhaseComplete(currentMatches, phase)) continue;

    const nextPhase = { R32: "R16", R16: "QF", QF: "SF", SF: "FINAL" }[phase];
    const hasNextPhase = currentMatches.some((m) => m.phase === nextPhase);

    if (!hasNextPhase) {
      const winners = getKnockoutWinners(currentMatches, phase);
      if (winners.length > 0) {
        await createNextRoundMatches(tournamentId, phase, winners);

        // Auto-open semifinalists when R16 teams are known (R32 complete)
        if (nextPhase === "R16") {
          await autoOpenAfterR32Bets(tournamentId, simulatedDate);
        }

        // Auto-resolve dark_horse when QF teams are known (R16 complete)
        if (nextPhase === "QF") {
          const qfTeamCodes = new Set(
            winners.map((id) => teams.find((t) => t.id === id)?.code).filter(Boolean) as string[]
          );
          await autoResolveDarkHorse(groupId, tournamentId, qfTeamCodes);
        }

        // Auto-resolve semifinalists bet when SF matches are created
        if (nextPhase === "FINAL") {
          // SF is complete, so the 4 semifinalists were the SF participants
          const sfMatches = currentMatches.filter((m) => m.phase === "SF");
          const sfTeamIds = new Set<string>();
          for (const m of sfMatches) {
            sfTeamIds.add(m.homeTeamId);
            sfTeamIds.add(m.awayTeamId);
          }
          await autoResolveSemifinalists(groupId, tournamentId, sfTeamIds, teams);
        }

        // Complete next round matches before simulated date
        totalCompleted += await completeMatchesBefore(simulatedDate, true);
      }
    }
  }

  // Step 4: Check if FINAL is complete → resolve winner/runner_up
  const finalMatches = await db.match.findMany({
    where: { tournamentId },
    include: { homeTeam: true, awayTeam: true },
  });

  if (isPhaseComplete(finalMatches, "FINAL")) {
    await autoResolveWinnerRunnerUp(groupId, tournamentId, finalMatches, teams);
    await autoResolveBracket(groupId, tournamentId, finalMatches, teams);
  }

  // Auto-resolve awards if provided
  if (awards) {
    await autoResolveAwards(groupId, tournamentId, awards);
  }

  // Always recalculate leaderboard — tournament bets may have been scored
  // even if no new matches were completed in this pass.
  await recalculateLeaderboard(groupId, tournamentId);
}

// ─── Auto-resolve helpers ───

async function autoOpenPostGroupBets(tournamentId: string, simulatedDate: Date) {
  const POST_GROUP_SUBTYPES = ["bracket", "golden_ball", "golden_glove"];
  const bets = await db.betType.findMany({
    where: { tournamentId, subType: { in: POST_GROUP_SUBTYPES }, status: "DRAFT" },
  });
  for (const bt of bets) {
    await db.betType.update({
      where: { id: bt.id },
      data: { status: "OPEN", opensAt: simulatedDate },
    });
  }
}

async function autoOpenAfterR32Bets(tournamentId: string, simulatedDate: Date) {
  const AFTER_R32_SUBTYPES = ["semifinalists"];
  const bets = await db.betType.findMany({
    where: { tournamentId, subType: { in: AFTER_R32_SUBTYPES }, status: "DRAFT" },
  });
  for (const bt of bets) {
    await db.betType.update({
      where: { id: bt.id },
      data: { status: "OPEN", opensAt: simulatedDate },
    });
  }
}

async function autoResolveGroupPredictions(
  groupId: string,
  tournamentId: string,
  standings: Record<string, Array<{ teamId: string; code: string }>>,
  allMatches: Array<{ homeTeamId: string; awayTeamId: string; phase: string; status: string }>
) {
  const betType = await db.betType.findFirst({
    where: { tournamentId, subType: "group_predictions" },
  });
  if (!betType || betType.status === "RESOLVED") return;

  // Winners: 1st place per group
  const winners: Record<string, string> = {};
  for (const [letter, group] of Object.entries(standings)) {
    if (group[0]) winners[letter] = group[0].code;
  }

  // Advancing: top 2 per group (24) + 8 best 3rd = 32
  const { bestThirdPlaceTeams } = await import("@/lib/tournament-engine");
  const advancingCodes: string[] = [];
  for (const group of Object.values(standings)) {
    if (group[0]) advancingCodes.push(group[0].code);
    if (group[1]) advancingCodes.push(group[1].code);
  }
  const third = bestThirdPlaceTeams(standings as unknown as Record<string, import("@/lib/tournament-engine").TeamStanding[]>);
  for (const t of third) advancingCodes.push(t.code);

  await db.betType.update({
    where: { id: betType.id },
    data: {
      status: "RESOLVED",
      resolution: { winners, advancing: advancingCodes } as unknown as Prisma.InputJsonValue,
      resolvedAt: new Date(),
    },
  });

  await scoreBets(groupId, tournamentId, null, betType.id);
}

async function autoResolveSemifinalists(
  groupId: string,
  tournamentId: string,
  sfTeamIds: Set<string>,
  teams: Array<{ id: string; code: string }>
) {
  const betType = await db.betType.findFirst({
    where: { tournamentId, subType: "semifinalists" },
  });
  if (!betType || betType.status === "RESOLVED") return;

  const teamCodes = teams
    .filter((t) => sfTeamIds.has(t.id))
    .map((t) => t.code);

  await db.betType.update({
    where: { id: betType.id },
    data: {
      status: "RESOLVED",
      resolution: { teams: teamCodes } as unknown as Prisma.InputJsonValue,
      resolvedAt: new Date(),
    },
  });

  await scoreBets(groupId, tournamentId, null, betType.id);
}

async function autoResolveWinnerRunnerUp(
  groupId: string,
  tournamentId: string,
  matches: Array<{
    phase: string;
    status: string;
    homeTeamId: string;
    awayTeamId: string;
    actualHomeScore: number | null;
    actualAwayScore: number | null;
    homeTeam: { id: string; code: string };
    awayTeam: { id: string; code: string };
  }>,
  teams: Array<{ id: string; code: string }>
) {
  const final = matches.find((m) => m.phase === "FINAL" && m.status === "COMPLETED");
  if (!final || final.actualHomeScore == null || final.actualAwayScore == null) return;

  const winnerId = final.actualHomeScore >= final.actualAwayScore
    ? final.homeTeamId
    : final.awayTeamId;
  const loserId = final.actualHomeScore >= final.actualAwayScore
    ? final.awayTeamId
    : final.homeTeamId;

  const winnerCode = teams.find((t) => t.id === winnerId)?.code;
  const loserCode = teams.find((t) => t.id === loserId)?.code;

  // Resolve winner
  const winnerBt = await db.betType.findFirst({
    where: { tournamentId, subType: "winner" },
  });
  if (winnerBt && winnerBt.status !== "RESOLVED" && winnerCode) {
    await db.betType.update({
      where: { id: winnerBt.id },
      data: {
        status: "RESOLVED",
        resolution: { teamCode: winnerCode } as unknown as Prisma.InputJsonValue,
        resolvedAt: new Date(),
      },
    });
    await scoreBets(groupId, tournamentId, null, winnerBt.id);
  }

  // Resolve runner_up
  const runnerUpBt = await db.betType.findFirst({
    where: { tournamentId, subType: "runner_up" },
  });
  if (runnerUpBt && runnerUpBt.status !== "RESOLVED" && loserCode) {
    await db.betType.update({
      where: { id: runnerUpBt.id },
      data: {
        status: "RESOLVED",
        resolution: { teamCode: loserCode } as unknown as Prisma.InputJsonValue,
        resolvedAt: new Date(),
      },
    });
    await scoreBets(groupId, tournamentId, null, runnerUpBt.id);
  }
}

async function autoResolveDarkHorse(
  groupId: string,
  tournamentId: string,
  qfTeamCodes: Set<string>
) {
  const betType = await db.betType.findFirst({ where: { tournamentId, subType: "dark_horse" } });
  if (!betType || betType.status === "RESOLVED") return;

  const sortedByOdds = [...WC2026_TEAMS].sort((a, b) => b.odds.winnerOdds - a.odds.winnerOdds);
  const darkHorseCandidates = new Set(sortedByOdds.slice(0, 35).map((t) => t.code));
  const qualifiers = [...qfTeamCodes].filter((code) => darkHorseCandidates.has(code));

  await db.betType.update({
    where: { id: betType.id },
    data: {
      status: "RESOLVED",
      resolution: { teams: qualifiers } as unknown as Prisma.InputJsonValue,
      resolvedAt: new Date(),
    },
  });
  await scoreBets(groupId, tournamentId, null, betType.id);
}

async function autoResolveReverseDarkHorse(
  groupId: string,
  tournamentId: string,
  advancingCodes: Set<string>
) {
  const betType = await db.betType.findFirst({ where: { tournamentId, subType: "reverse_dark_horse" } });
  if (!betType || betType.status === "RESOLVED") return;

  // Top 15 favourites (lowest winnerOdds); correct if they did NOT advance from group stage
  const sortedByOdds = [...WC2026_TEAMS].sort((a, b) => a.odds.winnerOdds - b.odds.winnerOdds);
  const favCandidates = sortedByOdds.slice(0, 15).map((t) => t.code);
  const eliminatedInGroups = favCandidates.filter((code) => !advancingCodes.has(code));

  await db.betType.update({
    where: { id: betType.id },
    data: {
      status: "RESOLVED",
      resolution: { teams: eliminatedInGroups } as unknown as Prisma.InputJsonValue,
      resolvedAt: new Date(),
    },
  });
  await scoreBets(groupId, tournamentId, null, betType.id);
}

async function autoResolveBracket(
  groupId: string,
  tournamentId: string,
  matches: Array<{
    id: string;
    phase: string;
    status: string;
    homeTeamId: string;
    awayTeamId: string;
    kickoffAt: Date;
    actualHomeScore: number | null;
    actualAwayScore: number | null;
  }>,
  teams: Array<{ id: string; code: string }>
) {
  const betType = await db.betType.findFirst({ where: { tournamentId, subType: "bracket" } });
  if (!betType || betType.status === "RESOLVED") return;

  const KNOCKOUT_PHASES = ["R32", "R16", "QF", "SF", "FINAL"] as const;
  const winners: Record<string, string> = {};

  for (const phase of KNOCKOUT_PHASES) {
    const phaseMatches = matches
      .filter((m) => m.phase === phase && m.status === "COMPLETED")
      .sort(
        (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime()
      );
    phaseMatches.forEach((m, i) => {
      if (m.actualHomeScore == null || m.actualAwayScore == null) return;
      const winnerId =
        m.actualHomeScore >= m.actualAwayScore ? m.homeTeamId : m.awayTeamId;
      const winnerCode = teams.find((t) => t.id === winnerId)?.code;
      if (winnerCode) winners[`${phase}-${i}`] = winnerCode;
    });
  }

  if (Object.keys(winners).length === 0) return;

  await db.betType.update({
    where: { id: betType.id },
    data: {
      status: "RESOLVED",
      resolution: { winners } as unknown as Prisma.InputJsonValue,
      resolvedAt: new Date(),
    },
  });
  await scoreBets(groupId, tournamentId, null, betType.id);
}

async function autoResolveAwards(
  groupId: string,
  tournamentId: string,
  awards: SimulationAwards
) {
  const awardMap: Array<{ subType: string; playerName: string | undefined }> = [
    { subType: "golden_boot", playerName: awards.goldenBoot },
    { subType: "golden_ball", playerName: awards.goldenBall },
    { subType: "golden_glove", playerName: awards.goldenGlove },
  ];

  for (const { subType, playerName } of awardMap) {
    if (!playerName) continue;
    const betType = await db.betType.findFirst({ where: { tournamentId, subType } });
    if (!betType || betType.status === "RESOLVED") continue;

    await db.betType.update({
      where: { id: betType.id },
      data: {
        status: "RESOLVED",
        resolution: { playerName } as unknown as Prisma.InputJsonValue,
        resolvedAt: new Date(),
      },
    });
    await scoreBets(groupId, tournamentId, null, betType.id);
  }
}

// ─── Public simulation actions ───

/**
 * Activate simulation mode for a group.
 */
export async function activateSimulation(groupId: string, simulatedDateStr: string, awards?: SimulationAwards) {
  await requireAdmin(groupId);

  const simulatedDate = new Date(simulatedDateStr);
  if (isNaN(simulatedDate.getTime())) return { error: "Invalid date" };

  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) return { error: "Group not found" };

  const tournament = await db.tournament.findFirst({
    where: { groupId },
    include: { betTypes: true, matches: true },
  });
  if (!tournament) return { error: "No tournament found" };

  // Save snapshot of current state for reset
  const snapshot: SimulationSnapshot = {
    betTypes: tournament.betTypes.map((bt) => ({
      id: bt.id,
      status: bt.status,
      opensAt: bt.opensAt?.toISOString() ?? null,
      locksAt: bt.locksAt?.toISOString() ?? null,
      resolvedAt: bt.resolvedAt?.toISOString() ?? null,
    })),
    matches: tournament.matches.map((m) => ({
      id: m.id,
      status: m.status,
      actualHomeScore: m.actualHomeScore,
      actualAwayScore: m.actualAwayScore,
    })),
  };

  // Apply bet type transitions based on opensAt/locksAt
  await applyBetTypeTransitions(tournament.betTypes, simulatedDate);

  // Run full tournament progression
  await simulateTournamentProgression(groupId, tournament.id, simulatedDate, awards);

  // Save simulation config
  const currentSettings = resolveGroupSettings(group.settings);
  await db.group.update({
    where: { id: groupId },
    data: {
      settings: {
        ...currentSettings,
        simulation: { enabled: true, simulatedDate: simulatedDateStr, snapshot, awards },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/group/${groupId}`);
  return { success: true };
}

/**
 * Update the simulation date. Resets to snapshot and re-applies at new date.
 */
export async function updateSimulationDate(groupId: string, newDateStr: string, awards?: SimulationAwards) {
  await requireAdmin(groupId);

  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) return { error: "Group not found" };

  const settings = resolveGroupSettings(group.settings);
  if (!settings.simulation?.enabled) return { error: "Simulation not active" };

  const newDate = new Date(newDateStr);
  if (isNaN(newDate.getTime())) return { error: "Invalid date" };

  const isMovingForward = newDate > new Date(settings.simulation.simulatedDate);

  if (!isMovingForward) {
    // Moving backward: full restore so over-simulated matches are wiped
    await restoreSnapshot(groupId, settings.simulation.snapshot);
  } else {
    // Moving forward: keep match results (random scores stay stable) but
    // clear tournament-bet scores so they get re-scored with current settings.
    const tournament0 = await db.tournament.findFirst({ where: { groupId } });
    if (tournament0) {
      const tournamentBetTypeIds = (
        await db.betType.findMany({
          where: { tournamentId: tournament0.id, category: { not: "PER_GAME" } },
          select: { id: true },
        })
      ).map((bt) => bt.id);

      await db.bet.updateMany({
        where: { tournamentId: tournament0.id, betTypeId: { in: tournamentBetTypeIds }, scoredAt: { not: null } },
        data: { isCorrect: null, basePoints: null, bonusPoints: null, totalPoints: null, scoredAt: null },
      });

      // Un-resolve tournament bet types so they get re-resolved and re-scored.
      await db.betType.updateMany({
        where: { id: { in: tournamentBetTypeIds }, status: "RESOLVED" },
        data: { status: "LOCKED", resolution: Prisma.JsonNull, resolvedAt: null },
      });
    }
  }

  // Re-fetch tournament after potential restore
  const tournament = await db.tournament.findFirst({
    where: { groupId },
    include: { betTypes: true, matches: true },
  });
  if (!tournament) return { error: "No tournament found" };

  // Apply bet type transitions
  await applyBetTypeTransitions(tournament.betTypes, newDate);

  // Use newly provided awards, or fall back to previously stored ones
  const effectiveAwards = awards ?? settings.simulation.awards;

  // Run full tournament progression
  await simulateTournamentProgression(groupId, tournament.id, newDate, effectiveAwards);

  // Update simulation config (keep original snapshot, update awards if provided)
  await db.group.update({
    where: { id: groupId },
    data: {
      settings: {
        ...settings,
        simulation: {
          ...settings.simulation,
          simulatedDate: newDateStr,
          ...(awards !== undefined && { awards }),
        },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/group/${groupId}`);
  return { success: true };
}

/**
 * Reset simulation mode — restore all state from snapshot.
 */
export async function resetSimulation(groupId: string) {
  await requireAdmin(groupId);

  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) return { error: "Group not found" };

  const settings = resolveGroupSettings(group.settings);
  if (!settings.simulation?.enabled) return { error: "Simulation not active" };

  await restoreSnapshot(groupId, settings.simulation.snapshot);

  // Clear simulation from settings
  const { simulation: _, ...restSettings } = settings;
  await db.group.update({
    where: { id: groupId },
    data: { settings: restSettings as unknown as Prisma.InputJsonValue },
  });

  // Clear leaderboard
  const tournament = await db.tournament.findFirst({ where: { groupId } });
  if (tournament) {
    await db.leaderboardEntry.deleteMany({
      where: { groupId, tournamentId: tournament.id },
    });
  }

  revalidatePath(`/group/${groupId}`);
  return { success: true };
}

// ─── Helpers ───

async function applyBetTypeTransitions(
  betTypes: Array<{
    id: string;
    status: string;
    opensAt: Date | null;
    locksAt: Date | null;
  }>,
  simulatedDate: Date
) {
  for (const bt of betTypes) {
    if (bt.status === "DRAFT" && bt.opensAt && simulatedDate >= bt.opensAt) {
      if (bt.locksAt && simulatedDate >= bt.locksAt) {
        await db.betType.update({ where: { id: bt.id }, data: { status: "LOCKED" } });
      } else {
        await db.betType.update({ where: { id: bt.id }, data: { status: "OPEN" } });
      }
    } else if (bt.status === "OPEN" && bt.locksAt && simulatedDate >= bt.locksAt) {
      await db.betType.update({ where: { id: bt.id }, data: { status: "LOCKED" } });
    }
  }
}

async function restoreSnapshot(groupId: string, snapshot: SimulationSnapshot) {
  const tournament = await db.tournament.findFirst({ where: { groupId } });
  if (!tournament) return;

  const snapshotMatchIds = new Set(snapshot.matches.map((m) => m.id));

  // Detect stale snapshot: if none of the snapshot match IDs exist in the current tournament,
  // the snapshot is from a previous (deleted + re-initialized) tournament.
  // In that case do a full reset instead of trying to restore by ID.
  const matchingCount = await db.match.count({
    where: { tournamentId: tournament.id, id: { in: [...snapshotMatchIds] } },
  });
  const snapshotIsStale = snapshot.matches.length > 0 && matchingCount === 0;

  if (snapshotIsStale) {
    // Full reset: delete knockout matches created by simulation, reset all bet types to DRAFT
    await db.match.deleteMany({ where: { tournamentId: tournament.id, phase: { not: "GROUP" } } });
    await db.betType.updateMany({
      where: { tournamentId: tournament.id },
      data: { status: "DRAFT", resolution: Prisma.JsonNull, resolvedAt: null },
    });
    await db.match.updateMany({
      where: { tournamentId: tournament.id },
      data: { status: "UPCOMING", actualHomeScore: null, actualAwayScore: null },
    });
  } else {
    // Normal restore: only delete knockout matches that weren't in the original snapshot
    const simulatedMatchIds = (
      await db.match.findMany({
        where: { tournamentId: tournament.id, id: { notIn: [...snapshotMatchIds] } },
        select: { id: true },
      })
    ).map((m) => m.id);

    if (simulatedMatchIds.length > 0) {
      await db.bet.deleteMany({ where: { matchId: { in: simulatedMatchIds } } });
      await db.match.deleteMany({ where: { id: { in: simulatedMatchIds } } });
    }

    await db.$transaction([
      ...snapshot.betTypes.map((bt) =>
        db.betType.updateMany({
          where: { id: bt.id },
          data: {
            status: bt.status as "DRAFT" | "OPEN" | "LOCKED" | "RESOLVED",
            opensAt: bt.opensAt ? new Date(bt.opensAt) : null,
            locksAt: bt.locksAt ? new Date(bt.locksAt) : null,
            resolvedAt: bt.resolvedAt ? new Date(bt.resolvedAt) : null,
            resolution: Prisma.JsonNull,
          },
        })
      ),
      ...snapshot.matches.map((m) =>
        db.match.updateMany({
          where: { id: m.id },
          data: {
            status: m.status as "UPCOMING" | "LOCKED" | "COMPLETED",
            actualHomeScore: m.actualHomeScore,
            actualAwayScore: m.actualAwayScore,
          },
        })
      ),
    ]);
  }

  // Clear scoring data
  await db.bet.updateMany({
    where: { tournamentId: tournament.id, scoredAt: { not: null } },
    data: {
      isCorrect: null,
      basePoints: null,
      bonusPoints: null,
      totalPoints: null,
      scoredAt: null,
    },
  });
}
