import { describe, expect, it } from "vitest";

import { buildInstructionBreakdown } from "../../src/sim/isa/instructionCount";
import { estimateUncertainty } from "../../src/sim/perf/uncertainty";
import { data, tuning } from "../design/helpers";
import { CALIBRATION_SPECS, buildCalibrationDesign } from "../calibration/referenceDesigns";

const galaxy = data.workloadById["galaxy-raiders"]!;
const ledger = data.workloadById["business-ledger"]!;

function uncertaintyFor(design: ReturnType<typeof buildCalibrationDesign>, workload = galaxy) {
  const breakdown = buildInstructionBreakdown(design, workload, data, tuning);
  return estimateUncertainty(design, workload, breakdown, data, tuning);
}

describe("uncertainty", () => {
  it("narrows when validation coverage improves", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[2]!);
    const none = uncertaintyFor({ ...design, settings: { ...design.settings, testStrategy: "none" } });
    const full = uncertaintyFor({
      ...design,
      settings: { ...design.settings, testStrategy: "full-scan-bist" },
    });
    expect(none.validationCoverage).toBe(0);
    expect(full.validationCoverage).toBeGreaterThan(0.9);
    expect(full.relative).toBeLessThan(none.relative);
    expect(none.confidence).toBe("low");
  });

  it("exposes the top reasons and relative bounds", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[3]!);
    const uncertainty = uncertaintyFor(design, ledger);
    expect(uncertainty.relative).toBeGreaterThan(0);
    expect(uncertainty.low).toBeCloseTo(1 - uncertainty.relative, 12);
    expect(uncertainty.high).toBeCloseTo(1 + uncertainty.relative, 12);
    expect(uncertainty.reasons.length).toBeGreaterThanOrEqual(3);
    const shares = uncertainty.reasons.reduce((sum, reason) => sum + reason.share, 0);
    expect(shares).toBeCloseTo(1, 10);
    expect(uncertainty.reasons.some((reason) => reason.label === "Base model error")).toBe(true);
  });

  it("ties compiler maturity to custom-instruction reliance", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[4]!);
    const plain = uncertaintyFor(design);
    const custom = uncertaintyFor({ ...design, customInstructions: ["ci-multiply-accumulate"] });
    expect(custom.customReliance).toBeGreaterThan(0);
    expect(custom.compilerMaturity).not.toBeCloseTo(plain.compilerMaturity, 12);
    expect(custom.relative).toBeGreaterThanOrEqual(plain.relative - 1e-12);
  });

  it("is deterministic", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[1]!);
    expect(uncertaintyFor(design)).toEqual(uncertaintyFor(design));
  });
});
