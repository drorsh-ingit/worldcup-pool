/**
 * E2E: Simulation isolation + bet promotion correctness
 *
 * Verifies:
 *  1. Simulated groups don't promote bets on real groups
 *  2. Simulated groups don't affect each other
 *  3. Real groups share the same frozen odds when promoted globally
 *  4. Each simulated group is self-contained
 *
 * Run: npx tsx scripts/e2e-simulation-isolation.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const db = new PrismaClient();
const USER_EMAIL = "drorsh@gmail.com";

let passes = 0;
let fails = 0;

function assert(label: string, condition: boolean, detail = "") {
  if (condition) {
    passes++;
    console.log(`  ✅ ${label}`);
  } else {
    fails++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Seed a tournament directly, bypassing auth. Mirrors initTournament. */
async function seedTournament(groupId: string) {
  const { getProfile } = await import("../src/lib/tournaments/registry");
  const profile = getProfile("WC_2026");

  const tournament = await db.tournament.create({
    data: { groupId, kind: "WC_2026", name: profile.displayName, status: "SETUP" },
  });

  await db.team.createMany({
    data: profile.teams.map((t) => ({
      tournamentId: tournament.id,
      name: t.name,
      code: t.code,
      groupLetter: t.groupLetter,
      odds: t.odds as unknown as Prisma.InputJsonValue,
    })),
  });

  const teams = await db.team.findMany({ where: { tournamentId: tournament.id } });
  const teamByCode = Object.fromEntries(teams.map((t) => [t.code, t]));

  await db.match.createMany({
    data: profile.matches
      .filter((m) => teamByCode[m.homeCode] && teamByCode[m.awayCode])
      .map((m) => ({
        tournamentId: tournament.id,
        homeTeamId: teamByCode[m.homeCode].id,
        awayTeamId: teamByCode[m.awayCode].id,
        phase: m.phase,
        matchday: m.matchday,
        groupLetter: m.groupLetter,
        kickoffAt: m.kickoffAt,
        externalId: m.externalId,
        multiplier: m.multiplier,
        status: "UPCOMING" as const,
      })),
  });

  await db.betType.createMany({
    data: profile.betTypes.map((bt) => {
      const resolved = bt.openTrigger ? profile.resolveOpenTrigger(bt.openTrigger) : null;
      return {
        tournamentId: tournament.id,
        category: bt.category,
        subType: bt.subType,
        name: bt.name,
        description: bt.description,
        openTrigger: bt.openTrigger ?? null,
        opensAt: resolved?.opensAt ?? bt.opensAt ?? null,
        locksAt: resolved?.locksAt ?? bt.locksAt ?? null,
        status: "DRAFT" as const,
        config: (bt.config ?? {}) as Prisma.InputJsonValue,
      };
    }),
  });

  return tournament;
}

async function createGroup(name: string, simulatedDate?: string) {
  const user = await db.user.findUnique({ where: { email: USER_EMAIL } });
  const slug = `test-iso-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const settings = simulatedDate
    ? { simulation: { enabled: true, simulatedDate } }
    : {};
  const group = await db.group.create({
    data: { name, slug, settings: settings as unknown as Prisma.InputJsonValue },
  });
  await db.groupMembership.create({
    data: { userId: user!.id, groupId: group.id, role: "ADMIN", status: "APPROVED" },
  });
  const tournament = await seedTournament(group.id);
  console.log(`  ${name} (${group.id.slice(-6)}) simDate=${simulatedDate ?? "none"}`);
  return { group, tournament };
}

async function cleanup(...groups: Array<{ group: { id: string; name: string }; tournament: { id: string } }>) {
  console.log("── Cleanup ──");
  for (const { group, tournament } of groups) {
    await db.bet.deleteMany({ where: { tournamentId: tournament.id } });
    await db.betType.deleteMany({ where: { tournamentId: tournament.id } });
    await db.match.deleteMany({ where: { tournamentId: tournament.id } });
    await db.team.deleteMany({ where: { tournamentId: tournament.id } });
    await db.leaderboardEntry.deleteMany({ where: { groupId: group.id } });
    await db.tournament.delete({ where: { id: tournament.id } });
    await db.groupMembership.deleteMany({ where: { groupId: group.id } });
    await db.group.delete({ where: { id: group.id } });
    console.log(`  Deleted: ${group.name}`);
  }
}

async function main() {
  console.log("═══ Simulation Isolation Test ═══\n");

  const { loadBetsPageData } = await import("../src/lib/bets-page-data");

  // ── Step 1: Create 4 groups ──────────────────────────────────────────────
  console.log("── Step 1: Create 4 groups ──");
  const realA = await createGroup("Iso-RealA");
  const realB = await createGroup("Iso-RealB");
  // SimC at Jul 2 = after group stage (bracket/golden_ball/golden_glove open, not semifinalists)
  const simC = await createGroup("Iso-SimC", "2026-07-02T12:00:00Z");
  // SimD at Jul 6 = after R32 (semifinalists also open)
  const simD = await createGroup("Iso-SimD", "2026-07-06T12:00:00Z");
  console.log();

  try {
    // ── Step 2: Load simulated groups' pages ─────────────────────────────────
    console.log("── Step 2: Simulated groups load bets pages ──");
    await loadBetsPageData(simC.group.id, (await db.user.findUnique({ where: { email: USER_EMAIL } }))!.id);
    await loadBetsPageData(simD.group.id, (await db.user.findUnique({ where: { email: USER_EMAIL } }))!.id);

    const getStatuses = async (tournamentId: string) => {
      const bts = await db.betType.findMany({
        where: { tournamentId },
        select: { subType: true, status: true, frozenOdds: true },
      });
      return Object.fromEntries(bts.map((b) => [b.subType, { status: b.status, hasFrozen: b.frozenOdds != null }]));
    };

    const stC = await getStatuses(simC.tournament.id);
    const stD = await getStatuses(simD.tournament.id);
    console.log("  SimC:", Object.entries(stC).filter(([,v]) => v.status !== "DRAFT").map(([k,v]) => `${k}=${v.status}`).join(", "));
    console.log("  SimD:", Object.entries(stD).filter(([,v]) => v.status !== "DRAFT").map(([k,v]) => `${k}=${v.status}`).join(", "));

    assert("SimC: winner OPEN", stC["winner"]?.status === "OPEN");
    assert("SimC: bracket OPEN", stC["bracket"]?.status === "OPEN");
    assert("SimC: golden_ball OPEN", stC["golden_ball"]?.status === "OPEN");
    assert("SimC: golden_glove OPEN", stC["golden_glove"]?.status === "OPEN");
    assert("SimC: semifinalists still DRAFT (Jul 2 < Jul 5)", stC["semifinalists"]?.status === "DRAFT");
    assert("SimD: semifinalists OPEN (Jul 6 > Jul 5)", stD["semifinalists"]?.status === "OPEN");
    assert("SimD: bracket OPEN", stD["bracket"]?.status === "OPEN");

    assert("SimC: winner has frozenOdds", stC["winner"]?.hasFrozen === true);
    assert("SimD: winner has frozenOdds", stD["winner"]?.hasFrozen === true);
    console.log();

    // ── Step 3: Real groups completely unaffected ─────────────────────────────
    console.log("── Step 3: Real groups unaffected by simulated promotions ──");

    const stRA = await getStatuses(realA.tournament.id);
    const stRB = await getStatuses(realB.tournament.id);

    const openRA = Object.entries(stRA).filter(([,v]) => v.status !== "DRAFT");
    const openRB = Object.entries(stRB).filter(([,v]) => v.status !== "DRAFT");

    assert("RealA: all bets still DRAFT", openRA.length === 0,
      `opened: ${openRA.map(([k]) => k).join(",")}`);
    assert("RealB: all bets still DRAFT", openRB.length === 0,
      `opened: ${openRB.map(([k]) => k).join(",")}`);

    // SimC's bracket/golden_ball not leaked to real groups
    assert("RealA: bracket still DRAFT", stRA["bracket"]?.status === "DRAFT");
    assert("RealA: golden_ball still DRAFT", stRA["golden_ball"]?.status === "DRAFT");
    console.log();

    // ── Step 4: SimC advances — SimD unaffected, real groups unaffected ───────
    console.log("── Step 4: Advance SimC to post-R32 — no cross-contamination ──");

    await db.group.update({
      where: { id: simC.group.id },
      data: {
        settings: {
          simulation: { enabled: true, simulatedDate: "2026-07-06T12:00:00Z" },
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const userId = (await db.user.findUnique({ where: { email: USER_EMAIL } }))!.id;
    await loadBetsPageData(simC.group.id, userId);

    const stC2 = await getStatuses(simC.tournament.id);
    const stD2 = await getStatuses(simD.tournament.id);
    const stRA2 = await getStatuses(realA.tournament.id);

    assert("SimC: semifinalists now OPEN after advancing", stC2["semifinalists"]?.status === "OPEN");
    assert("SimD: status unchanged by SimC advancement", stD2["semifinalists"]?.status === "OPEN");
    assert("RealA: still fully DRAFT after SimC advanced", Object.values(stRA2).every(v => v.status === "DRAFT"));
    assert("RealB: still fully DRAFT after SimC advanced",
      (await db.betType.findMany({ where: { tournamentId: realB.tournament.id }, select: { status: true } }))
        .every(b => b.status === "DRAFT"));
    console.log();

    // ── Step 5: Real groups share identical frozen odds on global promotion ────
    console.log("── Step 5: Real groups get identical frozen odds on promotion ──");

    await loadBetsPageData(realA.group.id, userId);

    const stRA3 = await getStatuses(realA.tournament.id);
    const stRB3 = await getStatuses(realB.tournament.id);

    assert("RealA: winner OPEN after page load", stRA3["winner"]?.status === "OPEN");
    assert("RealB: winner OPEN too (global promotion from RealA load)", stRB3["winner"]?.status === "OPEN");

    // Compare frozenOdds byte-for-byte
    const winnerA = await db.betType.findFirst({ where: { tournamentId: realA.tournament.id, subType: "winner" }, select: { frozenOdds: true } });
    const winnerB = await db.betType.findFirst({ where: { tournamentId: realB.tournament.id, subType: "winner" }, select: { frozenOdds: true } });
    assert("RealA and RealB have identical frozenOdds for winner",
      JSON.stringify(winnerA?.frozenOdds) === JSON.stringify(winnerB?.frozenOdds));

    // Loading RealB a second time should not change its frozenOdds
    await loadBetsPageData(realB.group.id, userId);
    const winnerB2 = await db.betType.findFirst({ where: { tournamentId: realB.tournament.id, subType: "winner" }, select: { frozenOdds: true } });
    assert("RealB: frozenOdds unchanged on 2nd page load",
      JSON.stringify(winnerB2?.frozenOdds) === JSON.stringify(winnerB?.frozenOdds));

    // Simulated groups should NOT have gotten RealA's global odds blast
    const stC3 = await getStatuses(simC.tournament.id);
    const openNotFromSim = Object.entries(stC3)
      .filter(([k, v]) => v.status === "OPEN" && !["winner","runner_up","group_predictions","dark_horse","reverse_dark_horse","golden_boot","bracket","golden_ball","golden_glove","semifinalists","match_winner","correct_score"].includes(k));
    assert("SimC: no unexpected bets opened by RealA's promotion", openNotFromSim.length === 0,
      openNotFromSim.map(([k]) => k).join(","));

    // Real groups should not have SimC's post-group-stage bets opened
    const stRA4 = await getStatuses(realA.tournament.id);
    assert("RealA: bracket still DRAFT (real group stage not done yet)", stRA4["bracket"]?.status === "DRAFT");
    console.log();

  } finally {
    await cleanup(realA, realB, simC, simD);
  }

  console.log(`\n═══ Results: ${passes} passed, ${fails} failed ═══`);
  process.exit(fails > 0 ? 1 : 0);
}

main()
  .catch((err) => { console.error("Fatal:", err); process.exit(2); })
  .finally(() => db.$disconnect());
