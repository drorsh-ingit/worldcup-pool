"use server";

/**
 * Feed-driven tournament reconciler.
 *
 * Pulls the football-data.org WC feed and makes the DB match reality with zero admin
 * input: writes pens-excluded scores + the actual advancer (winnerTeamId), mirrors the
 * real knockout fixtures (correct FIFA seeding), and resolves every tournament bet from
 * feed truth. Idempotent — safe to run on a short interval.
 *
 * Source of truth split:
 *   - Bracket/progression display → stored 90'/120' score (penalties excluded), via regulationScore().
 *   - match_winner/correct_score bets → 90'-only score, via ninetyMinuteScore().
 *   - Progression  → who actually advanced, via score.winner → Match.winnerTeamId.
 *   - Group winners→ /standings position 1; advancers → who is actually in the R32 fixtures
 *                    (sidesteps the best-third-place tiebreak entirely).
 *
 * The real path does NOT go through progressTournament (whose internal bracket seeding is
 * superseded by the feed). progressTournament + simulation keep their own copies.
 */

import { db } from "@/lib/db";
import { Prisma, type MatchPhase } from "@prisma/client";
import {
  fetchWCSchedule,
  fetchWCStandings,
  fetchWCScorers,
  regulationScore,
  ninetyMinuteScore,
  fdWinnerCode,
  type FDMatch,
  type FDStandingGroup,
  type FDScorer,
} from "@/lib/football-data";
import { fdTlaToCode } from "@/lib/wc-team-map";
import { fetchEspnKnockoutFixtures } from "@/lib/espn-live";
import { WC2026_TEAMS } from "@/lib/data/wc2026";
import { scoreBets } from "@/lib/scoring";
import { knockoutWinnerTeamId, syncPhaseBetLocks, stampBracketSlots, compareByBracketSlot } from "@/lib/tournament-engine";
import { recalculateLeaderboard, scoreProgressiveTournamentBets } from "@/lib/actions/results";
import { snapshotOddsForBetType } from "@/lib/actions/refresh-odds";

const FD_STAGE_TO_PHASE: Record<string, MatchPhase> = {
  GROUP_STAGE: "GROUP",
  LAST_32: "R32",
  LAST_16: "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS: "SF",
  FINAL: "FINAL",
  // THIRD_PLACE intentionally omitted — not part of our bracket and not bet on.
};

const PHASE_MULTIPLIER: Record<string, number> = {
  GROUP: 1.0, R32: 1.2, R16: 1.3, QF: 1.5, SF: 1.7, FINAL: 2.0,
};

// Expected participant counts per knockout phase — used as guards so we never resolve
// or open a bet mid-publication (e.g. group stage done but the feed hasn't filled all R32 teams).
const PHASE_TEAM_COUNT: Record<string, number> = { R32: 32, R16: 16, QF: 8, SF: 4, FINAL: 2 };

// A timeline bet (openTrigger) becomes available the moment the feed publishes the round
// it concerns — e.g. the bracket opens once all 32 R32 fixtures have teams. This replaces
// the stale hardcoded opensAt dates, which don't match the real schedule (R32 is Jun 28,
// not the Jul 2 the static data guessed). Lock times are handled by syncPhaseBetLocks.
const TRIGGER_OPENS_WHEN_PUBLISHED: Record<string, string> = {
  AFTER_GROUP_STAGE: "R32",
  AFTER_R32: "R16",
  AFTER_R16: "QF",
  AFTER_QF: "SF",
  AFTER_SF: "FINAL",
};

const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;

export type WCFeed = {
  matches: FDMatch[];
  standings: FDStandingGroup[];
  scorers: FDScorer[];
};

/** Fetch the three WC endpoints once (cheap; client caches for 55s). */
export async function fetchWCFeed(): Promise<WCFeed> {
  const [matches, standings, scorers] = await Promise.all([
    fetchWCSchedule(),
    fetchWCStandings().catch(() => [] as FDStandingGroup[]),
    fetchWCScorers().catch(() => [] as FDScorer[]),
  ]);
  return { matches, standings, scorers };
}

/**
 * Reconcile one tournament against the WC feed. Pass a pre-fetched feed when reconciling
 * many groups in one tick (the cron does this) so the API is hit once.
 */
export async function reconcileTournament(
  groupId: string,
  tournamentId: string,
  feed?: WCFeed
): Promise<{ completed: number; created: number }> {
  const f = feed ?? (await fetchWCFeed());

  const teams = await db.team.findMany({ where: { tournamentId } });
  const teamByCode = new Map(teams.map((t) => [t.code, t]));

  // Load all our matches once and index by externalId — avoids an N+1 lookup per feed match.
  const ourMatches = await db.match.findMany({
    where: { tournamentId },
    include: { homeTeam: true, awayTeam: true },
  });
  const byExternalId = new Map(
    ourMatches.filter((m) => m.externalId).map((m) => [m.externalId!, m])
  );

  let created = 0;
  const newlyCompleted: string[] = [];
  // Mapped, known participant codes per knockout phase (from the feed fixtures).
  const phaseTeamCodes: Record<string, Set<string>> = {};

  // ESPN publishes the knockout bracket sooner than football-data fills its fixture team
  // slots. Pre-fetch ESPN pairings for any KO fixture the feed hasn't fully named yet, so
  // we can fill them in — keyed to the feed's externalId below, so there are never dupes.
  const fdNamed = (fd: FDMatch) => {
    const h = fdTlaToCode(fd.homeTeam?.tla);
    const a = fdTlaToCode(fd.awayTeam?.tla);
    return !!(h && a && teamByCode.has(h) && teamByCode.has(a));
  };
  const unnamedKoDates = f.matches
    .filter((fd) => {
      const ph = FD_STAGE_TO_PHASE[fd.stage];
      return ph && ph !== "GROUP" && !fdNamed(fd);
    })
    .map((fd) => new Date(fd.utcDate));
  const espnFixtures = unnamedKoDates.length
    ? await fetchEspnKnockoutFixtures(unnamedKoDates, (c) => teamByCode.has(c)).catch(() => [])
    : [];

  // Resolve a feed KO fixture's teams from ESPN by kickoff (±2h). If the feed already
  // named one side, require ESPN to agree on it so we never cross-wire two fixtures.
  const resolveFromEspn = (fd: FDMatch, fdHome: string | null, fdAway: string | null) => {
    const fdMs = new Date(fd.utcDate).getTime();
    const named = [fdHome, fdAway].filter(Boolean) as string[];
    return espnFixtures.find(
      (e) =>
        Math.abs(e.kickoffMs - fdMs) <= 2 * 60 * 60 * 1000 &&
        named.every((c) => e.homeCode === c || e.awayCode === c)
    );
  };

  // ── 1. Mirror matches: update existing results, create knockout fixtures ──
  for (const fd of f.matches) {
    const phase = FD_STAGE_TO_PHASE[fd.stage];
    if (!phase) continue;

    let homeCode = fdTlaToCode(fd.homeTeam.tla);
    let awayCode = fdTlaToCode(fd.awayTeam.tla);

    // Feed hasn't named both teams for this KO fixture → fall back to ESPN's pairing.
    if (
      phase !== "GROUP" &&
      !(homeCode && awayCode && teamByCode.has(homeCode) && teamByCode.has(awayCode))
    ) {
      const espn = resolveFromEspn(fd, homeCode, awayCode);
      if (espn) {
        homeCode = espn.homeCode;
        awayCode = espn.awayCode;
      }
    }

    if (phase !== "GROUP") {
      if (homeCode && teamByCode.has(homeCode)) (phaseTeamCodes[phase] ??= new Set()).add(homeCode);
      if (awayCode && teamByCode.has(awayCode)) (phaseTeamCodes[phase] ??= new Set()).add(awayCode);
    }

    const existing = byExternalId.get(String(fd.id));

    if (existing) {
      if (await applyResult(existing, fd)) newlyCompleted.push(existing.id);
      continue;
    }

    // No row yet — create knockout fixtures once the feed has named both teams.
    // Group matches always exist from init (seeded externalIds), so this is KO-only.
    if (
      phase !== "GROUP" &&
      homeCode && awayCode &&
      teamByCode.has(homeCode) && teamByCode.has(awayCode)
    ) {
      const home = teamByCode.get(homeCode)!;
      const away = teamByCode.get(awayCode)!;
      let row;
      try {
        row = await db.match.create({
          data: {
            tournamentId,
            homeTeamId: home.id,
            awayTeamId: away.id,
            phase,
            matchday: 1,
            groupLetter: null,
            kickoffAt: new Date(fd.utcDate),
            multiplier: PHASE_MULTIPLIER[phase] ?? 1.0,
            externalId: String(fd.id),
            status: "UPCOMING",
          },
        });
      } catch (e) {
        // A concurrent reconcile (another viewer's on-demand trigger) already created this
        // fixture — the @@unique([tournamentId, externalId]) backstop rejected the dup.
        // Skip: that run, or the next tick, applies its result.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
      created++;
      if (fd.status === "FINISHED") {
        const withTeams = { ...row, homeTeam: home, awayTeam: away };
        if (await applyResult(withTeams, fd)) newlyCompleted.push(row.id);
      }
    }
  }

  // ── 1b. Stamp bracketSlot on every KO fixture (source of truth for bracket pairing). ──
  // Self-healing: corrects any rows created before bracketSlot existed or with a stale slot.
  await stampBracketSlots(tournamentId);

  // ── 2. Score per-game bets for matches that just completed ──
  for (const matchId of newlyCompleted) {
    await scoreBets(groupId, tournamentId, matchId);
  }

  // ── 3. Live bracket + semifinalist scoring from match data (uses winnerTeamId) ──
  await scoreProgressiveTournamentBets(groupId, tournamentId);

  // ── 4. Open timeline bets whose round the feed has now published ──
  const betTypes = await db.betType.findMany({ where: { tournamentId } });
  await openTimelineBets(tournamentId, betTypes, phaseTeamCodes);

  // ── 5. Resolve tournament bets from feed truth (idempotent) ──
  const allMatches = await db.match.findMany({
    where: { tournamentId },
    include: { homeTeam: true, awayTeam: true },
  });

  const groupMatches = allMatches.filter((m) => m.phase === "GROUP");
  const groupComplete =
    groupMatches.length > 0 && groupMatches.every((m) => m.status === "COMPLETED");

  const r32Teams = phaseTeamCodes.R32 ?? new Set<string>();
  const qfTeams = phaseTeamCodes.QF ?? new Set<string>();
  const sfTeams = phaseTeamCodes.SF ?? new Set<string>();

  // group_predictions + reverse_dark_horse: only once all 32 advancers are published.
  if (groupComplete && r32Teams.size >= PHASE_TEAM_COUNT.R32) {
    await resolveGroupPredictions(groupId, tournamentId, betTypes, r32Teams, f.standings);
    await resolveReverseDarkHorse(groupId, tournamentId, betTypes, r32Teams);
  }

  // dark_horse: once the 8 quarter-finalists are known.
  if (qfTeams.size >= PHASE_TEAM_COUNT.QF) {
    await resolveDarkHorse(groupId, tournamentId, betTypes, qfTeams);
  }

  // semifinalists: once the 4 semi-finalists are known.
  if (sfTeams.size >= PHASE_TEAM_COUNT.SF) {
    await resolveSemifinalists(groupId, tournamentId, betTypes, [...sfTeams].slice(0, 4));
  }

  // winner / runner_up / bracket / golden_boot: once the final is decided.
  const final = allMatches.find((m) => m.phase === "FINAL" && m.status === "COMPLETED");
  if (final) {
    await resolveWinnerRunnerUp(groupId, tournamentId, betTypes, final);
    await resolveBracket(groupId, tournamentId, betTypes, allMatches, teams);
    await resolveGoldenBoot(groupId, tournamentId, betTypes, f.scorers);
  }

  // ── 6. Keep phase bet-locks aligned to real kickoffs, recalc leaderboard ──
  await syncPhaseBetLocks(tournamentId);
  await recalculateLeaderboard(groupId, tournamentId);

  return { completed: newlyCompleted.length, created };
}

type MatchWithTeams = {
  id: string;
  status: string;
  winnerTeamId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { id: string; code: string };
  awayTeam: { id: string; code: string };
};

/** Write a finished match's pens-excluded score + actual winner. Returns true if it newly completed. */
async function applyResult(m: MatchWithTeams, fd: FDMatch): Promise<boolean> {
  if (m.status === "COMPLETED") return false;
  if (fd.status !== "FINISHED") return false;

  const reg = regulationScore(fd);
  if (!reg) return false;
  const ninety = ninetyMinuteScore(fd);

  const winnerCode = fdWinnerCode(fd, m.homeTeam.code, m.awayTeam.code);
  const winnerTeamId =
    winnerCode === m.homeTeam.code ? m.homeTeamId
    : winnerCode === m.awayTeam.code ? m.awayTeamId
    : null;

  // `reg` is in the feed's home/away orientation. A fixture we created from ESPN may carry
  // the opposite orientation, so map the score to our row by matching the feed's home team
  // by code — never by position — so scores can't get flipped. (No-op for feed-created and
  // seeded rows, where our home always equals the feed's home.)
  const fdHomeCode = fdTlaToCode(fd.homeTeam?.tla);
  const ourHomeIsFeedHome = fdHomeCode == null || fdHomeCode === m.homeTeam.code;

  await db.match.update({
    where: { id: m.id },
    data: {
      actualHomeScore: ourHomeIsFeedHome ? reg.home : reg.away,
      actualAwayScore: ourHomeIsFeedHome ? reg.away : reg.home,
      actualHomeScore90: ninety ? (ourHomeIsFeedHome ? ninety.home : ninety.away) : null,
      actualAwayScore90: ninety ? (ourHomeIsFeedHome ? ninety.away : ninety.home) : null,
      penaltyHomeScore: fd.score.penalties ? (ourHomeIsFeedHome ? fd.score.penalties.home : fd.score.penalties.away) : null,
      penaltyAwayScore: fd.score.penalties ? (ourHomeIsFeedHome ? fd.score.penalties.away : fd.score.penalties.home) : null,
      winnerTeamId,
      status: "COMPLETED",
    },
  });
  return true;
}

/**
 * Open each timeline bet the moment the feed has fully published the round it concerns
 * (e.g. bracket/golden-ball/golden-glove once all 32 R32 fixtures have teams). Freezes
 * odds at open time, same as the manual openBetType path. Lock times are set by
 * syncPhaseBetLocks to the real first kickoff of the locking phase. PRE_TOURNAMENT bets
 * are left alone — their opensAt (relative to the known tournament start) is already correct.
 */
async function openTimelineBets(
  tournamentId: string,
  betTypes: Array<{ id: string; category: string; subType: string; status: string; openTrigger: string | null }>,
  phaseTeamCodes: Record<string, Set<string>>
) {
  for (const bt of betTypes) {
    if (bt.status !== "DRAFT" || !bt.openTrigger) continue;
    const phase = TRIGGER_OPENS_WHEN_PUBLISHED[bt.openTrigger];
    if (!phase) continue; // PRE_TOURNAMENT — handled by its own (correct) date
    const known = phaseTeamCodes[phase]?.size ?? 0;
    if (known < (PHASE_TEAM_COUNT[phase] ?? Number.POSITIVE_INFINITY)) continue; // round not fully published

    const frozenOdds = await snapshotOddsForBetType(tournamentId, bt.category, bt.subType).catch(() => null);
    await db.betType.update({
      where: { id: bt.id },
      data: { status: "OPEN", opensAt: new Date(), ...(frozenOdds != null && { frozenOdds }) },
    });
  }
}

async function resolveGroupPredictions(
  groupId: string,
  tournamentId: string,
  betTypes: Array<{ id: string; subType: string; status: string }>,
  advancing: Set<string>,
  standings: FDStandingGroup[]
) {
  const bt = betTypes.find((b) => b.subType === "group_predictions");
  if (!bt || bt.status === "RESOLVED") return;

  const winners: Record<string, string> = {};
  for (const g of standings) {
    if (!g.group) continue;
    // The feed has returned both "GROUP_A" and "Group A" formats — strip either
    // prefix so the key always lands on the bare letter that scoring expects.
    const letter = g.group.replace(/^GROUP[_\s]?/i, "");
    const code = fdTlaToCode(g.table[0]?.team?.tla);
    if (code) winners[letter] = code;
  }
  if (Object.keys(winners).length === 0) return; // standings not ready

  await db.betType.update({
    where: { id: bt.id },
    data: {
      status: "RESOLVED",
      resolution: asJson({ winners, advancing: [...advancing] }),
      resolvedAt: new Date(),
    },
  });
  await scoreBets(groupId, tournamentId, null, bt.id);
}

async function resolveReverseDarkHorse(
  groupId: string,
  tournamentId: string,
  betTypes: Array<{ id: string; subType: string; status: string }>,
  advancing: Set<string>
) {
  const bt = betTypes.find((b) => b.subType === "reverse_dark_horse");
  if (!bt || bt.status === "RESOLVED") return;

  // Favourites (lowest winner odds) that failed to advance — matches the display filter.
  const favourites = [...WC2026_TEAMS]
    .sort((a, b) => a.odds.winnerOdds - b.odds.winnerOdds)
    .slice(0, 15)
    .map((t) => t.code);
  const eliminated = favourites.filter((code) => !advancing.has(code));

  await db.betType.update({
    where: { id: bt.id },
    data: { status: "RESOLVED", resolution: asJson({ teams: eliminated }), resolvedAt: new Date() },
  });
  await scoreBets(groupId, tournamentId, null, bt.id);
}

async function resolveDarkHorse(
  groupId: string,
  tournamentId: string,
  betTypes: Array<{ id: string; subType: string; status: string }>,
  qfTeams: Set<string>
) {
  const bt = betTypes.find((b) => b.subType === "dark_horse");
  if (!bt || bt.status === "RESOLVED") return;

  // Long-shots (highest winner odds) that reached the quarter-finals — matches display filter.
  const candidates = new Set(
    [...WC2026_TEAMS].sort((a, b) => b.odds.winnerOdds - a.odds.winnerOdds).slice(0, 35).map((t) => t.code)
  );
  const qualifiers = [...qfTeams].filter((code) => candidates.has(code));

  await db.betType.update({
    where: { id: bt.id },
    data: { status: "RESOLVED", resolution: asJson({ teams: qualifiers }), resolvedAt: new Date() },
  });
  await scoreBets(groupId, tournamentId, null, bt.id);
}

async function resolveSemifinalists(
  groupId: string,
  tournamentId: string,
  betTypes: Array<{ id: string; subType: string; status: string }>,
  teamCodes: string[]
) {
  const bt = betTypes.find((b) => b.subType === "semifinalists");
  if (!bt || bt.status === "RESOLVED") return;

  await db.betType.update({
    where: { id: bt.id },
    data: { status: "RESOLVED", resolution: asJson({ teams: teamCodes }), resolvedAt: new Date() },
  });
  await scoreBets(groupId, tournamentId, null, bt.id);
}

async function resolveWinnerRunnerUp(
  groupId: string,
  tournamentId: string,
  betTypes: Array<{ id: string; subType: string; status: string }>,
  final: MatchWithTeams
) {
  const winnerId = knockoutWinnerTeamId({ ...final, actualHomeScore: null, actualAwayScore: null });
  if (!winnerId) return;
  const winnerCode = winnerId === final.homeTeamId ? final.homeTeam.code : final.awayTeam.code;
  const loserCode = winnerId === final.homeTeamId ? final.awayTeam.code : final.homeTeam.code;

  const winnerBt = betTypes.find((b) => b.subType === "winner");
  if (winnerBt && winnerBt.status !== "RESOLVED") {
    await db.betType.update({
      where: { id: winnerBt.id },
      data: { status: "RESOLVED", resolution: asJson({ teamCode: winnerCode }), resolvedAt: new Date() },
    });
    await scoreBets(groupId, tournamentId, null, winnerBt.id);
  }

  const runnerBt = betTypes.find((b) => b.subType === "runner_up");
  if (runnerBt && runnerBt.status !== "RESOLVED") {
    await db.betType.update({
      where: { id: runnerBt.id },
      data: { status: "RESOLVED", resolution: asJson({ teamCode: loserCode }), resolvedAt: new Date() },
    });
    await scoreBets(groupId, tournamentId, null, runnerBt.id);
  }
}

async function resolveBracket(
  groupId: string,
  tournamentId: string,
  betTypes: Array<{ id: string; subType: string; status: string }>,
  matches: Array<MatchWithTeams & { phase: string; kickoffAt: Date; bracketSlot: number | null }>,
  teams: Array<{ id: string; code: string }>
) {
  const bt = betTypes.find((b) => b.subType === "bracket");
  if (!bt || bt.status === "RESOLVED") return;

  const PHASES = ["R32", "R16", "QF", "SF", "FINAL"] as const;
  const winners: Record<string, string> = {};
  for (const phase of PHASES) {
    const phaseMatches = matches
      .filter((m) => m.phase === phase && m.status === "COMPLETED")
      .sort(compareByBracketSlot);
    phaseMatches.forEach((m, i) => {
      const slot = m.bracketSlot ?? i;
      const winnerId = knockoutWinnerTeamId({ ...m, actualHomeScore: null, actualAwayScore: null });
      const code = teams.find((t) => t.id === winnerId)?.code;
      if (code) winners[`${phase}-${slot}`] = code;
    });
  }
  if (Object.keys(winners).length === 0) return;

  await db.betType.update({
    where: { id: bt.id },
    data: { status: "RESOLVED", resolution: asJson({ winners }), resolvedAt: new Date() },
  });
  await scoreBets(groupId, tournamentId, null, bt.id);
}

async function resolveGoldenBoot(
  groupId: string,
  tournamentId: string,
  betTypes: Array<{ id: string; subType: string; status: string }>,
  scorers: FDScorer[]
) {
  const bt = betTypes.find((b) => b.subType === "golden_boot");
  if (!bt || bt.status === "RESOLVED" || scorers.length === 0) return;

  // FIFA tiebreak: goals, then assists. The free feed lacks minutes-played, so if the
  // top two are tied on both goals AND assists, leave it for the manual override.
  const ranked = [...scorers].sort(
    (a, b) => (b.goals ?? 0) - (a.goals ?? 0) || (b.assists ?? 0) - (a.assists ?? 0)
  );
  const top = ranked[0];
  const runnerUp = ranked[1];
  if (!top?.player?.name) return;
  if (
    runnerUp &&
    (runnerUp.goals ?? 0) === (top.goals ?? 0) &&
    (runnerUp.assists ?? 0) === (top.assists ?? 0)
  ) {
    return; // ambiguous — needs a human
  }

  await db.betType.update({
    where: { id: bt.id },
    data: {
      status: "RESOLVED",
      resolution: asJson({ playerName: top.player.name, teamCode: fdTlaToCode(top.team?.tla) }),
      resolvedAt: new Date(),
    },
  });
  await scoreBets(groupId, tournamentId, null, bt.id);
}
