import type { GameData } from "../../data/load";
import type { Tuning, WorkloadProfile } from "../../data/schemas";
import type { ChipDesign } from "../design/types";
import { buildContributors } from "../explain/why";
import type { InstructionBreakdown } from "../isa/types";
import type { Confidence, UncertaintyEstimate } from "./types";

function testCoverage(design: ChipDesign, tuning: Tuning): number {
  const strategy = tuning.isa.testStrategies.find(
    (candidate) => candidate.id === design.settings.testStrategy,
  );
  return strategy?.coverage ?? 0;
}

/**
 * Section 9.6: model error, validation gap, compiler gap and workload variance.
 * Compiler maturity is weighted by how much of the workload relies on the new
 * custom instructions, matching Section 8.4's ecosystem intent.
 */
export function estimateUncertainty(
  design: ChipDesign,
  workload: WorkloadProfile,
  breakdown: InstructionBreakdown,
  data: GameData,
  tuning: Tuning,
): UncertaintyEstimate {
  const archetype = data.isaById[design.isa.archetypeId];
  if (archetype === undefined) {
    throw new Error(`Design references unknown ISA archetype "${design.isa.archetypeId}"`);
  }
  const validationCoverage = testCoverage(design, tuning);
  const customReliance =
    breakdown.totalOps > 0
      ? Math.min(1, breakdown.customRemoved / breakdown.totalOps)
      : 0;
  const compilerMaturity =
    archetype.compilerFriendliness * (1 - customReliance) +
    tuning.isa.customCompilerSupport * customReliance;

  const uncertainty = tuning.perf.uncertainty;
  const baseError = uncertainty.baseModelError;
  const validationError = uncertainty.validationWeight * (1 - validationCoverage);
  const compilerError = uncertainty.compilerWeight * (1 - compilerMaturity);
  const variance = workload.variance;
  const relative = Math.min(
    1,
    baseError + validationError + compilerError + variance,
  );

  const reasons = buildContributors(
    [
      {
        label: "Base model error",
        value: baseError,
        detail: "analytical model, not cycle-accurate",
      },
      {
        label: "Validation gap",
        value: validationError,
        detail: `${(validationCoverage * 100).toFixed(0)}% coverage`,
      },
      {
        label: "Compiler maturity",
        value: compilerError,
        detail: `${(compilerMaturity * 100).toFixed(0)}% mature for this code`,
      },
      {
        label: "Workload variance",
        value: variance,
        detail: `${workload.name} run-to-run spread`,
      },
    ],
    { limit: 6, otherLabel: "Other uncertainty" },
  );

  let confidence: Confidence = "low";
  if (relative < uncertainty.highThreshold) {
    confidence = "high";
  } else if (relative < uncertainty.mediumThreshold) {
    confidence = "medium";
  }

  return {
    relative,
    low: Math.max(0, 1 - relative),
    high: 1 + relative,
    confidence,
    reasons,
    validationCoverage,
    compilerMaturity,
    customReliance,
  };
}
