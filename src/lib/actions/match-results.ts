import { db } from "@/lib/db";
import { deriveMatchResult, type FDMatch, type ScorePair } from "@/lib/football-data";
import { fdTlaToCode } from "@/lib/wc-team-map";

/** Current-state fields needed to detect whether a feed sync actually changes anything. */
export interface MatchForResult {
  id: string;
  status: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeam: { code: string };
  awayTeam: { code: string };
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  actualHomeScore90: number | null;
  actualAwayScore90: number | null;
  penaltyHomeScore: number | null;
  penaltyAwayScore: number | null;
  winnerTeamId: string | null;
}

/**
 * The single writer that reconciles a match row against the feed.
 *
 * Idempotent AND self-healing: it re-derives all four canonical values on every call and
 * updates the row whenever any of them changed — even for an already-COMPLETED match, so a
 * late feed correction (e.g. BEL–SEN's `regularTime` arriving after the first FINISHED
 * flip) repairs itself. A match is marked COMPLETED only when `deriveMatchResult` yields a
 * complete result, so we never freeze a bad 90' score.
 *
 * Orientation-safe: `deriveMatchResult` is in the feed's home/away orientation; a fixture we
 * created from ESPN may be reversed, so scores are mapped to our row by matching the feed's
 * home team BY CODE, never by position.
 *
 * Returns:
 *   - completed:       the row newly reached COMPLETED on this call.
 *   - scoringChanged:  the 90' score or the winner changed (incl. first completion), so the
 *                      caller must (re-)score this match's per-game bets.
 */
export async function applyMatchResult(
  m: MatchForResult,
  fd: FDMatch
): Promise<{ completed: boolean; scoringChanged: boolean }> {
  const derived = deriveMatchResult(fd);
  if (!derived) return { completed: false, scoringChanged: false };

  // Feed → our orientation, by code.
  const fdHomeCode = fdTlaToCode(fd.homeTeam?.tla);
  const ourHomeIsFeedHome = fdHomeCode == null || fdHomeCode === m.homeTeam.code;
  const orient = (p: ScorePair): ScorePair =>
    ourHomeIsFeedHome ? p : { home: p.away, away: p.home };

  const s90 = orient(derived.score90);
  const sFt = orient(derived.scoreFt);
  const pens = derived.pens ? orient(derived.pens) : null;

  // Advancer, mapped by code so a reversed fixture can't flip the winner.
  const winnerFeedCode =
    derived.winner === "HOME_TEAM" ? (fdHomeCode ?? m.homeTeam.code)
    : derived.winner === "AWAY_TEAM" ? (fdTlaToCode(fd.awayTeam?.tla) ?? m.awayTeam.code)
    : null;
  const winnerTeamId =
    winnerFeedCode === m.homeTeam.code ? m.homeTeamId
    : winnerFeedCode === m.awayTeam.code ? m.awayTeamId
    : null;

  const penHome = pens?.home ?? null;
  const penAway = pens?.away ?? null;

  const wasCompleted = m.status === "COMPLETED";
  const scoringChanged =
    !wasCompleted ||
    m.actualHomeScore90 !== s90.home ||
    m.actualAwayScore90 !== s90.away ||
    m.winnerTeamId !== winnerTeamId;
  const anyChanged =
    scoringChanged ||
    m.actualHomeScore !== sFt.home ||
    m.actualAwayScore !== sFt.away ||
    m.penaltyHomeScore !== penHome ||
    m.penaltyAwayScore !== penAway;

  if (!anyChanged) return { completed: false, scoringChanged: false };

  await db.match.update({
    where: { id: m.id },
    data: {
      actualHomeScore: sFt.home,
      actualAwayScore: sFt.away,
      actualHomeScore90: s90.home,
      actualAwayScore90: s90.away,
      penaltyHomeScore: penHome,
      penaltyAwayScore: penAway,
      winnerTeamId,
      status: "COMPLETED",
    },
  });

  return { completed: !wasCompleted, scoringChanged };
}
