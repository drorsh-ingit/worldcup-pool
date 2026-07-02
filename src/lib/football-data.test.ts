import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveMatchResult, type FDMatch } from "./football-data";
import { fdTlaToCode } from "./wc-team-map";

// Minimal FDMatch builder — only the score-related fields matter for these pure functions.
function fd(
  score: FDMatch["score"],
  status: FDMatch["status"] = "FINISHED",
  homeTla = "HOM",
  awayTla = "AWY"
): FDMatch {
  return {
    id: 1,
    utcDate: "2026-06-11T19:00:00Z",
    status,
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

test("plain 90' match → 90' == FT, no ET, no pens", () => {
  const r = deriveMatchResult(fd({
    winner: "HOME_TEAM", duration: "REGULAR",
    fullTime: { home: 2, away: 1 }, halfTime: { home: 1, away: 0 },
  }));
  assert.deepEqual(r, {
    score90: { home: 2, away: 1 }, scoreFt: { home: 2, away: 1 },
    pens: null, winner: "HOME_TEAM", wentToExtraTime: false,
  });
});

test("group-stage draw → winner DRAW, no ET", () => {
  const r = deriveMatchResult(fd({
    winner: "DRAW", duration: "REGULAR",
    fullTime: { home: 1, away: 1 }, halfTime: { home: 0, away: 1 },
  }));
  assert.equal(r?.winner, "DRAW");
  assert.deepEqual(r?.score90, { home: 1, away: 1 });
  assert.equal(r?.wentToExtraTime, false);
});

test("extra time, no pens (BEL–SEN): 90'=2–2, FT=3–2, ET flagged, winner home", () => {
  // The real regression: fullTime is the 120' score, regularTime the 90'.
  const r = deriveMatchResult(fd({
    winner: "HOME_TEAM", duration: "EXTRA_TIME",
    fullTime: { home: 3, away: 2 }, halfTime: { home: 0, away: 1 },
    regularTime: { home: 2, away: 2 }, extraTime: { home: 1, away: 0 },
  }));
  assert.deepEqual(r, {
    score90: { home: 2, away: 2 }, scoreFt: { home: 3, away: 2 },
    pens: null, winner: "HOME_TEAM", wentToExtraTime: true,
  });
});

test("penalty shootout: FT excludes the shootout, 90' from regularTime", () => {
  // Real: reg 0–1, ET 0–0, pens 1–4, fullTime 1–5 (INCLUDES pens).
  const r = deriveMatchResult(fd({
    winner: "AWAY_TEAM", duration: "PENALTY_SHOOTOUT",
    fullTime: { home: 1, away: 5 }, halfTime: { home: 0, away: 1 },
    regularTime: { home: 0, away: 1 }, extraTime: { home: 0, away: 0 },
    penalties: { home: 1, away: 4 },
  }));
  assert.deepEqual(r, {
    score90: { home: 0, away: 1 }, scoreFt: { home: 0, away: 1 },
    pens: { home: 1, away: 4 }, winner: "AWAY_TEAM", wentToExtraTime: true,
  });
});

test("penalty shootout with ET goals: FT = reg+ET, excludes pens", () => {
  const r = deriveMatchResult(fd({
    winner: "HOME_TEAM", duration: "PENALTY_SHOOTOUT",
    fullTime: { home: 6, away: 5 }, halfTime: { home: 1, away: 0 },
    regularTime: { home: 1, away: 1 }, extraTime: { home: 1, away: 0 },
    penalties: { home: 4, away: 3 },
  }));
  assert.deepEqual(r?.score90, { home: 1, away: 1 });
  assert.deepEqual(r?.scoreFt, { home: 2, away: 1 }); // reg 1–1 + ET 1–0
  assert.deepEqual(r?.pens, { home: 4, away: 3 });
});

// ── The gate: incomplete/settling feeds must return null, never a bad completion ──

test("settle window: ET match whose regularTime is {null,null} → null (retry, don't freeze)", () => {
  // This is exactly how BEL–SEN got a null 90': FINISHED before the breakdown filled in.
  const r = deriveMatchResult(fd({
    winner: "HOME_TEAM", duration: "EXTRA_TIME",
    fullTime: { home: 3, away: 2 }, halfTime: { home: 0, away: 1 },
    regularTime: { home: null, away: null },
  }));
  assert.equal(r, null);
});

test("not finished yet → null", () => {
  const r = deriveMatchResult(fd({
    winner: null, duration: "REGULAR",
    fullTime: { home: 1, away: 0 }, halfTime: { home: 0, away: 0 },
  }, "IN_PLAY"));
  assert.equal(r, null);
});

test("unplayed / null score → null", () => {
  const r = deriveMatchResult(fd({
    winner: null, duration: null,
    fullTime: { home: null, away: null }, halfTime: { home: null, away: null },
  }));
  assert.equal(r, null);
});

// ── team-code overrides ──

test("fdTlaToCode maps the two exceptions and passes everything else through", () => {
  assert.equal(fdTlaToCode("CUW"), "CUR"); // Curaçao
  assert.equal(fdTlaToCode("URY"), "URU"); // Uruguay
  assert.equal(fdTlaToCode("BRA"), "BRA");
  assert.equal(fdTlaToCode(null), null);
});
