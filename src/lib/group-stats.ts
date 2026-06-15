import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveGroupSettings } from "@/lib/settings";
import { getEffectiveDate } from "@/lib/simulation";

export type CellResult = "exact" | "winner" | "wrong" | "pending" | "none";

export interface StatsCell {
  homeScore: number | null;
  awayScore: number | null;
  result: CellResult;
  /** Points earned for this match (completed only); null while in-play. */
  points: number | null;
}

export interface StatsMatchRow {
  id: string;
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  kickoffAt: Date;
  phase: string;
  groupLetter: string | null;
  completed: boolean;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  /** keyed by userId */
  cells: Record<string, StatsCell>;
}

export interface UserSummary {
  userId: string;
  name: string;
  isSelf: boolean;
  exact: number;
  winner: number;
  wrong: number;
  /** completed matches with no prediction */
  missed: number;
  /** total points earned across completed matches */
  points: number;
}

export interface GroupStatsData {
  tournamentKind: string;
  members: { userId: string; name: string; isSelf: boolean }[];
  matches: StatsMatchRow[];
  summaryByUser: Record<string, UserSummary>;
  selfId: string;
}

function outcome(h: number, a: number): "home" | "draw" | "away" {
  return h > a ? "home" : a > h ? "away" : "draw";
}

/**
 * Builds the members × locked-matches prediction matrix plus a per-user accuracy
 * summary. Only locked matches (kickoff passed / LOCKED / COMPLETED) are included,
 * so no unrevealed prediction is ever exposed.
 */
export async function getGroupStats(
  groupId: string
): Promise<{ data?: GroupStatsData; error?: "forbidden" | "notfound" }> {
  const session = await auth();
  if (!session) return { error: "forbidden" };

  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.status !== "APPROVED") return { error: "forbidden" };

  const tournament = await db.tournament.findFirst({
    where: { groupId },
    select: { id: true, kind: true },
  });
  if (!tournament) return { error: "notfound" };

  const group = await db.group.findUnique({ where: { id: groupId } });
  const effectiveNow = getEffectiveDate(resolveGroupSettings(group?.settings));
  const selfId = session.user.id;

  const memberRows = await db.groupMembership.findMany({
    where: { groupId, status: "APPROVED" },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const members = memberRows.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    isSelf: m.userId === selfId,
  }));

  // Stats cover matches that have started — in-play and completed. Not-yet-started
  // matches are excluded (no predictions to reveal, nothing to score yet).
  const startedMatches = await db.match.findMany({
    where: {
      tournamentId: tournament.id,
      OR: [{ status: "COMPLETED" }, { kickoffAt: { lte: effectiveNow } }],
    },
    include: {
      homeTeam: { select: { code: true, name: true } },
      awayTeam: { select: { code: true, name: true } },
    },
    orderBy: { kickoffAt: "desc" },
  });
  const matchIds = startedMatches.map((m) => m.id);

  // Per-game bets across the group: correct_score holds the prediction; points are
  // the sum of correct_score + match_winner totalPoints (populated once scored).
  const bets = matchIds.length
    ? await db.bet.findMany({
        where: { matchId: { in: matchIds }, betType: { subType: { in: ["correct_score", "match_winner"] } } },
        include: { betType: { select: { subType: true } } },
      })
    : [];
  // matchId -> userId -> { h, a }
  const predByMatch = new Map<string, Map<string, { h: number; a: number }>>();
  // matchId -> userId -> points earned
  const pointsByMatch = new Map<string, Map<string, number>>();
  for (const b of bets) {
    if (!b.matchId) continue;
    if (b.betType.subType === "correct_score") {
      const pred = b.prediction as { homeScore?: number; awayScore?: number } | null;
      if (pred?.homeScore != null && pred?.awayScore != null) {
        if (!predByMatch.has(b.matchId)) predByMatch.set(b.matchId, new Map());
        predByMatch.get(b.matchId)!.set(b.userId, { h: pred.homeScore, a: pred.awayScore });
      }
    }
    if (b.totalPoints != null) {
      if (!pointsByMatch.has(b.matchId)) pointsByMatch.set(b.matchId, new Map());
      const mm = pointsByMatch.get(b.matchId)!;
      mm.set(b.userId, (mm.get(b.userId) ?? 0) + b.totalPoints);
    }
  }

  const summaryByUser: Record<string, UserSummary> = {};
  for (const m of members) {
    summaryByUser[m.userId] = {
      userId: m.userId,
      name: m.name,
      isSelf: m.isSelf,
      exact: 0,
      winner: 0,
      wrong: 0,
      missed: 0,
      points: 0,
    };
  }

  const matches: StatsMatchRow[] = startedMatches.map((m) => {
    const completed = m.status === "COMPLETED" && m.actualHomeScore != null && m.actualAwayScore != null;
    const userPreds = predByMatch.get(m.id);
    const userPoints = pointsByMatch.get(m.id);
    const cells: Record<string, StatsCell> = {};

    for (const member of members) {
      const pred = userPreds?.get(member.userId);
      // Points only count once the match is scored (completed); null while in-play.
      const pts = completed ? userPoints?.get(member.userId) ?? 0 : null;
      if (pts != null) summaryByUser[member.userId].points += pts;

      if (!pred) {
        // No prediction: a no-show on a finished match counts as wrong; on an
        // in-play match it's just blank (nothing to score yet).
        if (completed) {
          cells[member.userId] = { homeScore: null, awayScore: null, result: "wrong", points: pts };
          summaryByUser[member.userId].wrong += 1;
          summaryByUser[member.userId].missed += 1;
        } else {
          cells[member.userId] = { homeScore: null, awayScore: null, result: "none", points: null };
        }
        continue;
      }

      let result: CellResult;
      if (!completed) {
        // In-play: show the prediction, but it can't be scored until full time.
        result = "pending";
      } else if (pred.h === m.actualHomeScore && pred.a === m.actualAwayScore) {
        result = "exact";
        summaryByUser[member.userId].exact += 1;
      } else if (outcome(pred.h, pred.a) === outcome(m.actualHomeScore!, m.actualAwayScore!)) {
        result = "winner";
        summaryByUser[member.userId].winner += 1;
      } else {
        result = "wrong";
        summaryByUser[member.userId].wrong += 1;
      }

      cells[member.userId] = { homeScore: pred.h, awayScore: pred.a, result, points: pts };
    }

    return {
      id: m.id,
      homeTeamCode: m.homeTeam.code,
      awayTeamCode: m.awayTeam.code,
      homeTeamName: m.homeTeam.name,
      awayTeamName: m.awayTeam.name,
      kickoffAt: m.kickoffAt,
      phase: m.phase,
      groupLetter: m.groupLetter,
      completed,
      actualHomeScore: m.actualHomeScore,
      actualAwayScore: m.actualAwayScore,
      cells,
    };
  });

  // Tidy float drift from summing stored point values.
  for (const uid of Object.keys(summaryByUser)) {
    summaryByUser[uid].points = parseFloat(summaryByUser[uid].points.toFixed(1));
  }

  return {
    data: { tournamentKind: tournament.kind, members, matches, summaryByUser, selfId },
  };
}
