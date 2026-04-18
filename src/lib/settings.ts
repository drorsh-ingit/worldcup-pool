export const DEFAULT_GROUP_SETTINGS = {
  totalPool: 1000,

  tierWeights: {
    preTournament: 0.25,
    perGame: 0.40,
    milestone: 0.20,
    curated: 0.15,
  },

  subWeights: {
    preTournament: {
      winner: 0.25,
      runnerUp: 0.15,
      goldenBoot: 0.15,
      groupPredictions: 0.30,
      darkHorse: 0.075,
      reverseDarkHorse: 0.075,
    },
    perGame: {
      matchWinner: 0.55,
      correctScore: 0.45,
    },
    milestone: {
      bracket: 0.40,
      goldenGlove: 0.15,
      goldenBall: 0.15,
      semifinalists: 0.30,
    },
    curated: {
      props: 1.0,
    },
  },

  basePct: {
    winner: 0.40,
    runnerUp: 0.40,
    goldenBoot: 0.40,
    groupPredictions: 0.20,
    darkHorse: 0.30,
    reverseDarkHorse: 0.30,
    matchWinner: 0.15,
    correctScore: 0.20,
    bracket: 0.25,
    goldenGlove: 0.25,
    goldenBall: 0.25,
    semifinalists: 0.25,
    props: 0.15,
  },

  outlierThresholds: {
    // Max odds beyond which all picks get max bonus (prevents extreme longshots from compressing the spread)
    // e.g., 25000 = +25000 American odds = 250/1 decimal
    winner: 25000,
    runnerUp: 20000,
    goldenBoot: 8000,
    groupPredictions: 5000,
    darkHorse: 10000,
    reverseDarkHorse: 10000,
    matchWinner: 100000,
    correctScore: 100000,
    bracket: 100000,
    goldenGlove: 3000,
    goldenBall: 3000,
    semifinalists: 2000,
    props: 100000,
  },

  knockoutMultipliers: {
    GROUP: 1.0,
    R32: 1.2,
    R16: 1.3,
    QF: 1.5,
    SF: 1.7,
    FINAL: 2.0,
  },

  groupStageMatches: 36,
  // Effective match count for dividing the perGame tier pool, accounting for knockout multipliers:
  // 36 group + 16*1.2 (R32) + 8*1.3 (R16) + 4*1.5 (QF) + 2*1.7 (SF) + 1*2.0 (FINAL) = 77
  perGameMatchEquivalents: 77,
  curatedGameCount: 7,
};

export type SimulationSnapshot = {
  betTypes: Array<{
    id: string;
    status: string;
    opensAt: string | null;
    locksAt: string | null;
    resolvedAt: string | null;
  }>;
  matches: Array<{
    id: string;
    status: string;
    actualHomeScore: number | null;
    actualAwayScore: number | null;
  }>;
};

export type SimulationAwards = {
  goldenBoot?: string;
  goldenBall?: string;
  goldenGlove?: string;
};

export type SimulationConfig = {
  enabled: boolean;
  simulatedDate: string; // ISO string
  snapshot: SimulationSnapshot;
  awards?: SimulationAwards;
};

export type GroupSettings = typeof DEFAULT_GROUP_SETTINGS & {
  simulation?: SimulationConfig;
};

/**
 * Merge stored group settings on top of defaults (deep merge for nested objects).
 * This ensures new/changed defaults in DEFAULT_GROUP_SETTINGS take effect for
 * existing groups without requiring a DB migration.
 */
export function resolveGroupSettings(stored: unknown): GroupSettings {
  const s = (stored ?? {}) as Partial<GroupSettings>;
  return {
    ...DEFAULT_GROUP_SETTINGS,
    ...s,
    tierWeights: { ...DEFAULT_GROUP_SETTINGS.tierWeights, ...(s.tierWeights ?? {}) },
    subWeights: {
      preTournament: { ...DEFAULT_GROUP_SETTINGS.subWeights.preTournament, ...(s.subWeights?.preTournament ?? {}) },
      perGame: { ...DEFAULT_GROUP_SETTINGS.subWeights.perGame, ...(s.subWeights?.perGame ?? {}) },
      milestone: { ...DEFAULT_GROUP_SETTINGS.subWeights.milestone, ...(s.subWeights?.milestone ?? {}) },
      curated: { ...DEFAULT_GROUP_SETTINGS.subWeights.curated, ...(s.subWeights?.curated ?? {}) },
    },
    basePct: { ...DEFAULT_GROUP_SETTINGS.basePct, ...(s.basePct ?? {}) },
    outlierThresholds: { ...DEFAULT_GROUP_SETTINGS.outlierThresholds, ...(s.outlierThresholds ?? {}) },
    knockoutMultipliers: { ...DEFAULT_GROUP_SETTINGS.knockoutMultipliers, ...(s.knockoutMultipliers ?? {}) },
    simulation: s.simulation,
  };
}
