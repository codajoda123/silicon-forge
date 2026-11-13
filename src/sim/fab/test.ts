import type { Tuning } from "../../data/schemas";

export interface TestStrategyInfo {
  id: string;
  label: string;
  description: string;
  coverage: number;
  escapeRate: number;
  costPerDie: number;
}

export function testStrategyFor(strategyId: string, tuning: Tuning): TestStrategyInfo {
  const strategy = tuning.isa.testStrategies.find((candidate) => candidate.id === strategyId);
  if (strategy === undefined) {
    throw new Error(`Unknown test strategy "${strategyId}"`);
  }
  return strategy;
}