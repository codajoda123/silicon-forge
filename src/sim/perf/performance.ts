import type { GameData } from "../../data/load";
import type { Tuning, WorkloadProfile } from "../../data/schemas";
import type { PhysicalAnalysis } from "../design/physical";
import type { ChipDesign } from "../design/types";
import { buildContributors } from "../explain/why";
import { buildInstructionBreakdown } from "../isa/instructionCount";
import { buildCpiStack } from "./cpi";
import { estimateFps } from "./fps";
import type { PerformanceEstimate, PerformanceOptions } from "./types";
import { estimateUncertainty } from "./uncertainty";

/** Section 9.5 outputs for one workload at one operating clock. */
export function estimatePerformance(
  design: ChipDesign,
  workload: WorkloadProfile,
  data: GameData,
  tuning: Tuning,
  options: PerformanceOptions,
): PerformanceEstimate {
  if (!Number.isFinite(options.clockMHz) || options.clockMHz <= 0) {
    throw new Error("Performance needs a positive operating clock");
  }
  const breakdown = buildInstructionBreakdown(design, workload, data, tuning);
  const cpi = buildCpiStack(design, workload, breakdown, data, tuning, {
    clockMHz: options.clockMHz,
  });
  const uncertainty = estimateUncertainty(design, workload, breakdown, data, tuning);

  const cyclesPerUnit = breakdown.totalInstructions * cpi.total;
  const timePerUnitMs = cyclesPerUnit / (options.clockMHz * 1000);
  const mips = cpi.total > 0 ? options.clockMHz / cpi.total : 0;
  const fps = estimateFps(
    workload,
    breakdown.totalInstructions,
    cpi.total,
    options.clockMHz,
    tuning,
    uncertainty.relative,
  );

  const why = buildContributors(
    cpi.components
      .filter((component) => component.cpi > 0)
      .map((component) => ({
        label: component.label,
        value: component.cpi,
        detail: component.detail,
      })),
    { limit: 6, otherLabel: "Other CPI components" },
  );

  return {
    workloadId: workload.id,
    workloadName: workload.name,
    workUnit: workload.workUnit,
    clockMHz: options.clockMHz,
    targetClockMHz: options.targetClockMHz ?? design.settings.targetClockMHz,
    fMaxMHz: options.fMaxMHz ?? options.clockMHz,
    thermalLimited: options.thermalLimited ?? false,
    instructions: breakdown.totalInstructions,
    cpi,
    cyclesPerUnit,
    timePerUnitMs,
    timePerUnitLowMs: timePerUnitMs * uncertainty.low,
    timePerUnitHighMs: timePerUnitMs * uncertainty.high,
    mips,
    mipsLow: mips * uncertainty.low,
    mipsHigh: mips * uncertainty.high,
    throughputPerSecond: timePerUnitMs > 0 ? 1000 / timePerUnitMs : 0,
    fps,
    uncertainty,
    confidence: uncertainty.confidence,
    why,
  };
}

/**
 * Operating clock: the player's target, capped by the timing limit and the
 * thermal derate M3 already applied. Target-over-fMax is reported, not hidden.
 */
export function estimatePerformanceForDesign(
  design: ChipDesign,
  workload: WorkloadProfile,
  data: GameData,
  tuning: Tuning,
  physical: PhysicalAnalysis,
): PerformanceEstimate {
  if (physical.sustainedClockMHz <= 0) {
    throw new Error("This design has no complete timing path, so it has no clock");
  }
  const clockMHz = Math.min(design.settings.targetClockMHz, physical.sustainedClockMHz);
  return estimatePerformance(design, workload, data, tuning, {
    clockMHz,
    targetClockMHz: design.settings.targetClockMHz,
    fMaxMHz: physical.timing.fMaxMHz,
    thermalLimited: physical.thermalLimited,
  });
}

export function estimateAllPerformance(
  design: ChipDesign,
  workloads: readonly WorkloadProfile[],
  data: GameData,
  tuning: Tuning,
  physical: PhysicalAnalysis,
): PerformanceEstimate[] {
  return workloads.map((workload) =>
    estimatePerformanceForDesign(design, workload, data, tuning, physical),
  );
}
