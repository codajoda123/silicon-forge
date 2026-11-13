import type { ConfigValue } from "../../src/data/schemas";

export interface FixturePlacement {
  typeId: string;
  config: Record<string, ConfigValue>;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AutoPlaceFixture {
  id: string;
  name: string;
  year: number;
  nodeId: string;
  packageId: string;
  dieW: number;
  dieH: number;
  /** Fixed reference floorplan for the Section 7.8 acceptance fixture. */
  reference: readonly FixturePlacement[];
  /** Seed used for the random start layout in the acceptance test. */
  startSeed: number;
  /** Seed used by auto-place in the acceptance test. */
  autoSeed: number;
  /** Seeds for independent random placements used as the lower baseline. */
  randomSeeds: readonly number[];
}

const io4 = { dataPins: 4, addressPins: 0, controlPins: 2 };
const bus4 = { busWidth: 4, multiplexed: true, prefetchBytes: 0 };
const micro128 = { microcodeWords: 128, microcodeWidth: 16 };
const rf4 = { registers: 16, width: 4, ports: 3 };
const pc4 = { addressWidth: 4 };
const alu4 = { width: 4, carry: "ripple" };

const io8 = { dataPins: 8, addressPins: 0, controlPins: 4 };
const bus8 = { busWidth: 8, multiplexed: true, prefetchBytes: 4 };
const rf8 = { registers: 8, width: 8, ports: 5 };
const alu8 = { width: 8, carry: "ripple" };
const shifter8 = { width: 8, type: "barrel" };
const mul8 = { width: 8, mode: "iterative" };
const pc16 = { addressWidth: 16 };

const io16 = { dataPins: 16, addressPins: 8, controlPins: 4 };
const bus16 = { busWidth: 16, multiplexed: false, prefetchBytes: 8 };
const micro256 = { microcodeWords: 256, microcodeWidth: 32 };
const rf16 = { registers: 16, width: 16, ports: 5 };
const alu16 = { width: 16, carry: "ripple" };
const shifter16 = { width: 16, type: "barrel" };
const mul16 = { width: 16, mode: "array" };
const div16 = { width: 16, mode: "iterative" };
const pc20 = { addressWidth: 20 };

const io32 = { dataPins: 32, addressPins: 16, controlPins: 6 };
const bus32 = { busWidth: 32, multiplexed: false, prefetchBytes: 8 };
const rf32 = { registers: 32, width: 32, ports: 7 };
const alu32 = { width: 32, carry: "lookahead" };
const shifter32 = { width: 32, type: "barrel" };
const mul32 = { width: 32, mode: "array" };
const div32 = { width: 32, mode: "iterative" };
const fpuBasic = { precision: "single", mode: "basic" };
const pc32 = { addressWidth: 32 };

/**
 * M6 recalibrated the pad, bus-interface and microcode transistor formulas for
 * the Section 9.7 reference classes, so the M4 reference floorplans were
 * re-packed around the new footprints. The layouts stay hand-chosen (edge
 * blocks on the border, datapath clustered); auto-place still must not beat
 * them by more than the Section 7.8 target.
 */
export const AUTOPLACE_FIXTURES: readonly AutoPlaceFixture[] = [
  {
    id: "1971-calculator",
    name: "1971 calculator CPU",
    year: 1971,
    nodeId: "10um-pmos",
    packageId: "ceramic-dip",
    dieW: 14,
    dieH: 14,
    reference: [
      { typeId: "io-pads", config: io4, x: 11, y: 11, w: 2, h: 3 },
      { typeId: "bus-interface", config: bus4, x: 10, y: 7, w: 4, h: 4 },
      { typeId: "decoder-microcoded", config: micro128, x: 4, y: 7, w: 4, h: 4 },
      { typeId: "register-file", config: rf4, x: 7, y: 11, w: 3, h: 3 },
      { typeId: "program-counter", config: pc4, x: 8, y: 7, w: 2, h: 3 },
      { typeId: "alu", config: alu4, x: 5, y: 11, w: 2, h: 3 },
    ],
    startSeed: 101,
    autoSeed: 1,
    randomSeeds: [201, 202, 203],
  },
  {
    id: "1974-8bit-consumer",
    name: "1974 8-bit consumer CPU",
    year: 1974,
    nodeId: "6um-nmos",
    packageId: "plastic-dip",
    dieW: 16,
    dieH: 16,
    reference: [
      { typeId: "io-pads", config: io8, x: 12, y: 9, w: 4, h: 3 },
      { typeId: "bus-interface", config: bus8, x: 12, y: 5, w: 4, h: 4 },
      { typeId: "decoder-hardwired", config: {}, x: 0, y: 4, w: 3, h: 4 },
      { typeId: "register-file", config: rf8, x: 5, y: 4, w: 3, h: 4 },
      { typeId: "alu", config: alu8, x: 3, y: 4, w: 2, h: 3 },
      { typeId: "shifter", config: shifter8, x: 6, y: 8, w: 3, h: 4 },
      { typeId: "multiplier", config: mul8, x: 3, y: 7, w: 2, h: 3 },
      { typeId: "program-counter", config: pc16, x: 9, y: 5, w: 3, h: 3 },
      { typeId: "interrupt-timer", config: {}, x: 0, y: 8, w: 3, h: 4 },
      { typeId: "clock-generator", config: {}, x: 3, y: 10, w: 3, h: 2 },
    ],
    startSeed: 101,
    autoSeed: 31,
    randomSeeds: [201, 202, 203],
  },
  {
    id: "1978-16bit",
    name: "1978 16-bit processor",
    year: 1978,
    nodeId: "3um-hmos",
    packageId: "ceramic-dip",
    dieW: 20,
    dieH: 20,
    reference: [
      { typeId: "io-pads", config: io16, x: 16, y: 14, w: 4, h: 3 },
      { typeId: "bus-interface", config: bus16, x: 16, y: 17, w: 3, h: 3 },
      { typeId: "decoder-microcoded", config: micro256, x: 7, y: 12, w: 3, h: 3 },
      { typeId: "register-file", config: rf16, x: 3, y: 15, w: 5, h: 4 },
      { typeId: "alu", config: alu16, x: 8, y: 15, w: 2, h: 2 },
      { typeId: "alu", config: alu16, x: 5, y: 13, w: 2, h: 2 },
      { typeId: "multiplier", config: mul16, x: 7, y: 4, w: 8, h: 7 },
      { typeId: "divider", config: div16, x: 18, y: 9, w: 2, h: 3 },
      { typeId: "shifter", config: shifter16, x: 16, y: 4, w: 4, h: 5 },
      { typeId: "program-counter", config: pc20, x: 14, y: 18, w: 2, h: 2 },
      { typeId: "interrupt-timer", config: {}, x: 12, y: 18, w: 2, h: 2 },
      { typeId: "clock-generator", config: {}, x: 8, y: 18, w: 2, h: 2 },
    ],
    startSeed: 101,
    autoSeed: 4,
    randomSeeds: [201, 202, 203],
  },
  {
    id: "1985-32bit",
    name: "1985 32-bit CPU with caches",
    year: 1985,
    nodeId: "1.5um-cmos",
    packageId: "plcc",
    dieW: 32,
    dieH: 32,
    reference: [
      { typeId: "io-pads", config: io32, x: 29, y: 20, w: 3, h: 2 },
      { typeId: "bus-interface", config: bus32, x: 30, y: 18, w: 2, h: 2 },
      { typeId: "decoder-hardwired", config: {}, x: 23, y: 8, w: 1, h: 2 },
      { typeId: "register-file", config: rf32, x: 25, y: 3, w: 6, h: 6 },
      { typeId: "alu", config: alu32, x: 28, y: 9, w: 2, h: 2 },
      { typeId: "alu", config: alu32, x: 23, y: 4, w: 2, h: 2 },
      { typeId: "multiplier", config: mul32, x: 8, y: 24, w: 8, h: 8 },
      { typeId: "divider", config: div32, x: 6, y: 30, w: 2, h: 2 },
      { typeId: "shifter", config: shifter32, x: 0, y: 28, w: 5, h: 4 },
      { typeId: "fpu", config: fpuBasic, x: 0, y: 20, w: 8, h: 8 },
      { typeId: "mmu", config: { mode: "paging" }, x: 22, y: 10, w: 3, h: 3 },
      {
        typeId: "instruction-cache",
        config: { sizeKB: 1, lineBytes: 16, associativity: 2 },
        x: 0,
        y: 6,
        w: 11,
        h: 11,
      },
      {
        typeId: "data-cache",
        config: { sizeKB: 1, lineBytes: 16, associativity: 2, writeBack: true },
        x: 11,
        y: 6,
        w: 11,
        h: 11,
      },
      { typeId: "program-counter", config: pc32, x: 30, y: 17, w: 2, h: 1 },
      { typeId: "interrupt-timer", config: {}, x: 5, y: 30, w: 1, h: 2 },
      { typeId: "clock-generator", config: {}, x: 0, y: 5, w: 1, h: 1 },
    ],
    startSeed: 101,
    autoSeed: 1,
    randomSeeds: [201, 202, 203],
  },
  {
    id: "1985-thermal",
    name: "1985 wide-OoO thermal test",
    year: 1985,
    nodeId: "1.5um-cmos",
    packageId: "plastic-dip",
    dieW: 18,
    dieH: 18,
    reference: [
      { typeId: "io-pads", config: io8, x: 0, y: 16, w: 1, h: 2 },
      {
        typeId: "bus-interface",
        config: { busWidth: 8, multiplexed: true, prefetchBytes: 2 },
        x: 0,
        y: 14,
        w: 1,
        h: 2,
      },
      { typeId: "decoder-hardwired", config: {}, x: 0, y: 2, w: 2, h: 1 },
      { typeId: "register-file", config: rf16, x: 2, y: 2, w: 2, h: 3 },
      { typeId: "alu", config: alu16, x: 4, y: 2, w: 1, h: 2 },
      { typeId: "alu", config: alu16, x: 2, y: 5, w: 2, h: 1 },
      { typeId: "alu", config: alu16, x: 1, y: 3, w: 1, h: 2 },
      { typeId: "alu", config: alu16, x: 3, y: 1, w: 2, h: 1 },
      { typeId: "shifter", config: shifter16, x: 16, y: 15, w: 2, h: 3 },
      { typeId: "multiplier", config: mul16, x: 14, y: 10, w: 4, h: 4 },
      { typeId: "divider", config: div16, x: 15, y: 16, w: 1, h: 2 },
      { typeId: "program-counter", config: pc16, x: 0, y: 13, w: 1, h: 1 },
      { typeId: "fpu", config: fpuBasic, x: 6, y: 9, w: 8, h: 8 },
      { typeId: "interrupt-timer", config: {}, x: 1, y: 17, w: 2, h: 1 },
      { typeId: "clock-generator", config: {}, x: 17, y: 6, w: 1, h: 1 },
    ],
    startSeed: 101,
    autoSeed: 2,
    randomSeeds: [201, 202, 203],
  },
];

