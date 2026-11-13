import { describe, expect, it } from "vitest";

import { analyzePhysical } from "../../src/sim/design/physical";
import {
  estimateAllPerformance,
  estimatePerformance,
  estimatePerformanceForDesign,
} from "../../src/sim/perf/performance";
import { data, tuning } from "../design/helpers";
import { CALIBRATION_SPECS, buildCalibrationDesign } from "../calibration/referenceDesigns";

const galaxy = data.workloadById["galaxy-raiders"]!;
const ledger = data.workloadById["business-ledger"]!;

function physicalFor(design: ReturnType<typeof buildCalibrationDesign>) {
  return analyzePhysical(design, data, tuning, {
    pipelineStages: design.settings.pipelineStages,
    cooling: design.settings.cooling,
    voltageV: design.settings.vdd,
  });
}

describe("performance model", () => {
  it("puts the 4004 in single-digit FPS and a 32-bit 1985 CPU at the frame cap", () => {
    const old = buildCalibrationDesign(CALIBRATION_SPECS[0]!);
    const oldPerf = estimatePerformanceForDesign(old, galaxy, data, tuning, physicalFor(old));
    expect(oldPerf.fps.fps).toBeGreaterThan(0);
    expect(oldPerf.fps.fps).toBeLessThan(10);

    const modern = buildCalibrationDesign(CALIBRATION_SPECS[4]!);
    const modernPerf = estimatePerformanceForDesign(
      modern,
      galaxy,
      data,
      tuning,
      physicalFor(modern),
    );
    expect(modernPerf.fps.fps).toBe(60);
    expect(modernPerf.fps.bound).toBe("frame-cap");
    expect(modernPerf.fps.frameCapHz).toBe(60);
  });

  it("derives MIPS and ranges from the same CPI", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[3]!);
    const perf = estimatePerformance(design, ledger, data, tuning, { clockMHz: 10 });
    expect(perf.mips).toBeCloseTo(10 / perf.cpi.total, 12);
    expect(perf.mipsLow).toBeLessThan(perf.mips);
    expect(perf.mipsHigh).toBeGreaterThan(perf.mips);
    expect(perf.timePerUnitLowMs).toBeLessThan(perf.timePerUnitMs);
    expect(perf.timePerUnitHighMs).toBeGreaterThan(perf.timePerUnitMs);
    expect(perf.throughputPerSecond).toBeCloseTo(1000 / perf.timePerUnitMs, 12);
    expect(perf.why.length).toBeGreaterThan(0);
  });

  it("caps the operating clock at the target and at fMax", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[1]!);
    const physical = physicalFor(design);
    const targetLimited = estimatePerformanceForDesign(
      { ...design, settings: { ...design.settings, targetClockMHz: 0.5 } },
      ledger,
      data,
      tuning,
      physical,
    );
    expect(targetLimited.clockMHz).toBeCloseTo(0.5, 12);
    expect(targetLimited.targetClockMHz).toBe(0.5);

    const fMaxLimited = estimatePerformanceForDesign(
      { ...design, settings: { ...design.settings, targetClockMHz: 200 } },
      ledger,
      data,
      tuning,
      physical,
    );
    expect(fMaxLimited.clockMHz).toBeCloseTo(physical.sustainedClockMHz, 12);
    expect(fMaxLimited.clockMHz).toBeLessThanOrEqual(physical.timing.fMaxMHz + 1e-9);
  });

  it("uses no frame overhead for non-frame workloads", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[4]!);
    const perf = estimatePerformance(design, ledger, data, tuning, { clockMHz: 16 });
    expect(perf.fps.systemOverheadMs).toBe(0);
    expect(perf.fps.cpuFrameMs).toBeCloseTo(perf.timePerUnitMs, 12);
    expect(perf.fps.frameCapHz).toBeNull();
  });

  it("estimates every workload deterministically", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[2]!);
    const first = estimateAllPerformance(design, data.workloads, data, tuning, physicalFor(design));
    const second = estimateAllPerformance(design, data.workloads, data, tuning, physicalFor(design));
    expect(first).toHaveLength(data.workloads.length);
    expect(second).toEqual(first);
    expect(first.every((estimate) => estimate.clockMHz > 0)).toBe(true);
  });
});
