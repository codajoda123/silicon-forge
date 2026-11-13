import type { DesignPresetBlock } from "../../src/data/presetSchema";
import type { DesignPreset } from "../../src/data/presetSchema";
import { getGameData, getTuning } from "../../src/data/gameData";
import type { DesignSettings, IsaConfig } from "../../src/sim/isa/types";
import { isaConfigFromArchetype } from "../../src/sim/isa/defaults";
import { buildPresetDesign } from "../../src/sim/design/presets";
import { createDefaultSettings } from "../../src/sim/isa/defaults";
import type { ChipDesign } from "../../src/sim/design/types";

export interface CalibrationTarget {
  id: string;
  label: string;
  year: number;
  /** Section 9.7 clock band in MHz. */
  clockMHz: readonly [number, number];
  /** Section 9.7 MIPS band. */
  mips: readonly [number, number];
  /** Section 9.7 die-area band in mm²; 1978 and earlier use the chapter table. */
  areaMm2: readonly [number, number];
}

interface ReferenceSpec extends CalibrationTarget {
  nodeId: string;
  packageId: string;
  dieW: number;
  dieH: number;
  archetypeId: string;
  isa: Partial<Omit<IsaConfig, "archetypeId">>;
  settings: Partial<DesignSettings>;
  blocks: readonly DesignPresetBlock[];
}

const data = getGameData();
const tuning = getTuning();

function settingsFor(spec: ReferenceSpec): DesignSettings {
  const node = data.nodeById[spec.nodeId];
  if (node === undefined) {
    throw new Error(`Calibration ${spec.id}: unknown node`);
  }
  return {
    ...createDefaultSettings(node, tuning),
    targetClockMHz: 200,
    vdd: node.vddNominal,
    cooling: "none",
    testStrategy: "full-scan-bist",
    ...spec.settings,
  };
}

function presetFor(spec: ReferenceSpec): DesignPreset {
  return {
    id: spec.id,
    name: spec.label,
    description: "Section 9.7 calibration reference",
    historicalYear: spec.year,
    nodeId: spec.nodeId,
    packageId: spec.packageId,
    dieW: spec.dieW,
    dieH: spec.dieH,
    blocks: spec.blocks.map((block) => ({ ...block })),
  };
}

export function buildCalibrationDesign(spec: ReferenceSpec): ChipDesign {
  const design = buildPresetDesign(presetFor(spec), data, tuning, {
    id: `calibration-${spec.id}`,
    name: spec.label,
  });
  const isa = isaConfigFromArchetype(spec.archetypeId, data);
  return {
    ...design,
    isa: { ...isa, ...spec.isa, extensions: [...(spec.isa.extensions ?? isa.extensions)] },
    settings: settingsFor(spec),
  };
}

const io4 = { dataPins: 4, addressPins: 0, controlPins: 2 };
const bus4 = { busWidth: 4, multiplexed: true, prefetchBytes: 0 };
const rf4 = { registers: 16, width: 4, ports: 3 };
const alu4 = { width: 4, carry: "ripple" };

const io8 = { dataPins: 8, addressPins: 0, controlPins: 4 };
const bus8 = { busWidth: 8, multiplexed: true, prefetchBytes: 4 };
const rf8 = { registers: 8, width: 8, ports: 5 };
const alu8 = { width: 8, carry: "ripple" };
const shifter8 = { width: 8, type: "barrel" };
const mul8 = { width: 8, mode: "iterative" };

const io16 = { dataPins: 16, addressPins: 8, controlPins: 4 };
const bus16 = { busWidth: 16, multiplexed: false, prefetchBytes: 8 };
const rf16 = { registers: 16, width: 16, ports: 5 };
const lookahead16 = { width: 16, carry: "lookahead" };
const shifter16 = { width: 16, type: "barrel" };
const mul16 = { width: 16, mode: "array" };
const div16 = { width: 16, mode: "iterative" };

const io32 = { dataPins: 32, addressPins: 16, controlPins: 6 };
const bus32 = { busWidth: 32, multiplexed: false, prefetchBytes: 8 };
const rf32 = { registers: 32, width: 32, ports: 7 };
const alu32 = { width: 32, carry: "lookahead" };
const shifter32 = { width: 32, type: "barrel" };
const mul32 = { width: 32, mode: "array" };
const div32 = { width: 32, mode: "iterative" };
const fpuBasic = { precision: "single", mode: "basic" };

/** Section 9.7 reference designs; bands are the plan's published numbers. */
export const CALIBRATION_SPECS: readonly ReferenceSpec[] = [
  {
    id: "intel-4004",
    label: "Intel 4004 class",
    year: 1971,
    nodeId: "10um-pmos",
    packageId: "ceramic-dip",
    dieW: 8,
    dieH: 9,
    archetypeId: "accumulator-cisc",
    isa: {
      wordBits: 4,
      registers: 16,
      addressBits: 12,
      fixedLength: false,
      addressingModes: 4,
      privilegeModes: false,
      extensions: ["bcd"],
    },
    settings: { pipelineStages: 1, control: "microcoded", busMultiplexed: true, prefetchQueueBytes: 0 },
    clockMHz: [0.74, 0.74],
    mips: [0.05, 0.09],
    areaMm2: [12, 12],
    blocks: [
      { typeId: "io-pads", config: io4, aspectRatio: 2 },
      { typeId: "bus-interface", config: bus4, aspectRatio: 2 },
      { typeId: "decoder-microcoded", config: { microcodeWords: 128, microcodeWidth: 16 }, aspectRatio: 2 },
      { typeId: "register-file", config: rf4, aspectRatio: 2 },
      { typeId: "program-counter", config: { addressWidth: 4 }, aspectRatio: 2 },
      { typeId: "alu", config: alu4, aspectRatio: 2 },
    ],
  },
  {
    id: "intel-8080",
    label: "Intel 8080 class",
    year: 1974,
    nodeId: "6um-nmos",
    packageId: "plastic-dip",
    dieW: 11,
    dieH: 11,
    archetypeId: "accumulator-cisc",
    isa: {
      wordBits: 8,
      registers: 8,
      addressBits: 16,
      fixedLength: false,
      addressingModes: 4,
      privilegeModes: false,
      extensions: ["multiply", "bcd"],
    },
    settings: { pipelineStages: 1, control: "hardwired", busMultiplexed: true, prefetchQueueBytes: 4 },
    clockMHz: [2, 2],
    mips: [0.1, 0.3],
    areaMm2: [20, 20],
    blocks: [
      { typeId: "io-pads", config: io8 },
      { typeId: "bus-interface", config: bus8 },
      { typeId: "decoder-hardwired", config: {} },
      { typeId: "register-file", config: rf8 },
      { typeId: "alu", config: alu8 },
      { typeId: "shifter", config: shifter8 },
      { typeId: "multiplier", config: mul8 },
      { typeId: "program-counter", config: { addressWidth: 16 } },
      { typeId: "interrupt-timer", config: {} },
      { typeId: "clock-generator", config: {} },
    ],
  },
  {
    id: "intel-8086",
    label: "Intel 8086 class",
    year: 1978,
    nodeId: "3um-hmos",
    packageId: "ceramic-dip",
    dieW: 14,
    dieH: 14,
    archetypeId: "register-memory-cisc",
    isa: {
      wordBits: 16,
      registers: 8,
      addressBits: 20,
      fixedLength: false,
      addressingModes: 6,
      privilegeModes: false,
      extensions: ["multiply", "divide"],
    },
    settings: { pipelineStages: 1, control: "microcoded", busMultiplexed: false, prefetchQueueBytes: 8 },
    clockMHz: [5, 10],
    mips: [0.3, 0.7],
    areaMm2: [33, 33],
    blocks: [
      { typeId: "io-pads", config: io16 },
      { typeId: "bus-interface", config: bus16 },
      { typeId: "decoder-microcoded", config: { microcodeWords: 256, microcodeWidth: 32 } },
      { typeId: "register-file", config: rf16 },
      { typeId: "alu", config: lookahead16 },
      { typeId: "alu", config: lookahead16 },
      { typeId: "multiplier", config: mul16 },
      { typeId: "divider", config: div16 },
      { typeId: "shifter", config: shifter16 },
      { typeId: "program-counter", config: { addressWidth: 20 } },
      { typeId: "interrupt-timer", config: {} },
      { typeId: "clock-generator", config: {} },
    ],
  },
  {
    id: "intel-80286",
    label: "Intel 80286 class",
    year: 1982,
    nodeId: "1.5um-cmos",
    packageId: "ceramic-dip",
    dieW: 20,
    dieH: 20,
    archetypeId: "register-memory-cisc",
    isa: {
      wordBits: 16,
      registers: 8,
      addressBits: 24,
      fixedLength: false,
      addressingModes: 6,
      privilegeModes: true,
      extensions: ["multiply", "divide"],
    },
    settings: { pipelineStages: 1, control: "microcoded", busMultiplexed: false, prefetchQueueBytes: 8 },
    clockMHz: [7.5, 12.5],
    mips: [1, 2],
    areaMm2: [49, 49],
    blocks: [
      { typeId: "io-pads", config: io16 },
      { typeId: "bus-interface", config: bus16 },
      { typeId: "decoder-microcoded", config: { microcodeWords: 256, microcodeWidth: 32 } },
      { typeId: "register-file", config: rf16 },
      { typeId: "alu", config: lookahead16 },
      { typeId: "alu", config: lookahead16 },
      { typeId: "multiplier", config: mul16 },
      { typeId: "divider", config: div16 },
      { typeId: "shifter", config: shifter16 },
      { typeId: "program-counter", config: { addressWidth: 24 } },
      { typeId: "instruction-cache", config: { sizeKB: 2, lineBytes: 16, associativity: 2 } },
      { typeId: "mmu", config: { mode: "segmentation" } },
      { typeId: "interrupt-timer", config: {} },
      { typeId: "clock-generator", config: {} },
    ],
  },
  {
    id: "intel-80386",
    label: "Intel 80386 class",
    year: 1985,
    nodeId: "1.5um-cmos",
    packageId: "plcc",
    dieW: 30,
    dieH: 30,
    archetypeId: "load-store-risc",
    isa: {
      wordBits: 32,
      registers: 32,
      addressBits: 32,
      fixedLength: true,
      addressingModes: 3,
      privilegeModes: true,
      extensions: ["multiply", "divide", "floating-point"],
    },
    settings: { pipelineStages: 3, control: "hardwired", cooling: "fan", busMultiplexed: false, prefetchQueueBytes: 8 },
    clockMHz: [16, 33],
    mips: [4, 11],
    areaMm2: [104, 104],
    blocks: [
      { typeId: "io-pads", config: io32 },
      { typeId: "bus-interface", config: bus32 },
      { typeId: "decoder-hardwired", config: {} },
      { typeId: "register-file", config: rf32 },
      { typeId: "alu", config: alu32 },
      { typeId: "alu", config: alu32 },
      { typeId: "multiplier", config: mul32 },
      { typeId: "divider", config: div32 },
      { typeId: "shifter", config: shifter32 },
      { typeId: "fpu", config: fpuBasic },
      { typeId: "mmu", config: { mode: "paging" } },
      { typeId: "instruction-cache", config: { sizeKB: 2, lineBytes: 16, associativity: 2 } },
      { typeId: "data-cache", config: { sizeKB: 2, lineBytes: 16, associativity: 2, writeBack: true } },
      { typeId: "program-counter", config: { addressWidth: 32 } },
      { typeId: "interrupt-timer", config: {} },
      { typeId: "clock-generator", config: {} },
    ],
  },
  {
    id: "intel-80486",
    label: "Intel 80486 class",
    year: 1989,
    nodeId: "1um-cmos",
    packageId: "pga",
    dieW: 36,
    dieH: 36,
    archetypeId: "load-store-risc",
    isa: {
      wordBits: 32,
      registers: 32,
      addressBits: 32,
      fixedLength: true,
      addressingModes: 3,
      privilegeModes: true,
      extensions: ["multiply", "divide", "floating-point", "simd"],
    },
    settings: { pipelineStages: 3, control: "hardwired", cooling: "fan", busMultiplexed: false, prefetchQueueBytes: 8 },
    clockMHz: [43, 53],
    mips: [10, 30],
    areaMm2: [150, 150],
    blocks: [
      { typeId: "io-pads", config: io32 },
      { typeId: "bus-interface", config: bus32 },
      { typeId: "decoder-hardwired", config: {} },
      { typeId: "register-file", config: rf32 },
      { typeId: "alu", config: alu32 },
      { typeId: "alu", config: alu32 },
      { typeId: "multiplier", config: mul32 },
      { typeId: "divider", config: div32 },
      { typeId: "shifter", config: shifter32 },
      { typeId: "fpu", config: { precision: "single", mode: "basic" } },
      { typeId: "mmu", config: { mode: "paging" } },
      { typeId: "instruction-cache", config: { sizeKB: 8, lineBytes: 16, associativity: 4 } },
      { typeId: "data-cache", config: { sizeKB: 8, lineBytes: 16, associativity: 4, writeBack: true } },
      { typeId: "program-counter", config: { addressWidth: 32 } },
      { typeId: "interrupt-timer", config: {} },
      { typeId: "clock-generator", config: {} },
    ],
  },
];
