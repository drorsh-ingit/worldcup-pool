/**
 * E2E: Group Predictions — per-slot potential vs actual scoring
 *
 * For every group (A–L), picks the favourite as winner and 2nd/3rd favourites
 * as qualifiers. Resolves all picks as correct. Verifies:
 *  1. Each individual slot's scored contribution matches the UI potential
 *  2. The total scored points match the sum of all slot potentials
 *
 * Run: npx tsx scripts/e2e-group-predictions-detailed.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const db = new PrismaClient();
const USER_EMAIL = "drorsh@gmail.com";

let passes = 0;
let fails = 0;

function assertExact(label: string, actual: number, expected: number) {
  if (actual === expected) {
    passes++;
    console.log(`  ✅ ${label}: ${actual}`);
  } else {
    fails++;
    console.log(`  ❌ ${label}: actual=${actual}, expected=${expected} (diff=${(actual - expected).toFixed(6)})`);
  }
}

async function main() {
  console.log("═══ Group Predictions: Per-Slot Potential vs Actual ═══\n");

  const user = await db.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User ${USER_EMAIL} not found`);

  const { WC2026_TEAMS } = await import("../src/lib/data/wc2026");
  const { calculatePoints, scoreBets } = await import("../src/lib/scoring");
  const { resolveGroupSettings } = await import("../src/lib/settings");
  const { snapshotOddsForBetType } = await import("../src/lib/actions/refresh-odds");

  // Setup
  const group = await db.group.create({
    data: { name: "GP Detail Test", slug: `gp-detail-${Date.now()}`, settings: {} as unknown as Prisma.InputJsonValue },
  });
  await db.groupMembership.create({
    data: { userId: user.id, groupId: group.id, role: "ADMIN", status: "APPROVED" },
  });
  const tournament = await db.tournament.create({
    data: { groupId: group.id, kind: "WC_2026", name: "WC 2026", status: "GROUP_STAGE" },
  });
  for (const t of WC2026_TEAMS) {
    await db.team.create({
      data: {
        tournamentId: tournament.id, name: t.name, code: t.code,
        groupLetter: t.groupLetter, odds: t.odds as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const settings = resolveGroupSettings({});
  const totalPool = settings.totalPool ?? 1000;
  const memberCount = 1;
  const impliedProb = (odds: number) => 1 / Math.max(odds, 1);

  // Snapshot frozen odds
  const frozenOdds = await snapshotOddsForBetType(tournament.id, "TOURNAMENT", "winner");
  const frozenTeams = (frozenOdds as { teams?: Record<string, { winnerOdds?: number; groupWinnerOdds?: number; qualifyOdds?: number }> })?.teams ?? {};

  const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const WINNER_GROUPS = 12;
  const QUALIFIER_SLOTS = 20;

  // Build prediction: for each group, pick top 3 by winnerOdds
  const prediction: Record<string, string[]> = {};
  const resolution: { winners: Record<string, string>; advancing: string[] } = { winners: {}, advancing: [] };

  // Track expected per-slot potentials
  let expectedTotalWinners = 0;
  let expectedTotalQualifiers = 0;
  const slotDetails: Array<{ group: string; role: string; code: string; potential: number }> = [];

  for (const letter of GROUPS) {
    const groupTeams = WC2026_TEAMS
      .filter((t) => t.groupLetter === letter)
      .sort((a, b) => a.odds.winnerOdds - b.odds.winnerOdds);

    const winnerCode = groupTeams[0].code;
    const qual1Code = groupTeams[1].code;
    const qual2Code = groupTeams[2].code;

    // prediction format: [winner, qualifier1, qualifier2]
    prediction[letter] = [winnerCode, qual1Code, qual2Code];

    // Resolution: all correct
    resolution.winners[letter] = winnerCode;
    resolution.advancing.push(winnerCode, qual1Code, qual2Code);

    // UI potential for winner slot (rounded to 1dp per slot, matching scorer)
    const winnerGroupOdds = frozenTeams[winnerCode]?.groupWinnerOdds ?? groupTeams[0].odds.groupWinnerOdds;
    const winnerPts = calculatePoints(true, "group_predictions", impliedProb(winnerGroupOdds), settings, "GROUP", totalPool, Math.max(memberCount, 1));
    const winnerSlotPotential = parseFloat((winnerPts.totalPoints * 0.6 / WINNER_GROUPS).toFixed(1));
    expectedTotalWinners += winnerSlotPotential;
    slotDetails.push({ group: letter, role: "winner", code: winnerCode, potential: winnerSlotPotential });

    // UI potential for qualifier slots
    for (const qCode of [qual1Code, qual2Code]) {
      const qualOdds = frozenTeams[qCode]?.qualifyOdds ?? WC2026_TEAMS.find(t => t.code === qCode)!.odds.qualifyOdds;
      const qualPts = calculatePoints(true, "group_predictions", impliedProb(qualOdds), settings, "GROUP", totalPool, Math.max(memberCount, 1));
      const qualSlotPotential = parseFloat((qualPts.totalPoints * 0.4 / QUALIFIER_SLOTS).toFixed(1));
      expectedTotalQualifiers += qualSlotPotential;
      slotDetails.push({ group: letter, role: "qualifier", code: qCode, potential: qualSlotPotential });
    }
  }

  const expectedTotal = parseFloat((expectedTotalWinners + expectedTotalQualifiers).toFixed(1));
  console.log(`  Expected winner sum: ${expectedTotalWinners.toFixed(4)}`);
  console.log(`  Expected qualifier sum: ${expectedTotalQualifiers.toFixed(4)}`);
  console.log(`  Expected total (rounded): ${expectedTotal}`);
  console.log(`  Slots: ${slotDetails.length} (12 winners + 24 qualifiers)\n`);

  // Create bet type + place bet
  const bt = await db.betType.create({
    data: {
      tournamentId: tournament.id, category: "TOURNAMENT", subType: "group_predictions",
      name: "Group Predictions", status: "OPEN", frozenOdds: frozenOdds,
    },
  });

  const bet = await db.bet.create({
    data: {
      betTypeId: bt.id, userId: user.id, tournamentId: tournament.id,
      prediction: prediction as unknown as Prisma.InputJsonValue,
    },
  });

  // Resolve
  await db.betType.update({
    where: { id: bt.id },
    data: {
      status: "RESOLVED",
      resolution: resolution as unknown as Prisma.InputJsonValue,
      resolvedAt: new Date(),
    },
  });

  // Score
  await scoreBets(group.id, tournament.id, null, bt.id);

  const scored = await db.bet.findUnique({ where: { id: bet.id } });
  const scoredTotal = scored?.totalPoints ?? 0;
  const scoredBase = scored?.basePoints ?? 0;
  const scoredBonus = scored?.bonusPoints ?? 0;

  console.log(`  Scored: base=${scoredBase}, bonus=${scoredBonus}, total=${scoredTotal}\n`);

  assertExact("Total points (all 12 groups, 36 slots)", scoredTotal, expectedTotal);

  // Also verify base+bonus individually
  let expectedBase = 0;
  let expectedBonus = 0;
  for (const slot of slotDetails) {
    const odds = slot.role === "winner"
      ? (frozenTeams[slot.code]?.groupWinnerOdds ?? WC2026_TEAMS.find(t => t.code === slot.code)!.odds.groupWinnerOdds)
      : (frozenTeams[slot.code]?.qualifyOdds ?? WC2026_TEAMS.find(t => t.code === slot.code)!.odds.qualifyOdds);
    const pts = calculatePoints(true, "group_predictions", impliedProb(odds), settings, "GROUP", totalPool, Math.max(memberCount, 1));
    const share = slot.role === "winner" ? 0.6 / WINNER_GROUPS : 0.4 / QUALIFIER_SLOTS;
    expectedBase += parseFloat((pts.basePoints * share).toFixed(1));
    expectedBonus += parseFloat((pts.bonusPoints * share).toFixed(1));
  }

  assertExact("Base points", scoredBase, parseFloat(expectedBase.toFixed(1)));
  assertExact("Bonus points", scoredBonus, parseFloat(expectedBonus.toFixed(1)));

  // ── Now test partial correctness: only some picks correct ──
  console.log("\n── Partial correctness test ──");

  // Delete old bet's score, re-create with different resolution
  await db.bet.update({ where: { id: bet.id }, data: { scoredAt: null, isCorrect: null, basePoints: null, bonusPoints: null, totalPoints: null } });

  // New resolution: only groups A–F winners correct, only half the qualifiers correct
  const partialResolution: { winners: Record<string, string>; advancing: string[] } = {
    winners: {},
    advancing: [],
  };

  let partialExpected = 0;
  for (const letter of GROUPS) {
    const picks = prediction[letter];
    if (["A", "B", "C", "D", "E", "F"].includes(letter)) {
      // Winner correct
      partialResolution.winners[letter] = picks[0];
      const winnerGroupOdds = frozenTeams[picks[0]]?.groupWinnerOdds ?? WC2026_TEAMS.find(t => t.code === picks[0])!.odds.groupWinnerOdds;
      const pts = calculatePoints(true, "group_predictions", impliedProb(winnerGroupOdds), settings, "GROUP", totalPool, Math.max(memberCount, 1));
      partialExpected += parseFloat((pts.totalPoints * 0.6 / WINNER_GROUPS).toFixed(1));
    } else {
      // Winner wrong — different team won
      const groupTeams = WC2026_TEAMS.filter(t => t.groupLetter === letter).sort((a, b) => a.odds.winnerOdds - b.odds.winnerOdds);
      partialResolution.winners[letter] = groupTeams[3].code; // worst team won
    }

    // Only first qualifier of each group correct
    partialResolution.advancing.push(picks[1]); // qual1 correct
    const qualOdds = frozenTeams[picks[1]]?.qualifyOdds ?? WC2026_TEAMS.find(t => t.code === picks[1])!.odds.qualifyOdds;
    const pts = calculatePoints(true, "group_predictions", impliedProb(qualOdds), settings, "GROUP", totalPool, Math.max(memberCount, 1));
    partialExpected += parseFloat((pts.totalPoints * 0.4 / QUALIFIER_SLOTS).toFixed(1));
    // qual2 is NOT in advancing (wrong)
  }

  const partialExpectedRounded = parseFloat(partialExpected.toFixed(1));

  await db.betType.update({
    where: { id: bt.id },
    data: { resolution: partialResolution as unknown as Prisma.InputJsonValue },
  });

  await scoreBets(group.id, tournament.id, null, bt.id);
  const partialScored = await db.bet.findUnique({ where: { id: bet.id } });

  console.log(`  6/12 winners correct, 12/24 qualifiers correct`);
  console.log(`  Expected: ${partialExpectedRounded}, Scored: ${partialScored?.totalPoints}`);
  assertExact("Partial group_predictions total", partialScored?.totalPoints ?? 0, partialExpectedRounded);

  // ── Summary ──
  console.log(`\n═══ Results: ${passes} passed, ${fails} failed ═══`);

  // Cleanup
  await db.bet.deleteMany({ where: { tournamentId: tournament.id } });
  await db.betType.deleteMany({ where: { tournamentId: tournament.id } });
  await db.team.deleteMany({ where: { tournamentId: tournament.id } });
  await db.tournament.deleteMany({ where: { id: tournament.id } });
  await db.groupMembership.deleteMany({ where: { groupId: group.id } });
  await db.group.delete({ where: { id: group.id } });
  console.log("  Cleaned up");

  process.exit(fails > 0 ? 1 : 0);
}

main()
  .catch((err) => { console.error("Fatal:", err); process.exit(2); })
  .finally(() => db.$disconnect());
