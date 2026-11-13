import { describe, expect, it } from "vitest";

import { analyzePower, blockActivity } from "../../src/sim/perf/power";
import { data, emptyDesign, place, tuning } from "../design/helpers";

describe("power model", () => {
  it("computes workload-weighted dynamic and static power", () => {
    const design = place(emptyDesign(), "alu", 0, 0);
    const result = analyzePower(design, data, tuning, { clockMHz: 1 });
    expect(result.workloadId).toBe("calculator-math");
    expect(result.dynamicW).toBeCloseTo(2.0072e-6, 9);
    expect(result.staticW).toBeCloseTo(0.02848, 9);
    expect(result.totalW).toBeCloseTo(result.dynamicW + result.staticW, 12);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.activity).toBeCloseTo(42.6 / 85, 9);
    expect(result.why.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
  });

  it("adds per-active-pad I/O power scaled by clock", () => {
    let design = place(emptyDesign(), "io-pads", 0, 0);
    design = place(design, "alu", 5, 5);
    const result = analyzePower(design, data, tuning, { clockMHz: 2 });
    const pads = result.blocks.find((block) => block.typeId === "io-pads");
    expect(pads?.ioW).toBeCloseTo(6 * 0.0005 * 2);
    expect(result.ioW).toBeCloseTo(0.006);
  });

  it("keeps static power when the clock stops", () => {
    const design = place(emptyDesign(), "alu", 0, 0);
    const result = analyzePower(design, data, tuning, { clockMHz: 0 });
    expect(result.dynamicW).toBe(0);
    expect(result.ioW).toBe(0);
    expect(result.staticW).toBeGreaterThan(0);
  });

  it("weights block activity by workload op shares", () => {
    expect(blockActivity({ intAlu: 1 }, { intAlu: 0.5, load: 0.5 })).toBeCloseTo(0.5);
    expect(blockActivity({ intAlu: 1, load: 0.5 }, { intAlu: 1 })).toBeCloseTo(1);
    expect(blockActivity({ intAlu: 1 }, {})).toBe(0);
  });
});
