import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveGroupSettings } from "@/lib/settings";
import { getEffectiveDate } from "@/lib/simulation";
import { isMatchLocked } from "@/lib/bets-page-data";

export type Outcome = "home" | "draw" | "away";

export interface MatchPredictionRow {
  userId: string;
  name: string;
  isSelf: boolean;
  homeScore: number | null;
  awayScore: number | null;
  outcome: Outcome | null;
  /** null until the match is completed and bets are scored */
  directionCorrect: boolean | null;
  scoreCorrect: boolean | null;
  points: number | null;
}

export interface MatchPredictionsData {
  match: {
    id: string;
    groupId: string;
    tournamentKind: string;
    homeTeamCode: string;
    awayTeamCode: string;
    homeTeamName: string;
    awayTeamName: string;
    kickoffAt: Date;
    phase: string;
    groupLetter: string | null;
    status: "UPCOMING" | "LOCKED" | "COMPLETED";
    actualHomeScore: number | null;
    actualAwayScore: number | null;
  };
  /** Whether predictions are revealed yet. When false, `rows`/`missing` are empty. */
  locked: boolean;
  /** Members who placed a prediction, sorted (points desc when scored, else name). */
  rows: MatchPredictionRow[];
  /** Approved members who placed no prediction. */
  missing: { userId: string; name: string; isSelf: boolean }[];
}

function outcomeFromScore(h: number, a: number): Outcome {
  return h > a ? "home" : a > h ? "away" : "draw";
}

/**
 * Loads every group member's prediction for one match — but ONLY once the match is
 * locked. The lock gate is enforced here on the server: when the match isn't locked
 * yet, no opponent prediction is ever loaded or returned to the client.
 */
export async function getMatchPredictions(
  groupId: string,
  matchId: string
): Promise<{ data?: MatchPredictionsData; error?: "forbidden" | "notfound" }> {
  const session = await auth();
  if (!session) return { error: "forbidden" };

  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.status !== "APPROVED") return { error: "forbidden" };

  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      tournament: { select: { groupId: true, kind: true } },
      homeTeam: { select: { code: true, name: true } },
      awayTeam: { select: { code: true, name: true } },
    },
  });
  // Scope check — the match must belong to this group's tournament.
  if (!match || match.tournament.groupId !== groupId) return { error: "notfound" };

  const group = await db.group.findUnique({ where: { id: groupId } });
  const effectiveNow = getEffectiveDate(resolveGroupSettings(group?.settings));
  const locked = isMatchLocked(match, effectiveNow);

  const header: MatchPredictionsData["match"] = {
    id: match.id,
    groupId,
    tournamentKind: match.tournament.kind,
    homeTeamCode: match.homeTeam.code,
    awayTeamCode: match.awayTeam.code,
    homeTeamName: match.homeTeam.name,
    awayTeamName: match.awayTeam.name,
    kickoffAt: match.kickoffAt,
    phase: match.phase,
    groupLetter: match.groupLetter,
    status: match.status as "UPCOMING" | "LOCKED" | "COMPLETED",
    actualHomeScore: match.actualHomeScore,
    actualAwayScore: match.actualAwayScore,
  };

  // Hard gate: don't load anyone else's picks until the match is locked.
  if (!locked) {
    return { data: { match: header, locked: false, rows: [], missing: [] } };
  }

  const members = await db.groupMembership.findMany({
    where: { groupId, status: "APPROVED" },
    include: { user: { select: { id: true, name: true } } },
  });

  // Both per-game bets for this match across all users (correct_score = exact,
  // match_winner = direction). Each is scored independently.
  const bets = await db.bet.findMany({
    where: { matchId, betType: { subType: { in: ["correct_score", "match_winner"] } } },
    include: { betType: { select: { subType: true } } },
  });

  const csByUser = new Map<string, (typeof bets)[number]>();
  const mwByUser = new Map<string, (typeof bets)[number]>();
  for (const b of bets) {
    if (b.betType.subType === "correct_score") csByUser.set(b.userId, b);
    else mwByUser.set(b.userId, b);
  }

  const isCompleted = match.status === "COMPLETED" && match.actualHomeScore != null;
  const selfId = session.user.id;

  const rows: MatchPredictionRow[] = [];
  const missing: MatchPredictionsData["missing"] = [];

  for (const m of members) {
    const cs = csByUser.get(m.userId);
    const pred = cs?.prediction as { homeScore?: number; awayScore?: number } | null;
    const hasPick = pred?.homeScore != null && pred?.awayScore != null;

    if (!hasPick) {
      missing.push({ userId: m.userId, name: m.user.name, isSelf: m.userId === selfId });
      continue;
    }

    const homeScore = pred!.homeScore!;
    const awayScore = pred!.awayScore!;
    const mw = mwByUser.get(m.userId);
    const points = isCompleted
      ? (cs?.totalPoints ?? 0) + (mw?.totalPoints ?? 0)
      : null;

    rows.push({
      userId: m.userId,
      name: m.user.name,
      isSelf: m.userId === selfId,
      homeScore,
      awayScore,
      outcome: outcomeFromScore(homeScore, awayScore),
      directionCorrect: isCompleted ? (mw?.isCorrect ?? false) : null,
      scoreCorrect: isCompleted ? (cs?.isCorrect ?? false) : null,
      points,
    });
  }

  rows.sort((a, b) => {
    if (isCompleted) return (b.points ?? 0) - (a.points ?? 0);
    return a.name.localeCompare(b.name);
  });
  missing.sort((a, b) => a.name.localeCompare(b.name));

  return { data: { match: header, locked: true, rows, missing } };
}
