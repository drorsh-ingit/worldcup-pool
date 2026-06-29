"use server";

import { db } from "@/lib/db";
import { WC2026_TEAMS } from "@/lib/data/wc2026";
import { scoreBets } from "@/lib/scoring";
import { promoteBetTypeGlobally } from "@/lib/actions/refresh-odds";
import {
  calculateGroupStandings,
  bestThirdPlaceTeams,
  isGroupStageComplete,
  isPhaseComplete,
  createR32Matches,
  getKnockoutWinners,
  createNextRoundMatches,
  syncPhaseBetLocks,
  knockoutWinnerTeamId,
  compareByBracketSlot,
} from "@/lib/tournament-engine";
import { Prisma } from "@prisma/client";

/**
 * Progress a tournament after a match result is entered.
 * Idempotent — safe to call after every match. Only acts when a phase completes.
 *
 * Handles: creating knockout rounds, opening/resolving tournament bet types,
 * syncing bet lock times.
 */
export async function progressTournament(groupId: string, tournamentId: string) {
  const allMatches = await db.match.findMany({
    where: { tournamentId },
    include: { homeTeam: true, awayTeam: true },
  });
  const teams = await db.team.findMany({ where: { tournamentId } });
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: { kind: true },
  });
  if (!tournament) return;

  // ── Group stage complete → create R32, resolve group bets ──────────────
  if (isGroupStageComplete(allMatches)) {
    const hasR32 = allMatches.some((m) => m.phase === "R32");
    const standings = calculateGroupStandings(allMatches, teams);

    // Always try to resolve (idempotent — skips if already resolved)
    await autoResolveGroupPredictions(groupId, tournamentId, standings);
    const advancingCodes = new Set<string>();
    for (const group of Object.values(standings)) {
      if (group[0]) advancingCodes.add(group[0].code);
      if (group[1]) advancingCodes.add(group[1].code);
    }
    for (const t of bestThirdPlaceTeams(standings)) advancingCodes.add(t.code);
    await autoResolveReverseDarkHorse(groupId, tournamentId, advancingCodes);

    if (!hasR32) {
      await createR32Matches(tournamentId, standings);
    }

    // Open knockout-stage bets (bracket, golden ball, golden glove) once the full
    // 16-match R32 bracket exists — whether auto-created above from standings or
    // progressively published by the live feed (reconcile.ts). Decoupled from the
    // !hasR32 creation guard above so feed-created fixtures don't block the opening.
    // openBetsByTrigger only promotes DRAFT bet types, so re-running it is a no-op.
    const r32Count = await db.match.count({ where: { tournamentId, phase: "R32" } });
    if (r32Count >= 16) {
      await openBetsByTrigger(tournamentId, tournament.kind, "AFTER_GROUP_STAGE");
      await syncPhaseBetLocks(tournamentId);
    }
  }

  // ── Knockout phase progression ─────────────────────────────────────────
  const KNOCKOUT_PHASES = ["R32", "R16", "QF", "SF"] as const;

  for (const phase of KNOCKOUT_PHASES) {
    // Re-fetch to see newly created matches
    const currentMatches = await db.match.findMany({
      where: { tournamentId },
      include: { homeTeam: true, awayTeam: true },
    });

    if (!isPhaseComplete(currentMatches, phase)) continue;

    const nextPhase = { R32: "R16", R16: "QF", QF: "SF", SF: "FINAL" }[phase]!;
    const hasNextPhase = currentMatches.some((m) => m.phase === nextPhase);

    if (!hasNextPhase) {
      const winners = getKnockoutWinners(currentMatches, phase);
      if (winners.length === 0) continue;

      await createNextRoundMatches(tournamentId, phase, winners);
      await syncPhaseBetLocks(tournamentId);

      if (phase === "R32") {
        await openBetsByTrigger(tournamentId, tournament.kind, "AFTER_R32");
      }

      if (phase === "R16") {
        const qfTeamCodes = new Set(
          winners.map((id) => teams.find((t) => t.id === id)?.code).filter(Boolean) as string[]
        );
        await autoResolveDarkHorse(groupId, tournamentId, qfTeamCodes);
      }

      if (phase === "SF") {
        const sfMatches = currentMatches.filter((m) => m.phase === "SF");
        const sfTeamIds = new Set<string>();
        for (const m of sfMatches) {
          sfTeamIds.add(m.homeTeamId);
          sfTeamIds.add(m.awayTeamId);
        }
        await autoResolveSemifinalists(groupId, tournamentId, sfTeamIds, teams);
      }
    }
  }

  // ── Final complete → resolve winner/runner_up/bracket ──────────────────
  const finalMatches = await db.match.findMany({
    where: { tournamentId },
    include: { homeTeam: true, awayTeam: true },
  });

  if (isPhaseComplete(finalMatches, "FINAL")) {
    await autoResolveWinnerRunnerUp(groupId, tournamentId, finalMatches, teams);
    await autoResolveBracket(groupId, tournamentId, finalMatches, teams);
  }

}

// ── Bet type opening via promoteBetTypeGlobally ──────────────────────────

const TRIGGER_SUBTYPES: Record<string, string[]> = {
  AFTER_GROUP_STAGE: ["bracket", "golden_ball", "golden_glove"],
  AFTER_R32: ["semifinalists"],
};

async function openBetsByTrigger(
  tournamentId: string,
  tournamentKind: string,
  trigger: string
) {
  const subTypes = TRIGGER_SUBTYPES[trigger];
  if (!subTypes) return;

  const betTypes = await db.betType.findMany({
    where: { tournamentId, subType: { in: subTypes }, status: "DRAFT" },
  });

  for (const bt of betTypes) {
    await promoteBetTypeGlobally(tournamentId, tournamentKind, bt, {
      isolated: false,
    });
  }
}

// ── Auto-resolve helpers ─────────────────────────────────────────────────

async function autoResolveGroupPredictions(
  groupId: string,
  tournamentId: string,
  standings: Record<string, Array<{ teamId: string; code: string }>>
) {
  const betType = await db.betType.findFirst({
    where: { tournamentId, subType: "group_predictions" },
  });
  if (!betType || betType.status === "RESOLVED") return;

  const winners: Record<string, string> = {};
  for (const [letter, group] of Object.entries(standings)) {
    if (group[0]) winners[letter] = group[0].code;
  }

  const advancingCodes: string[] = [];
  for (const group of Object.values(standings)) {
    if (group[0]) advancingCodes.push(group[0].code);
    if (group[1]) advancingCodes.push(group[1].code);
  }
  const third = bestThirdPlaceTeams(
    standings as unknown as Record<string, import("@/lib/tournament-engine").TeamStanding[]>
  );
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

async function autoResolveReverseDarkHorse(
  groupId: string,
  tournamentId: string,
  advancingCodes: Set<string>
) {
  const betType = await db.betType.findFirst({
    where: { tournamentId, subType: "reverse_dark_horse" },
  });
  if (!betType || betType.status === "RESOLVED") return;

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

async function autoResolveDarkHorse(
  groupId: string,
  tournamentId: string,
  qfTeamCodes: Set<string>
) {
  const betType = await db.betType.findFirst({
    where: { tournamentId, subType: "dark_horse" },
  });
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
    winnerTeamId: string | null;
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
  if (!final) return;

  const winnerId = knockoutWinnerTeamId(final);
  if (!winnerId) return;
  const loserId = winnerId === final.homeTeamId ? final.awayTeamId : final.homeTeamId;

  const winnerCode = teams.find((t) => t.id === winnerId)?.code;
  const loserCode = teams.find((t) => t.id === loserId)?.code;

  const winnerBt = await db.betType.findFirst({ where: { tournamentId, subType: "winner" } });
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

  const runnerUpBt = await db.betType.findFirst({ where: { tournamentId, subType: "runner_up" } });
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

async function autoResolveBracket(
  groupId: string,
  tournamentId: string,
  matches: Array<{
    id: string;
    phase: string;
    status: string;
    winnerTeamId: string | null;
    homeTeamId: string;
    awayTeamId: string;
    kickoffAt: Date;
    bracketSlot: number | null;
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
      .sort(compareByBracketSlot);
    phaseMatches.forEach((m, i) => {
      const slot = m.bracketSlot ?? i;
      const winnerId = knockoutWinnerTeamId(m);
      if (!winnerId) return;
      const winnerCode = teams.find((t) => t.id === winnerId)?.code;
      if (winnerCode) winners[`${phase}-${slot}`] = winnerCode;
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
