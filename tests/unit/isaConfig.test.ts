import { describe, expect, it } from "vitest";

import { applyDesignCommand } from "../../src/sim/design/commands";
import type { ChipDesign } from "../../src/sim/design/types";
import { isaConfigFromArchetype, createDefaultIsaConfig } from "../../src/sim/isa/defaults";
import { normalizeIsaConfig } from "../../src/sim/isa/params";
import { data, emptyDesign, run, tuning } from "../design/helpers";

function withIsa(design: ChipDesign, patch: Partial<ChipDesign["isa"]>): ChipDesign {
  return run(design, { type: "setIsa", isa: { ...design.isa, ...patch } });
}

describe("ISA archetypes and parameters", () => {
  it("starts from the newest archetype the year knows", () => {
    expect(createDefaultIsaConfig(1971, data).archetypeId).toBe("accumulator-cisc");
    expect(createDefaultIsaConfig(1978, data).archetypeId).toBe("register-memory-cisc");
    expect(createDefaultIsaConfig(1982, data).archetypeId).toBe("load-store-risc");
  });

  it("resets every parameter to the archetype's defaults", () => {
    const config = isaConfigFromArchetype("load-store-risc", data);
    expect(config).toMatchObject({
      archetypeId: "load-store-risc",
      wordBits: 32,
      registers: 32,
      addressBits: 32,
      fixedLength: true,
      extensions: ["multiply", "divide"],
    });
  });

  it("rejects out-of-range or unknown parameters with a readable error", () => {
    const base = emptyDesign(1971);
    const cases: Array<[Partial<ChipDesign["isa"]>, RegExp]> = [
      [{ archetypeId: "nope" }, /Unknown ISA archetype/],
      [{ wordBits: 6 }, /Datapath width/],
      [{ registers: 3 }, /Register count/],
      [{ addressBits: 4 }, /Address width/],
      [{ addressingModes: 0 }, /Addressing modes/],
      [{ extensions: ["nope"] }, /Unknown ISA extension/],
      [{ extensions: ["bcd", "bcd"] }, /Duplicate ISA extension/],
    ];
    for (const [patch, pattern] of cases) {
      const result = applyDesignCommand(
        base,
        { type: "setIsa", isa: { ...base.isa, ...patch } },
        data,
      );
      expect(result.error).toMatch(pattern);
      expect(result.changed).toBe(false);
      expect(result.design).toBe(base);
    }
  });

  it("normalises extension order to the tuning catalog", () => {
    const base = emptyDesign(1971);
    const result = normalizeIsaConfig(
      { ...base.isa, extensions: ["floating-point", "bcd", "multiply"] },
      data,
      tuning,
    );
    expect(result.error).toBeNull();
    expect(result.value.extensions).toEqual(["multiply", "bcd", "floating-point"]);
  });

  it("changes the stored ISA and is idempotent", () => {
    let design = withIsa(emptyDesign(1971), { wordBits: 8, registers: 8 });
    expect(design.isa.wordBits).toBe(8);
    const again = run(design, { type: "setIsa", isa: design.isa });
    expect(again).toBe(design);

    design = run(design, { type: "setIsaArchetype", archetypeId: "load-store-risc" });
    expect(design.isa.archetypeId).toBe("load-store-risc");
    expect(design.isa.wordBits).toBe(32);
  });

  it("adds custom instructions in order and rejects duplicates/unknown ids", () => {
    const base = emptyDesign(1971);
    let design = run(base, {
      type: "setCustomInstructions",
      ids: ["ci-bcd-add-adjust", "ci-block-move"],
    });
    expect(design.customInstructions).toEqual(["ci-bcd-add-adjust", "ci-block-move"]);

    const duplicate = applyDesignCommand(
      design,
      {
        type: "setCustomInstructions",
        ids: ["ci-bcd-add-adjust", "ci-bcd-add-adjust"],
      },
      data,
    );
    expect(duplicate.error).toMatch(/Duplicate custom instruction/);
    expect(duplicate.design).toBe(design);

    const unknown = applyDesignCommand(
      design,
      { type: "setCustomInstructions", ids: ["ci-nope"] },
      data,
    );
    expect(unknown.error).toMatch(/Unknown custom instruction/);
    expect(unknown.design).toBe(design);
  });

  it("validates design settings against the process node", () => {
    const base = emptyDesign(1971);
    const valid = run(base, {
      type: "setDesignSettings",
      settings: {
        ...base.settings,
        targetClockMHz: 2,
        pipelineStages: 3,
        control: "hardwired",
        cooling: "heatsink",
      },
    });
    expect(valid.settings.pipelineStages).toBe(3);
    expect(valid.settings.cooling).toBe("heatsink");

    const cases: Array<[Partial<ChipDesign["settings"]>, RegExp]> = [
      [{ targetClockMHz: 0 }, /Target clock/],
      [{ vdd: 99 }, /Supply voltage/],
      [{ pipelineStages: 9 }, /Pipeline stages/],
      [{ cooling: "liquid-nitrogen" }, /Unknown cooling/],
      [{ testStrategy: "vibes" }, /Unknown test strategy/],
      [{ prefetchQueueBytes: -1 }, /Prefetch queue/],
    ];
    for (const [patch, pattern] of cases) {
      const result = applyDesignCommand(
        valid,
        { type: "setDesignSettings", settings: { ...valid.settings, ...patch } },
        data,
      );
      expect(result.error).toMatch(pattern);
      expect(result.changed).toBe(false);
      expect(result.design).toBe(valid);
    }
  });

  it("clamps Vdd into the new node's range when the process changes", () => {
    const base = emptyDesign(1971);
    const oldNode = data.nodeById[base.nodeId];
    if (oldNode === undefined) {
      throw new Error("fixture node missing");
    }
    const raised = run(base, {
      type: "setDesignSettings",
      settings: { ...base.settings, vdd: oldNode.vddRange[1] },
    });
    const switched = run(raised, { type: "setNode", nodeId: "3um-hmos" });
    const nextNode = data.nodeById["3um-hmos"];
    expect(nextNode).toBeDefined();
    if (nextNode === undefined) {
      return;
    }
    expect(switched.settings.vdd).toBeGreaterThanOrEqual(nextNode.vddRange[0]);
    expect(switched.settings.vdd).toBeLessThanOrEqual(nextNode.vddRange[1]);
  });
});
