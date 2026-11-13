import { describe, expect, it } from "vitest";

import { dieAreaBreakdown, pinUsage, tileUsage, transistorCount } from "../../src/sim/design/area";
import { data, emptyDesign, place, run, tuning } from "../design/helpers";

describe("transistor count and die area", () => {
  it("sums every placed block's transistor formula", () => {
    let design = emptyDesign();
    design = place(design, "program-counter", 0, 0, { config: { addressWidth: 4 } });
    design = place(design, "alu", 3, 0, { config: { width: 4, carry: "ripple" } });

    expect(transistorCount(design, data)).toBe(232 + 268);
    expect(tileUsage(design)).toEqual({ used: 12, whitespace: 88, total: 100 });
  });

  it("computes core, pad-ring and scribe area from node and tuning data", () => {
    const design = emptyDesign();
    const node = data.nodeById[design.nodeId];
    if (node === undefined) {
      throw new Error("fixture node missing");
    }
    const area = dieAreaBreakdown(design, data, tuning);

    const tileArea = node.transistorsPerTile / node.densityTrPerMm2;
    const tileSize = Math.sqrt(tileArea);
    const coreW = design.dieW * tileSize;
    const coreH = design.dieH * tileSize;
    const padRing = 2 * (coreW + coreH) * tuning.design.padDepthMm;
    const outerW = coreW + 2 * tuning.design.padDepthMm;
    const outerH = coreH + 2 * tuning.design.padDepthMm;
    const scribe = 2 * (outerW + outerH) * tuning.design.scribeWidthMm;

    expect(area.tileAreaMm2).toBeCloseTo(tileArea, 12);
    expect(area.tileSizeMm).toBeCloseTo(tileSize, 12);
    expect(area.coreAreaMm2).toBeCloseTo(design.dieW * design.dieH * tileArea, 12);
    expect(area.padRingAreaMm2).toBeCloseTo(padRing, 12);
    expect(area.scribeAreaMm2).toBeCloseTo(scribe, 12);
    expect(area.totalAreaMm2).toBeCloseTo(area.coreAreaMm2 + padRing + scribe, 12);
  });

  it("counts I/O pins against both package and perimeter limits", () => {
    let design = place(emptyDesign(), "io-pads", 5, 0, {
      config: { dataPins: 4, addressPins: 0, controlPins: 2 },
    });
    const normal = pinUsage(design, data, tuning);
    expect(normal.pinsNeeded).toBe(4 + 0 + 2 + tuning.design.powerGroundPins);
    expect(normal.packageLimit).toBe(40);
    expect(normal.capacity).toBeLessThanOrEqual(normal.packageLimit);
    expect(normal.overflow).toBe(0);

    design = emptyDesign();
    design = run(design, { type: "resizeDie", dieW: 40, dieH: 40 });
    design = place(design, "io-pads", 29, 19, {
      config: { dataPins: 64, addressPins: 32, controlPins: 16 },
    });
    const overloaded = pinUsage(design, data, tuning);
    expect(overloaded.pinsNeeded).toBe(64 + 32 + 16 + tuning.design.powerGroundPins);
    expect(overloaded.overflow).toBeGreaterThan(0);
  });
});
