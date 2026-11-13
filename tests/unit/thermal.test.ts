import { describe, expect, it } from "vitest";

import { analyzeThermal } from "../../src/sim/design/thermal";
import { analyzePower } from "../../src/sim/perf/power";
import { data, emptyDesign, place, run, tuning } from "../design/helpers";

function powerFor(design: ReturnType<typeof emptyDesign>) {
  return analyzePower(design, data, tuning, { clockMHz: 1 });
}

describe("thermal grid", () => {
  it("stays at ambient when no block consumes power", () => {
    const design = emptyDesign();
    const result = analyzeThermal(design, powerFor(design), data, tuning);
    expect(result.hotspotC).toBeCloseTo(tuning.physical.ambientTempC);
    expect(result.averageC).toBeCloseTo(tuning.physical.ambientTempC);
    expect(result.temperaturesC.every((value) => value === tuning.physical.ambientTempC)).toBe(
      true,
    );
    expect(result.contributions).toEqual([]);
    expect(result.why).toEqual([]);
    expect(result.overLimit).toBe(false);
    expect(result.converged).toBe(true);
  });

  it("heats the hotspot above ambient and explains every degree of rise", () => {
    const design = place(emptyDesign(), "alu", 4, 4);
    const result = analyzeThermal(design, powerFor(design), data, tuning);
    expect(result.hotspotC).toBeGreaterThan(tuning.physical.ambientTempC);
    expect(result.averageC).toBeLessThan(result.hotspotC);
    expect(result.hotspotTile.x).toBeGreaterThanOrEqual(4);
    expect(result.hotspotTile.x).toBeLessThan(7);
    expect(result.hotspotTile.y).toBeGreaterThanOrEqual(4);
    expect(result.hotspotTile.y).toBeLessThan(7);
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThanOrEqual(tuning.physical.thermalIterations);
    expect(result.temperaturesC[result.hotspotTile.y * design.dieW + result.hotspotTile.x]).toBe(
      result.hotspotC,
    );
    expect(result.contributions).toHaveLength(1);
    expect(result.contributions[0]?.share).toBeCloseTo(1);
    expect(result.contributions[0]?.contributionC).toBeCloseTo(
      result.hotspotC - tuning.physical.ambientTempC,
    );
    expect(result.why.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
  });

  it("lowers the hotspot when two hot blocks are spread apart", () => {
    let adjacent = place(emptyDesign(), "alu", 2, 2);
    adjacent = place(adjacent, "alu", 5, 2);
    let spread = place(emptyDesign(), "alu", 2, 2);
    spread = place(spread, "alu", 5, 5);
    const adjacentResult = analyzeThermal(adjacent, powerFor(adjacent), data, tuning);
    const spreadResult = analyzeThermal(spread, powerFor(spread), data, tuning);
    expect(adjacentResult.hotspotC).toBeGreaterThan(spreadResult.hotspotC);
    expect(adjacentResult.why.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
    expect(spreadResult.why.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
  });

  it("uses the package junction limit and margin", () => {
    let design = run(emptyDesign(), { type: "setPackage", packageId: "plastic-dip" });
    design = place(design, "alu", 2, 2);
    design = place(design, "alu", 5, 2);
    design = place(design, "alu", 2, 5);
    design = place(design, "alu", 5, 5);
    const result = analyzeThermal(design, powerFor(design), data, tuning);
    expect(result.maxJunctionTempC).toBe(70);
    expect(result.marginC).toBeCloseTo(70 - result.hotspotC);
    expect(result.overLimit).toBe(result.hotspotC > 70);
  });
});
