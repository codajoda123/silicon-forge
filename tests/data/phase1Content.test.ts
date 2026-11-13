import { describe, expect, it } from "vitest";

import { loadGameData } from "../../src/data/load";
import { compileFormula } from "../../src/data/formula";
import { OP_CLASSES } from "../../src/data/schemas";

const data = loadGameData();

function defaultVariables(configSchema: Record<string, { default: number | string | boolean }>): Record<string, number | string | boolean> {
  const values: Record<string, number | string | boolean> = {};
  for (const [name, option] of Object.entries(configSchema)) {
    values[name] = option.default;
  }
  return values;
}

describe("Phase 1 content", () => {
  it("covers the nine node rows from Section 6.3 in chronological order", () => {
    expect(data.nodes.map((node) => node.historicalYear)).toEqual([
      1971, 1972, 1974, 1976, 1978, 1980, 1982, 1986, 1989,
    ]);
    expect(data.nodes.map((node) => node.featureNm)).toEqual([
      10, 8, 6, 4, 3, 2, 1.5, 1, 0.8,
    ]);
    expect(data.nodes[0]?.family).toBe("PMOS");
    expect(data.nodes[8]?.family).toBe("CMOS");
  });

  it("keeps effective density and tile size consistent", () => {
    for (const node of data.nodes) {
      const tileArea = node.transistorsPerTile / node.densityTrPerMm2;
      expect(tileArea).toBeGreaterThan(0);
      expect(tileArea).toBeLessThan(0.5);
      expect(node.vddRange[0]).toBeLessThanOrEqual(node.vddNominal);
      expect(node.vddNominal).toBeLessThanOrEqual(node.vddRange[1]);
    }
  });

  it("contains the complete Phase 1 block catalog", () => {
    expect(data.blocks.map((block) => block.id).sort()).toEqual(
      [
        "program-counter",
        "bus-interface",
        "decoder-hardwired",
        "decoder-microcoded",
        "register-file",
        "alu",
        "shifter",
        "multiplier",
        "divider",
        "fpu",
        "mmu",
        "instruction-cache",
        "data-cache",
        "interrupt-timer",
        "clock-generator",
        "io-pads",
        "custom-unit",
      ].sort(),
    );
  });

  it("evaluates every block formula for its default configuration", () => {
    for (const block of data.blocks) {
      const variables = defaultVariables(block.configSchema);
      const transistors = compileFormula(block.transistors).evaluateNumber(variables);
      const logicDepth = compileFormula(block.logicDepth).evaluateNumber(variables);
      expect(Number.isFinite(transistors)).toBe(true);
      expect(transistors).toBeGreaterThanOrEqual(0);
      expect(transistors).toBeLessThan(2_000_000);
      expect(logicDepth).toBeGreaterThan(0);
      expect(logicDepth).toBeLessThan(200);
      for (const link of block.requiredLinks) {
        expect(compileFormula(link.widthBits).evaluateNumber(variables)).toBeGreaterThan(0);
      }
    }
  });

  it("ships four complete processor presets", () => {
    expect(data.designPresets.map((preset) => preset.id)).toEqual([
      "calculator-1971",
      "consumer-8bit-1974",
      "processor-16bit-1978",
      "cpu-32bit-1985",
    ]);
    for (const preset of data.designPresets) {
      expect(preset.blocks.length).toBeGreaterThanOrEqual(6);
      expect(data.nodeById[preset.nodeId]).toBeDefined();
      expect(data.packageById[preset.packageId]).toBeDefined();
      for (const block of preset.blocks) {
        expect(data.blockById[block.typeId]).toBeDefined();
      }
    }
  });

  it("marks pads and the bus interface as edge-only", () => {
    expect(data.blockById["io-pads"]?.edgeOnly).toBe(true);
    expect(data.blockById["bus-interface"]?.edgeOnly).toBe(true);
  });

  it("marks cache blocks as repairable memory arrays", () => {
    for (const id of ["instruction-cache", "data-cache"]) {
      const block = data.blockById[id];
      expect(block?.isMemoryArray).toBe(true);
      expect(block?.repairable).toBe(true);
    }
  });

  it("has four Phase 1 packages with increasing pin counts", () => {
    expect(data.packages.map((pkg) => pkg.id)).toEqual([
      "ceramic-dip",
      "plastic-dip",
      "plcc",
      "pga",
    ]);
    expect(data.packages.map((pkg) => pkg.maxPins)).toEqual([40, 40, 84, 168]);
    for (const pkg of data.packages) {
      expect(pkg.maxJunctionTempC).toBeGreaterThan(0);
      expect(pkg.gVerticalWPerC).toBeGreaterThan(0);
      expect(pkg.costPerUnit).toBeGreaterThanOrEqual(0);
    }
  });

  it("defines the Phase 1 timing-path templates", () => {
    expect(data.timingPaths.map((path) => path.id)).toEqual([
      "execute-loop",
      "decode-execute",
      "fetch-decode",
      "fetch-bus",
      "microcode-control",
      "bus-pads",
    ]);
    for (const path of data.timingPaths) {
      expect(path.stages.length).toBeGreaterThan(0);
      expect(path.legs).toHaveLength(path.stages.length - 1);
      for (const stage of path.stages) {
        expect(stage.blockTypes.length).toBeGreaterThan(0);
        for (const typeId of stage.blockTypes) {
          expect(data.blockById[typeId]).toBeDefined();
        }
      }
    }
  });

  it("has the four Phase 1 ISA archetypes with every op class costed", () => {
    expect(data.isas.map((isa) => isa.archetype).sort()).toEqual([
      "accumulator-cisc",
      "load-store-risc",
      "register-memory-cisc",
      "stack-machine",
    ]);
    for (const isa of data.isas) {
      for (const opClass of OP_CLASSES) {
        expect(isa.opsToInstr[opClass]).toBeGreaterThan(0);
        expect(isa.microcodeCyclesPerClass[opClass]).toBeGreaterThan(0);
      }
      expect(isa.pipelineFriendliness).toBeGreaterThanOrEqual(0);
      expect(isa.pipelineFriendliness).toBeLessThanOrEqual(1);
      expect(isa.compilerFriendliness).toBeGreaterThanOrEqual(0);
      expect(isa.compilerFriendliness).toBeLessThanOrEqual(1);
      expect([4, 8, 16, 32]).toContain(isa.defaultWordBits);
      expect([2, 4, 8, 16, 32]).toContain(isa.defaultRegisters);
      expect(isa.defaultAddressBits).toBeGreaterThanOrEqual(8);
      expect(isa.defaultAddressingModes).toBeGreaterThanOrEqual(1);
      expect(new Set(isa.defaultExtensions).size).toBe(isa.defaultExtensions.length);
      for (const extensionId of isa.defaultExtensions) {
        expect(data.tuning.isa.extensions.some((extension) => extension.id === extensionId)).toBe(
          true,
        );
      }
    }
  });

  it("gives every custom instruction a unique pattern and plausible cost", () => {
    const patternIds = data.customInstructions.map((instruction) => instruction.patternId);
    expect(new Set(patternIds).size).toBe(patternIds.length);
    for (const instruction of data.customInstructions) {
      expect(instruction.opsReplaced).toBeGreaterThanOrEqual(2);
      expect(instruction.latencyCycles).toBeGreaterThan(0);
      expect(instruction.transistors).toBeGreaterThan(0);
      expect(instruction.opcodeCost).toBeGreaterThan(0);
      expect(instruction.patentRisk).toBeGreaterThanOrEqual(0);
      expect(instruction.patentRisk).toBeLessThanOrEqual(1);
    }
  });

  it("covers the ten built-in Phase 1 workloads", () => {
    expect(data.workloads.map((workload) => workload.id)).toEqual([
      "calculator-math",
      "business-ledger",
      "text-editor",
      "terminal-io",
      "galaxy-raiders",
      "dungeon-quest",
      "spreadsheet",
      "cad-scientific",
      "compiler-build",
      "multiuser-timesharing",
    ]);
    for (const workload of data.workloads) {
      expect(workload.era[0]).toBeGreaterThanOrEqual(1971);
      expect(workload.era[1]).toBeLessThanOrEqual(1990);
      expect(OP_CLASSES.some((opClass) => workload.opsPerUnit[opClass] > 0)).toBe(true);
      expect(workload.footprintKB.instr).toBeGreaterThanOrEqual(0);
    }
  });

  it("only marks games as frame-capped and only games use frame work units", () => {
    for (const workload of data.workloads) {
      if (workload.kind === "game") {
        expect(workload.workUnit).toBe("frame");
        expect(workload.frameCapHz).toBe(60);
      } else {
        expect(workload.frameCapHz).toBeUndefined();
      }
    }
  });

  it("gives every workload at least one matching custom-instruction pattern", () => {
    for (const workload of data.workloads) {
      const patterns = Object.keys(workload.patterns);
      expect(patterns.length).toBeGreaterThan(0);
      for (const patternId of patterns) {
        expect(data.patternById[patternId]).toBeDefined();
      }
    }
  });
});
