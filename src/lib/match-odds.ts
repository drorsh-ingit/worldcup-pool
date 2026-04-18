/**
 * Derive per-match decimal odds (home / draw / away) from each team's tournament-winner odds.
 * Lower winnerOdds = stronger team. We allocate ~72% probability mass to non-draw outcomes,
 * split in proportion to relative strength, and 28% to draws.
 */
/** Rough expected goals per team from tournament-winner odds. Stronger team → more goals. */
function expectedGoals(
  homeWinnerOdds: number,
  awayWinnerOdds: number,
  avgGoalsOverride?: number
): { lambdaH: number; lambdaA: number } {
  const sHome = 1 / Math.max(homeWinnerOdds, 1);
  const sAway = 1 / Math.max(awayWinnerOdds, 1);
  const total = sHome + sAway;
  const avgGoals = avgGoalsOverride ?? 2.6; // typical WC average
  const homeShare = total > 0 ? sHome / total : 0.5;
  return {
    lambdaH: avgGoals * homeShare * 1.1, // slight home edge
    lambdaA: avgGoals * (1 - homeShare) * 0.9,
  };
}

/** Poisson CDF at floor(x), i.e. P(K ≤ x) for K ~ Poisson(lambda). */
function poissonCdfFloor(x: number, lambda: number): number {
  const n = Math.floor(x);
  let sum = 0;
  for (let k = 0; k <= n; k++) sum += poissonPmf(k, lambda);
  return sum;
}

/**
 * Given an over-line (e.g. 2.5) and the de-vigged P(total > line), solve for
 * the lambda of a Poisson distribution on total goals. Bisection over [0.4, 6].
 */
export function impliedTotalGoals(line: number, overProb: number): number {
  let lo = 0.4;
  let hi = 6.0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const pOver = 1 - poissonCdfFloor(line, mid);
    if (pOver < overProb) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function poissonPmf(k: number, lambda: number): number {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

/** Derive decimal odds for every scoreline 0-0 through maxGoals-maxGoals. */
export function deriveScoreOdds(
  homeWinnerOdds: number,
  awayWinnerOdds: number,
  maxGoals = 6,
  avgGoalsOverride?: number
): Record<string, number> {
  const { lambdaH, lambdaA } = expectedGoals(homeWinnerOdds, awayWinnerOdds, avgGoalsOverride);
  const out: Record<string, number> = {};
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPmf(h, lambdaH) * poissonPmf(a, lambdaA);
      out[`${h}-${a}`] = parseFloat((1 / Math.max(p, 0.0001)).toFixed(2));
    }
  }
  return out;
}

export function deriveMatchOdds(
  homeWinnerOdds: number,
  awayWinnerOdds: number
): { homeWin: number; draw: number; awayWin: number } {
  const sHome = 1 / Math.max(homeWinnerOdds, 1);
  const sAway = 1 / Math.max(awayWinnerOdds, 1);
  const total = sHome + sAway;

  // Closeness 0..1: 1 = equal strength, 0 = one side overwhelmingly favoured.
  const closeness = total > 0 ? 1 - Math.abs(sHome - sAway) / total : 1;
  // Draws range ~18% (mismatch) → ~33% (pick-em), matching typical h2h markets.
  const drawProb = 0.18 + 0.15 * closeness;
  const nonDrawMass = 1 - drawProb;

  const pHome = total > 0 ? (sHome / total) * nonDrawMass : nonDrawMass / 2;
  const pAway = total > 0 ? (sAway / total) * nonDrawMass : nonDrawMass / 2;

  return {
    homeWin: parseFloat((1 / Math.max(pHome, 0.01)).toFixed(2)),
    draw: parseFloat((1 / drawProb).toFixed(2)),
    awayWin: parseFloat((1 / Math.max(pAway, 0.01)).toFixed(2)),
  };
}
