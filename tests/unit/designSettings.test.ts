import { describe, expect, it } from "vitest";

import { analyzePhysical } from "../../src/sim/design/physical";
import type { ChipDesign } from "../../src/sim/design/types";
import { createDefaultSettings } from "../../src/sim/isa/defaults";
import { data, emptyDesign, place, run, tuning } from "../design/helpers";

function basicDesign(): ChipDesign {
  let design = run(emptyDesign(1971), { type: "resizeDie", dieW: 30, dieH: 30 });
  design = place(design, "register-file", 10, 10);
  design = place(design, "alu", 14, 10);
  return design;
}

describe("design settings (Section 7.6 Phase 1)", () => {
  it("gives a new design the node's nominal voltage and tuning defaults", () => {
    const design = emptyDesign(1971);
    const node = data.nodeById[design.nodeId];
    if (node === undefined) {
      throw new Error("fixture node missing");
    }
    expect(design.settings).toEqual(createDefaultSettings(node, tuning));
    expect(design.settings.vdd).toBe(node.vddNominal);
    expect(design.settings.targetClockMHz).toBe(tuning.isa.defaultTargetClockMHz);
    expect(design.settings.pipelineStages).toBe(tuning.physical.defaultPipelineStages);
    expect(design.customInstructions).toEqual([]);
  });

  it("reports the target clock against the achievable clock", () => {
    const design = basicDesign();
    const analysis = analyzePhysical(design, data, tuning, {
      voltageV: design.settings.vdd,
      pipelineStages: design.settings.pipelineStages,
      cooling: design.settings.cooling,
    });
    expect(analysis.timing.fMaxMHz).toBeGreaterThan(0);
    const target = run(design, {
      type: "setDesignSettings",
      settings: { ...design.settings, targetClockMHz: analysis.timing.fMaxMHz * 2 },
    });
    expect(target.settings.targetClockMHz).toBeGreaterThan(analysis.timing.fMaxMHz);
  });

  it("deeper pipelines raise fMax", () => {
    const design = basicDesign();
    const shallow = analyzePhysical(design, data, tuning, { pipelineStages: 1 });
    const deep = analyzePhysical(design, data, tuning, { pipelineStages: 3 });
    expect(shallow.timing.fMaxMHz).toBeGreaterThan(0);
    expect(deep.timing.fMaxMHz).toBeGreaterThan(shallow.timing.fMaxMHz);
  });

  it("a higher supply voltage raises fMax inside the node range", () => {
    const design = basicDesign();
    const node = data.nodeById[design.nodeId];
    if (node === undefined) {
      throw new Error("fixture node missing");
    }
    const low = analyzePhysical(design, data, tuning, { voltageV: node.vddRange[0] });
    const high = analyzePhysical(design, data, tuning, { voltageV: node.vddRange[1] });
    expect(high.timing.fMaxMHz).toBeGreaterThan(low.timing.fMaxMHz);
  });

  it("a heatsink lowers the hotspot", () => {
    const design = basicDesign();
    const none = analyzePhysical(design, data, tuning, { cooling: "none" });
    const heatsink = analyzePhysical(design, data, tuning, { cooling: "heatsink" });
    expect(none.thermal.hotspotC).toBeGreaterThan(tuning.physical.ambientTempC);
    expect(heatsink.thermal.hotspotC).toBeLessThan(none.thermal.hotspotC);
  });

  it("keeps settings through node/package edits and undoable commands", () => {
    const design = basicDesign();
    const changed = run(design, {
      type: "setDesignSettings",
      settings: {
        ...design.settings,
        pipelineStages: 4,
        control: "hardwired",
        spareRows: true,
        busMultiplexed: false,
        prefetchQueueBytes: 8,
      },
    });
    expect(changed.settings.pipelineStages).toBe(4);
    expect(changed.settings.control).toBe("hardwired");
    expect(changed.settings.spareRows).toBe(true);
    expect(changed.settings.busMultiplexed).toBe(false);
    expect(changed.settings.prefetchQueueBytes).toBe(8);

    const repackaged = run(changed, { type: "setPackage", packageId: "plastic-dip" });
    expect(repackaged.settings).toEqual(changed.settings);
    expect(repackaged.isa).toEqual(changed.isa);
  });
});
