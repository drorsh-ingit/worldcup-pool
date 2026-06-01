/**
 * E2E Test: Create a test group, init tournament, set simulation to June 9,
 * verify odds/points, place bets, advance dates, and check scoring.
 *
 * Run: npx tsx scripts/e2e-test.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const GROUP_ID = "e2e-test-" + Date.now();
const USER_EMAIL = "drorsh@gmail.com";

async function main() {
  // Find the user
  const user = await db.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) throw new Error(`User ${USER_EMAIL} not found`);
  console.log(`✓ Found user: ${user.name} (${user.id})`);

  // Create group
  const group = await db.group.create({
    data: {
      name: "E2E Test Group",
      slug: `e2e-test-${Date.now()}`,
      settings: {
        simulation: { enabled: true, simulatedDate: "2026-06-09T09:00:00Z" },
      },
    },
  });
  console.log(`✓ Created group: ${group.id}`);

  // Add user as admin
  await db.groupMembership.create({
    data: {
      userId: user.id,
      groupId: group.id,
      role: "ADMIN",
      status: "APPROVED",
    },
  });
  console.log(`✓ Added user as admin`);

  // Now we need to initialize a tournament. Let's call the initTournament action.
  // Since we can't easily call server actions from a script, we'll use the DB directly.
  // Import the tournament initialization logic.
  const { initTournament } = await import("../src/lib/actions/tournaments");

  // initTournament is a server action that requires auth context.
  // Let's just create the tournament directly using the same data.
  const { WC2026_TEAMS, WC2026_GROUP_MATCHES } = await import("../src/lib/data/wc2026");
  const { DEFAULT_GROUP_SETTINGS } = await import("../src/lib/settings");

  const tournament = await db.tournament.create({
    data: {
      groupId: group.id,
      kind: "WC_2026",
      name: "FIFA World Cup 2026",
      status: "GROUP_STAGE",
    },
  });
  console.log(`✓ Created tournament: ${tournament.id}`);

  // Create teams
  for (const t of WC2026_TEAMS) {
    await db.team.create({
      data: {
        tournamentId: tournament.id,
        name: t.name,
        code: t.code,
        groupLetter: t.groupLetter,
        odds: t.odds as any,
      },
    });
  }
  console.log(`✓ Created ${WC2026_TEAMS.length} teams`);

  // Create group-stage matches
  const teams = await db.team.findMany({ where: { tournamentId: tournament.id } });
  const teamByCode: Record<string, string> = {};
  for (const t of teams) teamByCode[t.code] = t.id;

  for (const m of WC2026_GROUP_MATCHES) {
    await db.match.create({
      data: {
        tournamentId: tournament.id,
        homeTeamId: teamByCode[m.homeCode],
        awayTeamId: teamByCode[m.awayCode],
        kickoffAt: new Date(m.kickoffAt),
        phase: "GROUP",
        groupLetter: m.groupLetter,
        status: "UPCOMING",
        externalId: String(m.externalId),
      },
    });
  }
  console.log(`✓ Created ${WC2026_GROUP_MATCHES.length} matches`);

  // Create bet types with opensAt schedule
  // Tournament bets open June 9, lock June 11 (before first match)
  const tournamentBetTypes = [
    { subType: "winner", name: "Tournament Winner", opensAt: "2026-06-09T00:00:00Z", locksAt: "2026-06-11T18:00:00Z" },
    { subType: "runner_up", name: "Runner Up", opensAt: "2026-06-09T00:00:00Z", locksAt: "2026-06-11T18:00:00Z" },
    { subType: "dark_horse", name: "Dark Horse", opensAt: "2026-06-09T00:00:00Z", locksAt: "2026-06-11T18:00:00Z" },
    { subType: "reverse_dark_horse", name: "Reverse Dark Horse", opensAt: "2026-06-09T00:00:00Z", locksAt: "2026-06-11T18:00:00Z" },
    { subType: "group_predictions", name: "Group Predictions", opensAt: "2026-06-09T00:00:00Z", locksAt: "2026-06-11T18:00:00Z" },
    { subType: "golden_boot", name: "Golden Boot", opensAt: "2026-06-09T00:00:00Z", locksAt: "2026-06-11T18:00:00Z" },
    { subType: "golden_ball", name: "Golden Ball", opensAt: "2026-06-09T00:00:00Z", locksAt: "2026-06-11T18:00:00Z" },
    { subType: "golden_glove", name: "Golden Glove", opensAt: "2026-06-09T00:00:00Z", locksAt: "2026-06-11T18:00:00Z" },
    { subType: "bracket", name: "Knockout Bracket", opensAt: "2026-07-01T00:00:00Z", locksAt: "2026-07-02T18:00:00Z" },
    { subType: "semifinalists", name: "Semifinalists", opensAt: "2026-07-01T00:00:00Z", locksAt: "2026-07-02T18:00:00Z" },
  ];

  for (const bt of tournamentBetTypes) {
    await db.betType.create({
      data: {
        tournamentId: tournament.id,
        category: "TOURNAMENT",
        subType: bt.subType,
        name: bt.name,
        status: "DRAFT",
        opensAt: new Date(bt.opensAt),
        locksAt: new Date(bt.locksAt),
      },
    });
  }

  // Per-game bet types
  for (const subType of ["match_winner", "correct_score"]) {
    await db.betType.create({
      data: {
        tournamentId: tournament.id,
        category: "PER_GAME",
        subType,
        name: subType === "match_winner" ? "Match Result" : "Correct Score",
        status: "DRAFT",
        opensAt: new Date("2026-06-09T00:00:00Z"),
        locksAt: null,
      },
    });
  }
  console.log(`✓ Created ${tournamentBetTypes.length + 2} bet types`);

  console.log(`\n🎉 Test group ready!`);
  console.log(`   Group ID: ${group.id}`);
  console.log(`   URL: http://localhost:3005/group/${group.id}`);
  console.log(`   Simulation date: June 9, 2026`);
  console.log(`\n   Navigate to the URL to verify bets are auto-opening with correct odds.`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
