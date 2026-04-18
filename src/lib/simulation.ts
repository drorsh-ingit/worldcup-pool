import type { GroupSettings } from "./settings";

export function isSimulationActive(settings: GroupSettings): boolean {
  return !!settings.simulation?.enabled;
}

export function getEffectiveDate(settings: GroupSettings): Date {
  if (settings.simulation?.enabled && settings.simulation.simulatedDate) {
    return new Date(settings.simulation.simulatedDate);
  }
  return new Date();
}

/**
 * Generate a realistic random match score.
 * Distribution per team roughly matches World Cup historical data:
 *   0: 25%, 1: 35%, 2: 22%, 3: 12%, 4: 4%, 5+: 2%
 */
export function generateRandomScore(): {
  homeScore: number;
  awayScore: number;
} {
  return {
    homeScore: randomGoals(),
    awayScore: randomGoals(),
  };
}

function randomGoals(): number {
  const r = Math.random();
  if (r < 0.25) return 0;
  if (r < 0.6) return 1;
  if (r < 0.82) return 2;
  if (r < 0.94) return 3;
  if (r < 0.98) return 4;
  return 5;
}
