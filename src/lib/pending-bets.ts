import { db } from "@/lib/db";
import { resolveGroupSettings } from "@/lib/settings";
import { getEffectiveDate } from "@/lib/simulation";

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

export async function getPendingBetCounts(
  groupId: string,
  userId: string
): Promise<{ matches: number; tournament: number }> {
  const group = await db.group.findUnique({ where: { id: groupId } });
  const settings = resolveGroupSettings(group?.settings);
  const now = getEffectiveDate(settings);

  const tournament = await db.tournament.findFirst({
    where: { groupId },
    include: {
      betTypes: {
        where: {
          OR: [
            { status: { not: "DRAFT" } },
            { status: "DRAFT", opensAt: { lte: now } },
          ],
        },
        select: { id: true, category: true, subType: true, status: true, opensAt: true, locksAt: true },
      },
      matches: {
        where: { status: "UPCOMING" },
        select: { id: true, kickoffAt: true },
      },
    },
  });

  if (!tournament) return { matches: 0, tournament: 0 };

  const userBets = await db.bet.findMany({
    where: { userId, tournamentId: tournament.id },
    select: { betTypeId: true, matchId: true },
  });

  const betByTypeId = new Set<string>();
  const betByTypeAndMatch = new Set<string>();
  for (const bet of userBets) {
    if (bet.matchId) betByTypeAndMatch.add(`${bet.betTypeId}:${bet.matchId}`);
    else betByTypeId.add(bet.betTypeId);
  }

  function effectiveStatus(bt: { status: string; opensAt: Date | null; locksAt: Date | null }) {
    if (bt.status === "DRAFT" && bt.opensAt && now >= bt.opensAt) {
      return bt.locksAt && now >= bt.locksAt ? "LOCKED" : "OPEN";
    }
    return bt.status;
  }

  // Tournament tab: open tournament + curated bet types without a bet
  let tournamentPending = 0;
  for (const bt of tournament.betTypes) {
    if (bt.category === "PER_GAME") continue;
    if (effectiveStatus(bt) !== "OPEN") continue;
    if (!betByTypeId.has(bt.id)) tournamentPending++;
  }

  // Matches tab: open per-game matches within betting window without a bet
  const mwBetType = tournament.betTypes.find(
    (bt) => bt.category === "PER_GAME" && bt.subType === "match_winner"
  );
  const perGameOpen = mwBetType ? effectiveStatus(mwBetType) === "OPEN" : false;

  let matchesPending = 0;
  if (perGameOpen && mwBetType) {
    for (const match of tournament.matches) {
      const kickoff = new Date(match.kickoffAt).getTime();
      const inWindow = now.getTime() >= kickoff - FORTY_EIGHT_HOURS;
      const notStarted = now.getTime() < kickoff;
      if (inWindow && notStarted && !betByTypeAndMatch.has(`${mwBetType.id}:${match.id}`)) {
        matchesPending++;
      }
    }
  }

  return { matches: matchesPending, tournament: tournamentPending };
}
