/**
 * One-time migration: persist canonical bracket slots and fix existing bracket predictions.
 *
 * Why: bracket pairing used to be reconstructed by sorting knockout matches on kickoffAt, but
 * the real FIFA kickoff order is chronological, not bracket-ordered — so feed-created fixtures
 * landed in the wrong slots and brackets showed impossible matchups. We now persist
 * Match.bracketSlot (source of truth) from the official 2026 bracket.
 *
 * What this does, per tournament:
 *   1. Stamp bracketSlot on every knockout fixture (stampBracketSlots; safe/idempotent).
 *   2. For the real 2026 bracket only: migrate each user's `bracket` prediction —
 *        - keep R32 winner picks, RE-KEYED to the correct slot by the picked team's fixture,
 *        - DROP all R16/QF/SF/FINAL picks (they were made against scrambled, impossible pairings).
 *   3. Re-score bracket bets from the migrated picks and rebuild the leaderboard.
 *
 * Simulation/other tournaments (whose R32 fixtures don't match the realized 2026 bracket) keep
 * their picks untouched — their synthetic kickoff order already equalled bracket order.
 *
 * Run: npx tsx scripts/migrate-bracket-slots.ts          (apply)
 *      npx tsx scripts/migrate-bracket-slots.ts --dry     (report only, no writes)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DRY = process.argv.includes("--dry");

type Picks = Record<string, string>;

async function main() {
  const { R32_BRACKET_ORDER, r32BracketSlot } = await import("../src/lib/data/wc2026");
  const { stampBracketSlots } = await import("../src/lib/tournament-engine");
  const { scoreProgressiveTournamentBets, recalculateLeaderboard } = await import(
    "../src/lib/actions/results"
  );

  // teamCode -> R32 bracket slot, from the realized 2026 bracket.
  const teamToSlot = new Map<string, number>();
  R32_BRACKET_ORDER.forEach(([a, b], i) => {
    teamToSlot.set(a, i);
    teamToSlot.set(b, i);
  });

  const tournaments = await db.tournament.findMany({ select: { id: true, groupId: true, name: true } });
  console.log(`${DRY ? "[DRY RUN] " : ""}Scanning ${tournaments.length} tournament(s)…\n`);

  let totalBetsRekeyed = 0;
  let totalPicksDropped = 0;

  for (const t of tournaments) {
    // 1. Stamp bracketSlot (skipped in dry mode; pick re-keying below doesn't depend on it).
    if (!DRY) await stampBracketSlots(t.id);

    // Decide whether this is the real 2026 bracket: do its R32 fixtures resolve against the table?
    const r32 = await db.match.findMany({
      where: { tournamentId: t.id, phase: "R32" },
      include: { homeTeam: true, awayTeam: true },
    });
    const resolvable = r32.filter((m) => r32BracketSlot(m.homeTeam.code, m.awayTeam.code) != null).length;
    const isRealBracket = r32.length > 0 && resolvable >= r32.length / 2;

    if (!isRealBracket) {
      console.log(`- ${t.name} (${t.id}): not the realized bracket (${resolvable}/${r32.length} R32 resolvable) — picks left untouched.`);
      continue;
    }

    const bracketBt = await db.betType.findFirst({ where: { tournamentId: t.id, subType: "bracket" } });
    if (!bracketBt) {
      console.log(`- ${t.name}: real bracket, no bracket bet type — bracketSlot stamped only.`);
      continue;
    }

    const bets = await db.bet.findMany({ where: { betTypeId: bracketBt.id } });
    let betsRekeyed = 0;
    let picksDropped = 0;

    for (const bet of bets) {
      const pred = (bet.prediction as { picks?: Picks } | null) ?? {};
      const oldPicks = pred.picks ?? {};
      const newPicks: Picks = {};
      let dropped = 0;

      for (const [key, team] of Object.entries(oldPicks)) {
        if (!key.startsWith("R32-")) {
          dropped++; // R16/QF/SF/FINAL — drop
          continue;
        }
        const slot = teamToSlot.get(team);
        if (slot == null) {
          dropped++; // unknown team (shouldn't happen for the real bracket)
          continue;
        }
        newPicks[`R32-${slot}`] = team; // re-key R32 pick by the team's true fixture
      }

      const changed =
        dropped > 0 ||
        JSON.stringify(oldPicks) !== JSON.stringify(newPicks);
      if (!changed) continue;

      betsRekeyed++;
      picksDropped += dropped;
      if (!DRY) {
        await db.bet.update({
          where: { id: bet.id },
          data: { prediction: { ...pred, picks: newPicks } },
        });
      }
    }

    console.log(
      `- ${t.name}: ${betsRekeyed}/${bets.length} bracket bets migrated, ${picksDropped} downstream picks dropped.`
    );
    totalBetsRekeyed += betsRekeyed;
    totalPicksDropped += picksDropped;

    if (!DRY && betsRekeyed > 0) {
      await scoreProgressiveTournamentBets(t.groupId, t.id);
      await recalculateLeaderboard(t.groupId, t.id);
    }
  }

  console.log(
    `\n${DRY ? "[DRY RUN] " : ""}Done. ${totalBetsRekeyed} bracket bets re-keyed, ${totalPicksDropped} downstream picks dropped.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
