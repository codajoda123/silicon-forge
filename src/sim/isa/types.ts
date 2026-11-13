import type { OpClass } from "../../data/schemas";

/**
 * Section 8.2/17: every architecture parameter the player can tune.
 * `archetypeId` selects the base `isas.json` record; the remaining fields are
 * the player's overrides, so the same archetype can ship several ISAs.
 */
export interface IsaConfig {
  archetypeId: string;
  wordBits: number;
  registers: number;
  addressBits: number;
  fixedLength: boolean;
  addressingModes: number;
  privilegeModes: boolean;
  extensions: string[];
}

export type ControlStyle = "hardwired" | "microcoded";

/** Section 7.6 Phase 1 settings; the package lives on the design itself. */
export interface DesignSettings {
  targetClockMHz: number;
  vdd: number;
  pipelineStages: number;
  control: ControlStyle;
  cooling: string;
  testStrategy: string;
  spareRows: boolean;
  busMultiplexed: boolean;
  prefetchQueueBytes: number;
}

/** One op class's contribution to a workload's instruction count. */
export interface OpClassInstructionRow {
  opClass: OpClass;
  ops: number;
  opsToInstr: number;
  widthPasses: number;
  baseInstructions: number;
  widthExtra: number;
  missingHardwareExtra: number;
  spillExtra: number;
  addressExtra: number;
  instructions: number;
  share: number;
}

/** A custom instruction applied to one workload. */
export interface CustomInstructionEffect {
  id: string;
  name: string;
  patternId: string;
  patternShare: number;
  removedOps: number;
}

export interface OpcodeBudget {
  archetypeId: string;
  opcodeSpaceBits: number;
  budgetBits: number;
  usedBits: number;
  freeBits: number;
  overflowBits: number;
  selectedCount: number;
  extraEncodingBytes: number;
  overflowing: boolean;
}

export interface InstructionBreakdown {
  workloadId: string;
  workloadName: string;
  workUnit: string;
  totalOps: number;
  baseInstructions: number;
  widthExtra: number;
  missingHardwareExtra: number;
  spillExtra: number;
  addressExtra: number;
  customRemoved: number;
  totalInstructions: number;
  compilerSupport: number;
  rows: readonly OpClassInstructionRow[];
  customEffects: readonly CustomInstructionEffect[];
  opcode: OpcodeBudget;
  baseBytesPerInstr: number;
  bytesPerInstr: number;
  codeBytes: number;
}

export interface InstructionEstimateSet {
  opcode: OpcodeBudget;
  breakdowns: readonly InstructionBreakdown[];
}
