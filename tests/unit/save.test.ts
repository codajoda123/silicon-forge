import { describe, expect, it } from "vitest";

import { applyCommands } from "../../src/sim/core/commands";
import { SaveError, deserializeSave, serializeSave } from "../../src/sim/core/save";
import { createNewGame, SAVE_VERSION, getActiveDesign, type GameState } from "../../src/sim/core/state";
import { step } from "../../src/sim/core/step";

function sampleState(): GameState {
  const base = createNewGame({ seed: 99, startYear: 1971, companyName: "Vector Dynamics" });
  return step(base, [{ type: "setCompanyName", name: "Vector Micro" }]).state;
}

function rawSave(state: GameState): Record<string, unknown> {
  return JSON.parse(serializeSave(state)) as Record<string, unknown>;
}

describe("save format", () => {
  it("round-trips a state identically", () => {
    const state = sampleState();
    const restored = deserializeSave(serializeSave(state));

    expect(restored).toEqual(state);
    expect(restored.week).toBe(state.week);
    expect(restored.rng).toEqual(state.rng);
    expect(restored.log).toEqual(state.log);
  });

  it("restores a readable company and clock", () => {
    const restored = deserializeSave(serializeSave(sampleState()));
    expect(restored.settings.companyName).toBe("Vector Micro");
    expect(restored.companies[0]?.name).toBe("Vector Micro");
  });

  it("round-trips floorplan edits", () => {
    const base = sampleState();
    const design = getActiveDesign(base);
    const edited = applyCommands(base, [
      {
        type: "editDesign",
        designId: design.id,
        command: {
          type: "placeBlock",
          blockTypeId: "program-counter",
          x: 0,
          y: 0,
          config: { addressWidth: 4 },
        },
      },
    ]).state;
    const restored = deserializeSave(serializeSave(edited));
    expect(restored).toEqual(edited);
    expect(getActiveDesign(restored).blocks).toHaveLength(1);
  });

  it("round-trips ISA parameters, settings and custom instructions", () => {
    const base = sampleState();
    const design = getActiveDesign(base);
    const edited = applyCommands(base, [
      {
        type: "editDesign",
        designId: design.id,
        command: {
          type: "setIsa",
          isa: { ...design.isa, wordBits: 8, registers: 8, extensions: ["bcd", "multiply"] },
        },
      },
      {
        type: "editDesign",
        designId: design.id,
        command: {
          type: "setDesignSettings",
          settings: { ...design.settings, pipelineStages: 3, cooling: "heatsink" },
        },
      },
      {
        type: "editDesign",
        designId: design.id,
        command: { type: "setCustomInstructions", ids: ["ci-block-move"] },
      },
    ]).state;
    const restored = deserializeSave(serializeSave(edited));
    expect(getActiveDesign(restored).isa).toEqual(getActiveDesign(edited).isa);
    expect(getActiveDesign(restored).settings).toEqual(getActiveDesign(edited).settings);
    expect(getActiveDesign(restored).customInstructions).toEqual(["ci-block-move"]);
    expect(restored).toEqual(edited);
  });

  it("migrates a version 2 save by filling in ISA and settings", () => {
    const raw = rawSave(sampleState());
    raw.version = 2;
    const designs = raw.designs as Array<Record<string, unknown>>;
    const first = designs[0];
    if (first === undefined) {
      throw new Error("fixture design missing");
    }
    delete first.isa;
    delete first.settings;
    delete first.customInstructions;

    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.version).toBe(SAVE_VERSION);
    const design = getActiveDesign(migrated);
    expect(design.isa.archetypeId).toBe("accumulator-cisc");
    expect(design.settings.vdd).toBeGreaterThan(0);
    expect(design.customInstructions).toEqual([]);
  });

  it("migrates a version 1 save by adding a starting design", () => {
    const raw = rawSave(sampleState());
    delete raw.designs;
    delete raw.activeDesignId;
    raw.version = 1;

    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.designs).toHaveLength(1);
    expect(migrated.activeDesignId).toBe(migrated.designs[0]?.id);
    expect(migrated.designs[0]?.blocks).toHaveLength(0);
    expect(migrated.settings.startYear).toBe(1971);
  });

  it("rejects a save with an unknown ISA archetype", () => {
    const raw = rawSave(sampleState());
    const designs = raw.designs as Array<Record<string, unknown>>;
    const first = designs[0];
    if (first === undefined) {
      throw new Error("fixture design missing");
    }
    const isa = first.isa as Record<string, unknown>;
    isa.archetypeId = "unknown-isa";
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/unknown ISA archetype/);
  });

  it("rejects a save that references unknown design data", () => {
    const raw = rawSave(sampleState());
    const designs = raw.designs as Array<Record<string, unknown>>;
    const first = designs[0];
    if (first === undefined) {
      throw new Error("fixture design missing");
    }
    first.nodeId = "unknown-node";
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/unknown process node/);
  });

  it("rejects invalid JSON with a SaveError", () => {
    expect(() => deserializeSave("{not json")).toThrow(SaveError);
    expect(() => deserializeSave("{not json")).toThrow(/not valid JSON/);
  });

  it("rejects a missing version field", () => {
    expect(() => deserializeSave("{}")).toThrow(/version/);
  });

  it("rejects an unsupported version", () => {
    const raw = { ...rawSave(sampleState()), version: 999 };
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/Unsupported save version 999/);
  });

  it("rejects a corrupt state shape", () => {
    const missingCompanies = rawSave(sampleState());
    delete missingCompanies.companies;
    expect(() => deserializeSave(JSON.stringify(missingCompanies))).toThrow(/corrupt/);

    const badRng = rawSave(sampleState());
    badRng.rng = { seed: 1, streams: { world: "not-a-number" } };
    expect(() => deserializeSave(JSON.stringify(badRng))).toThrow(/corrupt/);
  });
});
