import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import type { Rng } from "../core/rng";
import { transistorCount } from "../design/area";
import type { ChipDesign } from "../design/types";
import { samplePoisson } from "./statistics";
import type { BugSeverity, ValidationRecord } from "./types";

export interface BugRange {
  expected: number;
  remaining: number;
  low: number;
  high: number;
}

/** Section 7.9 expected-bugs formula, before the hidden Poisson draw. */
export function expectedBugs(
  design: ChipDesign,
  data: GameData,
  tuning: Tuning,
): number {
  const config = tuning.manufacturing.validation;
  const transistors = transistorCount(design, data);
  const novelty = config.noveltyFactor;
  const customFactor = 1 + config.customInstructionBugFactor * design.customInstructions.length;
  const controlFactor = design.settings.control === "hardwired" ? config.hardwiredBugFactor : 1;
  return (
    config.baseBugCoefficient *
    Math.pow(Math.max(0, transistors) / 1000, config.bugTransistorExponent) *
    novelty *
    customFactor *
    controlFactor
  );
}

export function remainingBugRange(
  expected: number,
  coverage: number,
  tuning: Tuning,
): BugRange {
  const config = tuning.manufacturing.validation;
  const clampedCoverage = Math.min(1, Math.max(0, coverage));
  const remaining = Math.max(0, expected * (1 - clampedCoverage));
  const spread = config.rangeSigma * Math.sqrt(remaining);
  return {
    expected,
    remaining,
    low: Math.max(0, Math.floor(remaining - spread)),
    high: Math.ceil(remaining + spread),
  };
}

export function weeklyFindChance(tuning: Tuning): number {
  const config = tuning.manufacturing.validation;
  return 1 - Math.exp(-config.weeklySkill / config.coverageScaleWeeks);
}

export function sampleActualBugs(rng: Rng, expected: number): number {
  return samplePoisson(rng, expected);
}

/** Advance one week of a validation campaign and return the updated record. */
export function advanceValidation(
  record: ValidationRecord,
  week: number,
  rng: Rng,
  tuning: Tuning,
): ValidationRecord {
  const config = tuning.manufacturing.validation;
  const validatedWeeks = record.validatedWeeks + 1;
  const coverage = 1 - Math.exp((-validatedWeeks * config.weeklySkill) / config.coverageScaleWeeks);
  let foundBugs = record.foundBugs;
  let lastFoundWeek = record.lastFoundWeek;

  if (coverage >= config.fullCoverageThreshold) {
    foundBugs = record.actualBugs;
  } else {
    const chance = weeklyFindChance(tuning);
    let remaining = record.actualBugs - foundBugs;
    while (remaining > 0) {
      if (rng.chance(chance)) {
        foundBugs += 1;
        lastFoundWeek = week;
      }
      remaining -= 1;
    }
  }

  return {
    ...record,
    foundBugs: Math.min(record.actualBugs, foundBugs),
    validatedWeeks,
    lastFoundWeek,
    coverage,
  };
}

/** Section 7.9 severity split for bugs still hidden at tape-out. */
export function assignSeverities(
  remainingBugs: number,
  rng: Rng,
  tuning: Tuning,
): Record<BugSeverity, number> {
  const config = tuning.manufacturing.validation;
  const errataThreshold = config.severityCosmeticShare + config.severityErrataShare;
  const counts: Record<BugSeverity, number> = { cosmetic: 0, errata: 0, serious: 0 };
  for (let index = 0; index < remainingBugs; index += 1) {
    const roll = rng.next();
    if (roll < config.severityCosmeticShare) {
      counts.cosmetic += 1;
    } else if (roll < errataThreshold) {
      counts.errata += 1;
    } else {
      counts.serious += 1;
    }
  }
  return counts;
}

export function patchErrata(
  severities: Record<BugSeverity, number>,
  tuning: Tuning,
  microcoded: boolean,
): { severities: Record<BugSeverity, number>; patched: number } {
  if (!microcoded) {
    return { severities, patched: 0 };
  }
  const patched = Math.floor(
    severities.errata * tuning.manufacturing.validation.microcodeErrataFixShare,
  );
  return {
    severities: { ...severities, errata: severities.errata - patched },
    patched,
  };
}

export interface TapeOutCost {
  maskCost: number;
  toolCost: number;
  engineeringCost: number;
  totalCost: number;
}

export function tapeOutCost(data: GameData, design: ChipDesign, tuning: Tuning): TapeOutCost {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design references unknown node "${design.nodeId}"`);
  }
  const maskCost = node.maskSetCost;
  const toolCost = tuning.manufacturing.validation.tapeoutToolCost;
  const engineeringCost = tuning.manufacturing.validation.tapeoutEngineeringCost;
  return {
    maskCost,
    toolCost,
    engineeringCost,
    totalCost: maskCost + toolCost + engineeringCost,
  };
}