import { describe, expect, it } from "vitest";

import { estimatePerformance, estimatePerformanceForDesign } from "../../src/sim/perf/performance";
import {
  memoryLatencyNs,
  missRateFor,
  waitCyclesFor,
} from "../../src/sim/perf/memory";
import { analyzePhysical } from "../../src/sim/design/physical";
import { data, tuning } from "../design/helpers";
import { CALIBRATION_SPECS, buildCalibrationDesign } from "../calibration/referenceDesigns";

describe("memory latency and caches", () => {
  it("interpolates the world table and clamps outside it", () => {
    expect(memoryLatencyNs(1971, data.memoryLatency)).toBe(600);
    expect(memoryLatencyNs(1960, data.memoryLatency)).toBe(600);
    expect(memoryLatencyNs(2000, data.memoryLatency)).toBe(70);
    expect(memoryLatencyNs(2020, data.memoryLatency)).toBe(70);
    const between = memoryLatencyNs(1975, data.memoryLatency);
    expect(between).toBeGreaterThan(250);
    expect(between).toBeLessThan(600);
  });

  it("follows the square-root miss law with a compulsory floor", () => {
    const small = missRateFor(1, 64, 1, tuning);
    const large = missRateFor(8, 64, 1, tuning);
    expect(large).toBeLessThan(small);
    expect(small).toBeLessThanOrEqual(1);
    expect(missRateFor(128, 64, 1, tuning)).toBe(
      tuning.perf.memory.compulsoryMissFloor,
    );
    expect(missRateFor(8, 64, 2, tuning)).toBeLessThan(large);
    expect(missRateFor(0, 64, 1, tuning)).toBe(1);
  });

  it("only charges bus cycles when memory misses the CPU cycle", () => {
    const low = waitCyclesFor(1, 600, 4, 4, true, tuning);
    expect(low.latencyWait).toBe(0);
    expect(low.total).toBe(0);

    const high = waitCyclesFor(33, 600, 4, 4, false, tuning);
    expect(high.latencyWait).toBeGreaterThan(0);
    expect(high.busExtra).toBe(0);

    const multiplexed = waitCyclesFor(33, 600, 4, 4, true, tuning);
    expect(multiplexed.busExtra).toBe(tuning.perf.memory.multiplexedExtraBusCycles);
    expect(multiplexed.total).toBeGreaterThan(high.total);
  });

  it("makes a cache useful at 33 MHz but worthless at 1 MHz", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[4]!);
    const noCache = {
      ...design,
      blocks: design.blocks.filter(
        (block) =>
          block.typeId !== "instruction-cache" && block.typeId !== "data-cache",
      ),
    };
    const workload = data.workloadById["spreadsheet"]!;

    const cachedFast = estimatePerformance(design, workload, data, tuning, { clockMHz: 33 });
    const uncachedFast = estimatePerformance(noCache, workload, data, tuning, { clockMHz: 33 });
    expect(cachedFast.cpi.total).toBeLessThan(uncachedFast.cpi.total);
    expect(cachedFast.cpi.memory.instructionCache.present).toBe(true);
    expect(cachedFast.cpi.memory.instructionCache.missRate).toBeLessThan(1);
    expect(cachedFast.cpi.memory.instructionCache.hitExtraCycles).toBe(0);

    const cachedSlow = estimatePerformance(design, workload, data, tuning, { clockMHz: 1 });
    const uncachedSlow = estimatePerformance(noCache, workload, data, tuning, { clockMHz: 1 });
    expect(cachedSlow.cpi.total).toBeCloseTo(uncachedSlow.cpi.total, 12);
    expect(cachedSlow.cpi.memory.waitCycles).toBe(0);
  });

  it("counts memory stalls once, inside CPI only", () => {
    const design = buildCalibrationDesign(CALIBRATION_SPECS[2]!);
    const physical = analyzePhysical(design, data, tuning, {
      pipelineStages: design.settings.pipelineStages,
      cooling: design.settings.cooling,
      voltageV: design.settings.vdd,
    });
    const workload = data.workloadById["galaxy-raiders"]!;
    const perf = estimatePerformanceForDesign(design, workload, data, tuning, physical);
    const memoryCpi =
      perf.cpi.components.find((component) => component.key === "memory")?.cpi ?? 0;

    expect(perf.timePerUnitMs).toBeCloseTo(
      (perf.instructions * perf.cpi.total) / (perf.clockMHz * 1000),
      12,
    );
    expect(perf.fps.cpuFrameMs).toBeCloseTo(
      perf.timePerUnitMs + tuning.perf.fps.fixedOverheadMs,
      12,
    );
    expect(memoryCpi).toBeGreaterThan(0);
    expect(perf.cpi.total).toBeCloseTo(
      perf.cpi.components.reduce((sum, component) => sum + component.cpi, 0),
      12,
    );
  });
});
