import { test } from "node:test";
import assert from "node:assert/strict";
import { regulationScore, ninetyMinuteScore, fdWinnerCode, type FDMatch } from "./football-data";
import { fdTlaToCode } from "./wc-team-map";

// Minimal FDMatch builder — only the score-related fields matter for these pure functions.
function fd(score: FDMatch["score"], homeTla = "HOM", awayTla = "AWY"): FDMatch {
  return {
    id: 1,
    utcDate: "2026-06-11T19:00:00Z",
    status: "FINISHED",
    stage: "LAST_16",
    group: null,
    matchday: null,
    minute: null,
    injuryTime: null,
    homeTeam: { id: 1, name: "Home", shortName: "Home", tla: homeTla },
    awayTeam: { id: 2, name: "Away", shortName: "Away", tla: awayTla },
    score,
  };
}

// ── regulationScore: the three real fixtures captured from the live v4 feed ──

test("penalty shootout → score excludes the shootout (LIV–PSG 0–1)", () => {
  // Real: regularTime 0–1, extraTime 0–0, penalties 1–4, fullTime 1–5 (includes pens)
  const m = fd({
    winner: "AWAY_TEAM",
    duration: "PENALTY_SHOOTOUT",
    fullTime: { home: 1, away: 5 },
    halfTime: { home: 0, away: 1 },
    regularTime: { home: 0, away: 1 },
    extraTime: { home: 0, away: 0 },
    penalties: { home: 1, away: 4 },
  });
  assert.deepEqual(regulationScore(m), { home: 0, away: 1 });
  assert.equal(fdWinnerCode(m, "LIV", "PSG"), "PSG");
});

test("penalty shootout with ET → reg+ET excludes pens (ATL–RMA 1–0)", () => {
  // Real: regularTime 1–0, extraTime 0–0, penalties 2–4, fullTime 3–4
  const m = fd({
    winner: "AWAY_TEAM",
    duration: "PENALTY_SHOOTOUT",
    fullTime: { home: 3, away: 4 },
    halfTime: { home: 1, away: 0 },
    regularTime: { home: 1, away: 0 },
    extraTime: { home: 0, away: 0 },
    penalties: { home: 2, away: 4 },
  });
  assert.deepEqual(regulationScore(m), { home: 1, away: 0 });
  assert.equal(fdWinnerCode(m, "ATL", "RMA"), "RMA");
});

test("extra time, no pens → fullTime is the 120' result (INT–FCB 4–3)", () => {
  const m = fd({
    winner: "HOME_TEAM",
    duration: "EXTRA_TIME",
    fullTime: { home: 4, away: 3 },
    halfTime: { home: 2, away: 0 },
    regularTime: { home: 3, away: 3 },
    extraTime: { home: 1, away: 0 },
  });
  assert.deepEqual(regulationScore(m), { home: 4, away: 3 });
  assert.equal(fdWinnerCode(m, "INT", "FCB"), "INT");
});

test("plain 90' match (no regularTime field) → falls back to fullTime", () => {
  const m = fd({
    winner: "HOME_TEAM",
    duration: "REGULAR",
    fullTime: { home: 2, away: 1 },
    halfTime: { home: 1, away: 0 },
  });
  assert.deepEqual(regulationScore(m), { home: 2, away: 1 });
});

test("group-stage draw → score kept, no winner", () => {
  const m = fd({
    winner: "DRAW",
    duration: "REGULAR",
    fullTime: { home: 1, away: 1 },
    halfTime: { home: 0, away: 1 },
  });
  assert.deepEqual(regulationScore(m), { home: 1, away: 1 });
  assert.equal(fdWinnerCode(m, "BRA", "ARG"), null);
});

test("unplayed / null score → null", () => {
  const m = fd({
    winner: null,
    duration: null,
    fullTime: { home: null, away: null },
    halfTime: { home: null, away: null },
  });
  assert.equal(regulationScore(m), null);
});

// ── ninetyMinuteScore: strips extra-time goals too, unlike regulationScore ──

test("ninetyMinuteScore: penalty shootout → 90' score (LIV–PSG 0–1)", () => {
  const m = fd({
    winner: "AWAY_TEAM",
    duration: "PENALTY_SHOOTOUT",
    fullTime: { home: 1, away: 5 },
    halfTime: { home: 0, away: 1 },
    regularTime: { home: 0, away: 1 },
    extraTime: { home: 0, away: 0 },
    penalties: { home: 1, away: 4 },
  });
  assert.deepEqual(ninetyMinuteScore(m), { home: 0, away: 1 });
});

test("ninetyMinuteScore: extra time, no pens → 90' score excludes ET goals (INT–FCB 3–3, not 4–3)", () => {
  const m = fd({
    winner: "HOME_TEAM",
    duration: "EXTRA_TIME",
    fullTime: { home: 4, away: 3 },
    halfTime: { home: 2, away: 0 },
    regularTime: { home: 3, away: 3 },
    extraTime: { home: 1, away: 0 },
  });
  assert.deepEqual(ninetyMinuteScore(m), { home: 3, away: 3 });
  // regulationScore (120') and ninetyMinuteScore (90') diverge for this match.
  assert.deepEqual(regulationScore(m), { home: 4, away: 3 });
});

test("ninetyMinuteScore: plain 90' match (no regularTime field) → falls back to fullTime", () => {
  const m = fd({
    winner: "HOME_TEAM",
    duration: "REGULAR",
    fullTime: { home: 2, away: 1 },
    halfTime: { home: 1, away: 0 },
  });
  assert.deepEqual(ninetyMinuteScore(m), { home: 2, away: 1 });
});

test("ninetyMinuteScore: unplayed / null score → null", () => {
  const m = fd({
    winner: null,
    duration: null,
    fullTime: { home: null, away: null },
    halfTime: { home: null, away: null },
  });
  assert.equal(ninetyMinuteScore(m), null);
});

// ── team-code overrides ──

test("fdTlaToCode maps the two exceptions and passes everything else through", () => {
  assert.equal(fdTlaToCode("CUW"), "CUR"); // Curaçao
  assert.equal(fdTlaToCode("URY"), "URU"); // Uruguay
  assert.equal(fdTlaToCode("BRA"), "BRA");
  assert.equal(fdTlaToCode(null), null);
});
