import { describe, expect, it } from "vitest";

import { analyzePhysical } from "../../src/sim/design/physical";
import { dieAreaBreakdown, transistorCount } from "../../src/sim/design/area";
import { estimatePerformanceForDesign } from "../../src/sim/perf/performance";
import { data, tuning } from "../design/helpers";
import { CALIBRATION_SPECS, buildCalibrationDesign } from "./referenceDesigns";

const CLOCK_TOLERANCE = 0.35;
const MIPS_TOLERANCE = 0.35;
const AREA_TOLERANCE = 0.3;

function within(value: number, band: readonly [number, number], tolerance: number): boolean {
  return value >= band[0] * (1 - tolerance) && value <= band[1] * (1 + tolerance);
}

describe("Section 9.7 calibration", () => {
  for (const spec of CALIBRATION_SPECS) {
    it(`${spec.id} is within the published clock, MIPS and area bands`, () => {
      const design = buildCalibrationDesign(spec);
      const physical = analyzePhysical(design, data, tuning, {
        pipelineStages: design.settings.pipelineStages,
        cooling: design.settings.cooling,
        voltageV: design.settings.vdd,
      });
      const area = dieAreaBreakdown(design, data, tuning);
      const workload = data.workloadById["business-ledger"]!;
      const perf = estimatePerformanceForDesign(design, workload, data, tuning, physical);

      expect(within(physical.timing.fMaxMHz, spec.clockMHz, CLOCK_TOLERANCE)).toBe(true);
      expect(within(perf.mips, spec.mips, MIPS_TOLERANCE)).toBe(true);
      expect(within(area.totalAreaMm2, spec.areaMm2, AREA_TOLERANCE)).toBe(true);
      expect(transistorCount(design, data)).toBeGreaterThan(0);
      expect(perf.clockMHz).toBeGreaterThan(0);
    });
  }

  it("keeps the memory stall inside CPI so the time model stays additive", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[4]!);
    const physical = analyzePhysical(design, data, tuning, {
      pipelineStages: design.settings.pipelineStages,
      cooling: design.settings.cooling,
      voltageV: design.settings.vdd,
    });
    const galaxy = data.workloadById["galaxy-raiders"]!;
    const perf = estimatePerformanceForDesign(design, galaxy, data, tuning, physical);
    expect(perf.fps.cpuFrameMs).toBeCloseTo(
      perf.timePerUnitMs + tuning.perf.fps.fixedOverheadMs,
      12,
    );
  });
});
