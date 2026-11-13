import { describe, expect, it } from "vitest";

import { buildGameData } from "../../src/data/load";
import { analyzePhysical } from "../../src/sim/design/physical";
import type { ChipDesign } from "../../src/sim/design/types";
import { data, emptyDesign, place, run, tuning } from "../design/helpers";
import { mutableRawData } from "../data/helpers";

function basicDesign(): ChipDesign {
  let design = run(emptyDesign(), { type: "resizeDie", dieW: 30, dieH: 30 });
  design = place(design, "register-file", 10, 10);
  design = place(design, "alu", 14, 10);
  return design;
}

function allBlocksDesign(): ChipDesign {
  let design = run(emptyDesign(), { type: "resizeDie", dieW: 30, dieH: 30 });
  design = place(design, "program-counter", 2, 2);
  design = place(design, "decoder-hardwired", 6, 2);
  design = place(design, "decoder-microcoded", 11, 2);
  design = place(design, "register-file", 17, 2);
  design = place(design, "alu", 22, 2);
  design = place(design, "shifter", 2, 7);
  design = place(design, "multiplier", 6, 7);
  design = place(design, "divider", 8, 7);
  design = place(design, "fpu", 10, 7);
  design = place(design, "mmu", 12, 7);
  design = place(design, "instruction-cache", 14, 7);
  design = place(design, "data-cache", 18, 7);
  design = place(design, "interrupt-timer", 22, 7);
  design = place(design, "clock-generator", 2, 11);
  design = place(design, "custom-unit", 6, 11);
  design = place(design, "io-pads", 0, 20);
  design = place(design, "bus-interface", 25, 0);
  return design;
}

describe("physical analysis acceptance", () => {
  it("lowers fMax when the ALU moves away from the register file", () => {
    const near = basicDesign();
    let far = run(emptyDesign(), { type: "resizeDie", dieW: 30, dieH: 30 });
    far = place(far, "register-file", 10, 10);
    far = place(far, "alu", 25, 25);
    const nearAnalysis = analyzePhysical(near, data, tuning);
    const farAnalysis = analyzePhysical(far, data, tuning);
    expect(nearAnalysis.timing.fMaxMHz).toBeGreaterThan(farAnalysis.timing.fMaxMHz);
    expect(farAnalysis.wires.filter((wire) => wire.timing === "critical")).toHaveLength(2);
    expect(farAnalysis.wires.every((wire) => wire.detour >= 1)).toBe(true);
  });

  it("lowers the hotspot when two hot ALUs are spread apart", () => {
    let adjacent = place(emptyDesign(), "alu", 2, 2);
    adjacent = place(adjacent, "alu", 5, 2);
    let spread = place(emptyDesign(), "alu", 2, 2);
    spread = place(spread, "alu", 5, 5);
    const adjacentAnalysis = analyzePhysical(adjacent, data, tuning);
    const spreadAnalysis = analyzePhysical(spread, data, tuning);
    expect(adjacentAnalysis.thermal.hotspotC).toBeGreaterThan(
      spreadAnalysis.thermal.hotspotC,
    );
  });

  it("recomputes a full 30x30 design in under 50 ms", () => {
    const design = allBlocksDesign();
    analyzePhysical(design, data, tuning);
    const start = performance.now();
    const analysis = analyzePhysical(design, data, tuning);
    const elapsed = performance.now() - start;
    expect(analysis.timing.paths.length).toBeGreaterThan(0);
    expect(analysis.power.totalW).toBeGreaterThan(0);
    expect(analysis.thermal.contributions.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);
  });

  it("returns Why breakdowns whose shares sum to one", () => {
    const analysis = analyzePhysical(allBlocksDesign(), data, tuning);
    expect(analysis.timing.why.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
    expect(analysis.power.why.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
    expect(analysis.thermal.why.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
    if (analysis.congestion.overflowTiles > 0) {
      expect(
        analysis.congestion.why.reduce((sum, entry) => sum + entry.share, 0),
      ).toBeCloseTo(1);
    }
  });

  it("derates the sustained clock when the junction limit is exceeded", () => {
    let design = run(emptyDesign(), { type: "setPackage", packageId: "plastic-dip" });
    design = place(design, "register-file", 0, 0);
    for (const [x, y] of [
      [4, 0],
      [7, 0],
      [4, 3],
      [7, 3],
      [0, 4],
      [0, 7],
      [4, 6],
      [7, 6],
    ] as const) {
      design = place(design, "alu", x, y);
    }
    const raw = mutableRawData(data);
    const plastic = raw.packages.find((pkg) => pkg.id === "plastic-dip");
    if (plastic === undefined) {
      throw new Error("fixture is missing the plastic package");
    }
    plastic.maxJunctionTempC = 30;
    const hotData = buildGameData(raw);
    const analysis = analyzePhysical(design, hotData, hotData.tuning);
    expect(analysis.thermalLimited).toBe(true);
    expect(analysis.sustainedClockMHz).toBeLessThan(analysis.timing.fMaxMHz);
    expect(analysis.power.clockMHz).toBeCloseTo(analysis.sustainedClockMHz);
  });
});
