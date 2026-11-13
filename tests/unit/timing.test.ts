import { describe, expect, it } from "vitest";

import { analyzeCongestion } from "../../src/sim/design/congestion";
import { generateLinks } from "../../src/sim/design/links";
import { analyzeTiming } from "../../src/sim/design/timing";
import type { ChipDesign } from "../../src/sim/design/types";
import { data, emptyDesign, place, run, tuning } from "../design/helpers";

const GATE_DELAY_PS = data.nodeById["10um-pmos"]?.gateDelayPs ?? 0;

function analyze(design: ChipDesign, options = {}) {
  const links = generateLinks(design, data);
  const congestion = analyzeCongestion(design, links, data, tuning);
  return analyzeTiming(design, links, congestion, data, tuning, options);
}

function rfAluDesign(): ChipDesign {
  let design = place(emptyDesign(), "register-file", 0, 0);
  design = place(design, "alu", 4, 0);
  return design;
}

describe("timing paths and fMax", () => {
  it("builds the execute loop and applies logic, wire, latch and skew delays", () => {
    const timing = analyze(rfAluDesign());
    expect(timing.paths).toHaveLength(1);
    const path = timing.limitingPath;
    expect(path).not.toBeNull();
    if (path === null) {
      return;
    }
    expect(path.templateId).toBe("execute-loop");
    expect(path.stages.map((stage) => stage.typeId)).toEqual([
      "register-file",
      "alu",
      "register-file",
    ]);
    expect(path.logicDelayPs).toBeCloseTo((9 + 20 + 9) * GATE_DELAY_PS);
    expect(path.legs).toHaveLength(2);
    expect(path.legs[0]?.lengthMm).toBeGreaterThan(0);
    expect(path.stageDelayPs).toBeCloseTo(path.pathDelayPs + 3 * GATE_DELAY_PS);
    expect(timing.skewPenaltyPs).toBeGreaterThan(0);
    expect(timing.fMaxMHz).toBeCloseTo(1e6 / (path.stageDelayPs + timing.skewPenaltyPs));
    expect(timing.clockSource.kind).toBe("die-center");
    expect(timing.why.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
  });

  it("lowers fMax when the ALU is moved far from the register file", () => {
    let near = run(emptyDesign(), { type: "resizeDie", dieW: 30, dieH: 30 });
    near = place(near, "register-file", 2, 2);
    near = place(near, "alu", 6, 2);
    let far = run(emptyDesign(), { type: "resizeDie", dieW: 30, dieH: 30 });
    far = place(far, "register-file", 2, 2);
    far = place(far, "alu", 20, 20);
    const nearTiming = analyze(near);
    const farTiming = analyze(far);
    expect(nearTiming.fMaxMHz).toBeGreaterThan(farTiming.fMaxMHz);
    expect(farTiming.limitingPath?.wireDelayPs ?? 0).toBeGreaterThan(
      nearTiming.limitingPath?.wireDelayPs ?? 0,
    );
  });

  it("removes a pipelined critical link from the cycle and adds latency", () => {
    const design = rfAluDesign();
    const link = generateLinks(design, data).find(
      (candidate) =>
        candidate.fromTypeId === "register-file" && candidate.toTypeId === "alu",
    );
    if (link === undefined) {
      throw new Error("fixture must contain a register-file -> ALU link");
    }
    const pipelined = { ...design, pipelinedLinks: [link.id] };
    const base = analyze(design);
    const result = analyze(pipelined);
    expect(result.fMaxMHz).toBeGreaterThan(base.fMaxMHz);
    expect(result.limitingPath?.legs[0]?.pipelined).toBe(true);
    expect(result.limitingPath?.legs[0]?.countedDelayPs).toBe(0);
    expect(result.limitingPath?.latencyCycles).toBe(2);
  });

  it("slows down at lower supply voltage and speeds up with pipeline stages", () => {
    const design = rfAluDesign();
    const nominal = analyze(design);
    const lowVoltage = analyze(design, { voltageV: 13 });
    const pipelined = analyze(design, { pipelineStages: 2 });
    expect(lowVoltage.voltageFactor).toBeGreaterThan(1);
    expect(lowVoltage.fMaxMHz).toBeLessThan(nominal.fMaxMHz);
    expect(pipelined.fMaxMHz).toBeGreaterThan(nominal.fMaxMHz);
    const path = pipelined.limitingPath;
    if (path === null) {
      throw new Error("expected a limiting path");
    }
    expect(path.stageDelayPs).toBeCloseTo(path.pathDelayPs / 2 + 3 * GATE_DELAY_PS);
    expect(pipelined.why.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
  });

  it("uses an edge clock generator as the skew source", () => {
    let design = run(emptyDesign(), { type: "resizeDie", dieW: 20, dieH: 20 });
    design = place(design, "register-file", 8, 8);
    design = place(design, "alu", 12, 8);
    const centered = analyze(design);
    const withClock = place(design, "clock-generator", 0, 0);
    const clocked = analyze(withClock);
    expect(clocked.clockSource.kind).toBe("clock-generator");
    expect(clocked.skewPenaltyPs).toBeGreaterThan(centered.skewPenaltyPs);
    expect(clocked.fMaxMHz).toBeLessThan(centered.fMaxMHz);
  });

  it("supports implicit wire legs with no required link", () => {
    let design = place(emptyDesign(), "program-counter", 0, 0);
    design = place(design, "decoder-hardwired", 4, 0);
    const timing = analyze(design);
    const path = timing.paths.find((candidate) => candidate.templateId === "fetch-decode");
    expect(path).toBeDefined();
    expect(path?.legs[0]).toMatchObject({ kind: "wire", linkId: null });
    expect(path?.wireDelayPs).toBeGreaterThan(0);
  });

  it("returns zero fMax when the die is empty", () => {
    const timing = analyze(emptyDesign());
    expect(timing.paths).toEqual([]);
    expect(timing.limitingPath).toBeNull();
    expect(timing.fMaxMHz).toBe(0);
    expect(timing.why).toEqual([]);
  });
});
