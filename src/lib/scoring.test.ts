import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePoints, bracketPickPotential } from "./scoring";
import { DEFAULT_GROUP_SETTINGS, type GroupSettings } from "./settings";

// Economy regression tests for the Jun 2026 re-tune:
//  P1 exact score pays ~2-2.5x a direction pick, P2 herding divisor, P3 bracket bonus alive.
// Odds scales: per-game odds are decimal (1.4 = heavy favorite); team odds are
// American-style (550 = +550). calculatePoints takes impliedProbability = 1/odds either way.

const S = DEFAULT_GROUP_SETTINGS as GroupSettings;
const pts = (sub: string, odds: number, samePick = 1) =>
  calculatePoints(true, sub, 1 / odds, S, "GROUP", 1000, 5, samePick).totalPoints;

test("match direction: favorite vs upset spread is meaningful", () => {
  assert.equal(pts("match_winner", 1.4), 1.9); // MEX over RSA
  assert.equal(pts("match_winner", 9.0), 3.9); // RSA upset
});

test("exact score pays ~2-2.5x a direction pick (P1)", () => {
  assert.equal(pts("correct_score", 17.19), 4.3); // typical 2-1
  const ratio = pts("correct_score", 17.19) / pts("match_winner", 1.4);
  assert.ok(ratio >= 2 && ratio <= 2.6, `ratio ${ratio} outside 2-2.6`);
});

test("herding divisor splits only the bonus between same picks (P2)", () => {
  const lone = calculatePoints(true, "match_winner", 1 / 1.4, S, "GROUP", 1000, 5, 1);
  const shared = calculatePoints(true, "match_winner", 1 / 1.4, S, "GROUP", 1000, 5, 3);
  assert.equal(shared.basePoints, lone.basePoints); // base never splits
  assert.ok(Math.abs(shared.bonusPoints - lone.bonusPoints / 3) < 0.1);
  assert.equal(shared.totalPoints, 1.0);
});

test("group size no longer changes per-game points", () => {
  const small = calculatePoints(true, "match_winner", 1 / 2.5, S, "GROUP", 1000, 2);
  const large = calculatePoints(true, "match_winner", 1 / 2.5, S, "GROUP", 1000, 20);
  assert.equal(small.totalPoints, large.totalPoints);
});

test("bracket bonus is alive: underdog pick pays >2x favorite (P3)", () => {
  const fav = bracketPickPotential("R32", 550, S, 1000, 5); // Spain-level
  const dog = bracketPickPotential("R32", 20000, S, 1000, 5); // deep longshot
  assert.ok(fav >= 0.7 && fav <= 0.9, `fav ${fav}`);
  assert.ok(dog >= 2.0, `dog ${dog}`);
  assert.ok(dog / fav > 2, `spread ${dog / fav}`);
});

test("tournament-tier values unchanged by the re-tune", () => {
  assert.equal(pts("winner", 550), 26.1); // Spain — matches what users saw at bet time
  assert.equal(pts("golden_boot", 600), 16.0); // Mbappé
});
