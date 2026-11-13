import { describe, expect, it } from "vitest";

import evaluateSource from "../../src/data/formula/evaluate.ts?raw";
import indexSource from "../../src/data/formula/index.ts?raw";
import parseSource from "../../src/data/formula/parse.ts?raw";
import tokenizeSource from "../../src/data/formula/tokenize.ts?raw";
import { getGameData, getTuning, initGameData } from "../../src/data/gameData";
import {
  BUNDLED_RAW_GAME_DATA,
  DataValidationError,
  buildGameData,
  loadGameData,
  type RawGameData,
} from "../../src/data/load";
import { mutableRawData } from "./helpers";

function expectIssues(raw: RawGameData, pattern: RegExp): void {
  try {
    buildGameData(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(DataValidationError);
    if (error instanceof DataValidationError) {
      expect(error.issues.join("\n")).toMatch(pattern);
      expect(error.message).toContain("failed validation");
    }
    return;
  }
  throw new Error("Expected buildGameData to reject the corrupted data");
}

describe("bundled data validation", () => {
  it("loads every Phase 1 file without an error", () => {
    const data = loadGameData();
    expect(data.nodes).toHaveLength(9);
    expect(data.blocks).toHaveLength(17);
    expect(data.packages).toHaveLength(4);
    expect(data.isas).toHaveLength(4);
    expect(data.customInstructions).toHaveLength(11);
    expect(data.workloads).toHaveLength(10);
    expect(data.timingPaths).toHaveLength(6);
    expect(data.designPresets).toHaveLength(4);
  });

  it("indexes every record by id", () => {
    const data = loadGameData();
    for (const node of data.nodes) {
      expect(data.nodeById[node.id]).toBe(node);
    }
    for (const block of data.blocks) {
      expect(data.blockById[block.id]).toBe(block);
    }
    for (const instruction of data.customInstructions) {
      expect(data.customInstructionById[instruction.id]).toBe(instruction);
      expect(data.patternById[instruction.patternId]).toBe(instruction);
    }
  });

  it("initializes once and exposes the same tuning object", () => {
    const first = initGameData();
    const second = getGameData();
    expect(second).toBe(first);
    expect(getTuning()).toBe(first.tuning);
  });

  it("has no duplicate ids", () => {
    const data = loadGameData();
    expect(new Set(data.nodes.map((node) => node.id)).size).toBe(data.nodes.length);
    expect(new Set(data.blocks.map((block) => block.id)).size).toBe(data.blocks.length);
    expect(new Set(data.packages.map((pkg) => pkg.id)).size).toBe(data.packages.length);
    expect(new Set(data.isas.map((isa) => isa.id)).size).toBe(data.isas.length);
    expect(new Set(data.workloads.map((workload) => workload.id)).size).toBe(
      data.workloads.length,
    );
  });

  it("reports a duplicate id with the file and id", () => {
    const raw = mutableRawData(loadGameData());
    const duplicate = raw.nodes[1];
    if (duplicate === undefined) {
      throw new Error("fixture is missing the second node");
    }
    duplicate.id = raw.nodes[0]?.id ?? "missing";
    expectIssues(raw, /nodes\.json: duplicate id/);
  });

  it("reports an unknown ISA default extension", () => {
    const raw = mutableRawData(loadGameData());
    const isa = raw.isas[0];
    if (isa === undefined) {
      throw new Error("fixture is missing the first ISA");
    }
    isa.defaultExtensions = ["warp-drive"];
    expectIssues(raw, /isas\.json: .*unknown extension "warp-drive"/);
  });

  it("reports an ISA default outside the tuning ranges", () => {
    const raw = mutableRawData(loadGameData());
    const isa = raw.isas[0];
    if (isa === undefined) {
      throw new Error("fixture is missing the first ISA");
    }
    isa.defaultWordBits = 6;
    expectIssues(raw, /isas\.json: .*defaultWordBits/);
  });

  it("reports a schema error with file and dot path", () => {
    const raw = mutableRawData(loadGameData());
    const node = raw.nodes[0];
    if (node === undefined) {
      throw new Error("fixture is missing the first node");
    }
    node.vddNominal = 99;
    expectIssues(raw, /nodes\.json: (0|nodes\.0)\.vddNominal: vddNominal must lie inside vddRange/);
  });

  it("reports an unknown design-preset node", () => {
    const raw = mutableRawData(loadGameData());
    const preset = raw.designPresets[0];
    if (preset === undefined) {
      throw new Error("fixture is missing the first design preset");
    }
    preset.nodeId = "does-not-exist";
    expectIssues(raw, /designPresets\.json: .*unknown node "does-not-exist"/);
  });

  it("reports an unknown design-preset block", () => {
    const raw = mutableRawData(loadGameData());
    const preset = raw.designPresets[0];
    const block = preset?.blocks[0];
    if (preset === undefined || block === undefined) {
      throw new Error("fixture is missing a preset block");
    }
    block.typeId = "does-not-exist";
    expectIssues(raw, /designPresets\.json: .*unknown block type "does-not-exist"/);
  });

  it("reports an invalid design-preset config value", () => {
    const raw = mutableRawData(loadGameData());
    const preset = raw.designPresets[0];
    const block = preset?.blocks.find((candidate) => candidate.typeId === "alu");
    if (preset === undefined || block === undefined) {
      throw new Error("fixture is missing the preset ALU");
    }
    block.config = { width: 99 };
    expectIssues(raw, /designPresets\.json: .*alu\.width/);
  });

  it("reports an unknown design-preset aspect ratio", () => {
    const raw = mutableRawData(loadGameData());
    const preset = raw.designPresets[0];
    const block = preset?.blocks[0];
    if (preset === undefined || block === undefined) {
      throw new Error("fixture is missing a preset block");
    }
    block.aspectRatio = 3;
    expectIssues(raw, /designPresets\.json: .*unknown aspect ratio 3/);
  });

  it("reports an unknown required-link target", () => {
    const raw = mutableRawData(loadGameData());
    const block = raw.blocks.find((record) => record.id === "alu");
    if (block === undefined) {
      throw new Error("fixture is missing the ALU");
    }
    const firstLink = block.requiredLinks[0];
    if (firstLink === undefined) {
      throw new Error("fixture is missing the ALU's first link");
    }
    block.requiredLinks[0] = { ...firstLink, to: "does-not-exist" };
    expectIssues(raw, /blocks\.json: alu\.requiredLinks: unknown target block "does-not-exist"/);
  });

  it("rejects a malformed formula at load time", () => {
    const raw = mutableRawData(loadGameData());
    const block = raw.blocks.find((record) => record.id === "alu");
    if (block === undefined) {
      throw new Error("fixture is missing the ALU");
    }
    block.transistors = "180 + * width";
    expectIssues(raw, /blocks\.json: alu\.transistors: invalid formula/);
  });

  it("rejects a formula that evaluates to a negative result", () => {
    const raw = mutableRawData(loadGameData());
    const block = raw.blocks.find((record) => record.id === "program-counter");
    if (block === undefined) {
      throw new Error("fixture is missing the program counter");
    }
    block.transistors = "0 - addressWidth";
    expectIssues(raw, /program-counter\.transistors: formula .* evaluated to -16/);
  });

  it("rejects an unknown workload pattern", () => {
    const raw = mutableRawData(loadGameData());
    const workload = raw.workloads[0];
    if (workload === undefined) {
      throw new Error("fixture is missing the first workload");
    }
    workload.patterns["no-such-pattern"] = 0.5;
    expectIssues(raw, /workloads\.json: calculator-math\.patterns: unknown patternId/);
  });

  it("rejects an unknown block type in a timing path", () => {
    const raw = mutableRawData(loadGameData());
    const path = raw.timingPaths[0];
    if (path === undefined) {
      throw new Error("fixture is missing the first timing path");
    }
    path.stages[0] = { blockTypes: ["no-such-block"] };
    expectIssues(raw, /timingPaths\.json: execute-loop\.stages: unknown block type/);
  });

  it("rejects a timing path link leg without a critical required link", () => {
    const raw = mutableRawData(loadGameData());
    const path = raw.timingPaths.find((entry) => entry.id === "execute-loop");
    if (path === undefined) {
      throw new Error("fixture is missing the execute-loop timing path");
    }
    path.stages[0] = { blockTypes: ["shifter"] };
    expectIssues(raw, /timingPaths\.json: execute-loop\.legs\[0\]: no critical link/);
  });

  it("rejects a timing path with the wrong number of legs", () => {
    const raw = mutableRawData(loadGameData());
    const path = raw.timingPaths[0];
    if (path === undefined) {
      throw new Error("fixture is missing the first timing path");
    }
    path.legs = [];
    expectIssues(
      raw,
      /timingPaths\.json: (0|timingPaths\.0)\.legs: legs must have exactly one entry/,
    );
  });

  it("rejects a timing-path template with a duplicate id", () => {
    const raw = mutableRawData(loadGameData());
    const second = raw.timingPaths[1];
    if (second === undefined) {
      throw new Error("fixture is missing the second timing path");
    }
    second.id = raw.timingPaths[0]?.id ?? "missing";
    expectIssues(raw, /timingPaths\.json: duplicate id/);
  });

  it("rejects an unknown reference workload", () => {
    const raw = mutableRawData(loadGameData());
    raw.tuning.power.referenceWorkloadId = "no-such-workload";
    expectIssues(raw, /tuning\.json: power\.referenceWorkloadId: unknown workload/);
  });

  it("rejects a missing timing-path file", () => {
    const raw: RawGameData = { ...BUNDLED_RAW_GAME_DATA, timingPaths: [] };
    expectIssues(raw, /timingPaths\.json: must contain at least one record/);
  });

  it("aggregates several errors into one report", () => {
    const raw = mutableRawData(loadGameData());
    const block = raw.blocks.find((record) => record.id === "alu");
    const workload = raw.workloads[0];
    if (block === undefined || workload === undefined) {
      throw new Error("fixture is incomplete");
    }
    block.transistors = "width +";
    workload.patterns["no-such-pattern"] = 0.5;
    expectIssues(raw, /blocks\.json:[^\n]*\n[\s\S]*workloads\.json:/);
  });

  it("rejects a missing data file", () => {
    const raw: RawGameData = { ...BUNDLED_RAW_GAME_DATA, workloads: [] };
    expectIssues(raw, /workloads\.json: must contain at least one record/);
  });

  it("does not use eval or the Function constructor", () => {
    const sources = [tokenizeSource, parseSource, evaluateSource, indexSource];
    for (const source of sources) {
      expect(source).not.toMatch(/\beval\s*\(/);
      expect(source).not.toMatch(/\bnew\s+Function\s*\(/);
      expect(source).not.toMatch(/\bFunction\s*\(/);
    }
  });
});
