import { describe, expect, it } from "vitest";

import { buildInstructionBreakdown } from "../../src/sim/isa/instructionCount";
import { buildCpiStack } from "../../src/sim/perf/cpi";
import { estimatePerformance } from "../../src/sim/perf/performance";
import { data, tuning } from "../design/helpers";
import { CALIBRATION_SPECS, buildCalibrationDesign } from "../calibration/referenceDesigns";

const workload = data.workloadById["business-ledger"]!;
const game = data.workloadById["galaxy-raiders"]!;

describe("CPI stack", () => {
  it("keeps components additive and explains every cycle", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[2]!);
    const breakdown = buildInstructionBreakdown(design, workload, data, tuning);
    const stack = buildCpiStack(design, workload, breakdown, data, tuning, {
      clockMHz: 5,
    });
    const sum = stack.components.reduce((total, component) => total + component.cpi, 0);
    expect(sum).toBeCloseTo(stack.total, 10);
    expect(stack.total).toBeGreaterThan(1);
    expect(stack.components).toHaveLength(7);
    for (const component of stack.components) {
      expect(component.label.length).toBeGreaterThan(0);
      expect(component.detail.length).toBeGreaterThan(0);
      expect(component.cpi).toBeGreaterThanOrEqual(0);
    }
  });

  it("charges microcode more than hardwired control on a non-pipelined core", () => {
    const base = buildCalibrationDesign(CALIBRATION_SPECS[2]!);
    const micro = estimatePerformance(base, workload, data, tuning, { clockMHz: 5 });
    const hardwired = estimatePerformance(
      { ...base, settings: { ...base.settings, control: "hardwired" } },
      workload,
      data,
      tuning,
      { clockMHz: 5 },
    );
    expect(micro.cpi.total).toBeGreaterThan(hardwired.cpi.total);
    expect(hardwired.cpi.controlFactor).toBe(tuning.perf.controlFactors.hardwired);
  });

  it("shows structural pressure when the datapath has fewer units", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[4]!);
    const full = estimatePerformance(design, game, data, tuning, { clockMHz: 16 });
    const oneAlu = {
      ...design,
      blocks: design.blocks.filter(
        (block, index) =>
          block.typeId !== "alu" ||
          index === design.blocks.findIndex((candidate) => candidate.typeId === "alu"),
      ),
    };
    const narrow = estimatePerformance(oneAlu, game, data, tuning, { clockMHz: 16 });
    const fullStructural = full.cpi.components.find((c) => c.key === "structural")?.cpi ?? 0;
    const narrowStructural = narrow.cpi.components.find((c) => c.key === "structural")?.cpi ?? 0;
    expect(narrowStructural).toBeGreaterThanOrEqual(fullStructural);
    expect(full.cpi.units.length).toBeGreaterThan(0);
    expect(full.cpi.units.some((unit) => unit.blockCount >= 2)).toBe(true);
  });

  it("only charges branch penalties when the pipeline exists", () => {
    const pipelined = buildCalibrationDesign(CALIBRATION_SPECS[4]!);
    const flat = { ...pipelined, settings: { ...pipelined.settings, pipelineStages: 1 } };
    const withPipeline = estimatePerformance(pipelined, game, data, tuning, { clockMHz: 16 });
    const without = estimatePerformance(flat, game, data, tuning, { clockMHz: 16 });
    const branchWith =
      withPipeline.cpi.components.find((component) => component.key === "branch")?.cpi ?? 0;
    const branchWithout =
      without.cpi.components.find((component) => component.key === "branch")?.cpi ?? 0;
    expect(branchWith).toBeGreaterThan(0);
    expect(branchWithout).toBe(0);
    expect(withPipeline.cpi.branchAccuracy).toBeGreaterThan(0.5);
  });

  it("applies custom instructions only to a matching workload pattern", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[4]!);
    const withCustom = { ...design, customInstructions: ["ci-multiply-accumulate"] };
    const galaxyPlain = estimatePerformance(design, game, data, tuning, { clockMHz: 16 });
    const galaxyCustom = estimatePerformance(withCustom, game, data, tuning, { clockMHz: 16 });
    const ledgerPlain = estimatePerformance(design, workload, data, tuning, { clockMHz: 16 });
    const ledgerCustom = estimatePerformance(withCustom, workload, data, tuning, { clockMHz: 16 });

    expect(galaxyCustom.instructions).toBeLessThan(galaxyPlain.instructions);
    expect(galaxyCustom.timePerUnitMs).toBeLessThan(galaxyPlain.timePerUnitMs);
    expect(galaxyCustom.cpi.customShare).toBeGreaterThan(0);
    expect(galaxyCustom.cpi.customInstructionCount).toBeGreaterThan(0);

    expect(ledgerCustom.instructions).toBe(ledgerPlain.instructions);
    expect(ledgerCustom.timePerUnitMs).toBeCloseTo(ledgerPlain.timePerUnitMs, 12);
    expect(ledgerCustom.cpi.customShare).toBe(0);
  });
});
