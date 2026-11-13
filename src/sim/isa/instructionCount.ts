import type { GameData } from "../../data/load";
import {
  OP_CLASSES,
  type CustomInstruction,
  type OpClass,
  type Tuning,
  type WorkloadProfile,
} from "../../data/schemas";
import type { ChipDesign } from "../design/types";
import { computeOpcodeBudget, resolveCustomInstructions } from "./opcode";
import type {
  CustomInstructionEffect,
  InstructionBreakdown,
  InstructionEstimateSet,
  IsaConfig,
  OpClassInstructionRow,
  OpcodeBudget,
} from "./types";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function extensionForClass(opClass: OpClass, tuning: Tuning): Tuning["isa"]["extensions"][number] | undefined {
  return tuning.isa.extensions.find((extension) => extension.opClasses.includes(opClass));
}

/**
 * Section 8.2: a 16-bit operand on an 8-bit datapath needs two passes.
 * Only the classes listed in tuning.isa.widthPassClasses pay this cost.
 */
function widthPassesFor(opClass: OpClass, isa: IsaConfig, workload: WorkloadProfile, tuning: Tuning): number {
  if (!tuning.isa.widthPassClasses.includes(opClass)) {
    return 1;
  }
  return Math.max(1, Math.ceil(workload.operandBits / isa.wordBits));
}

/** Section 8.2/8.3: missing hardware turns the operation into a software routine. */
function missingHardwareFactorFor(
  opClass: OpClass,
  isa: IsaConfig,
  tuning: Tuning,
): number {
  const extension = extensionForClass(opClass, tuning);
  if (extension === undefined || isa.extensions.includes(extension.id)) {
    return 1;
  }
  return extension.missingHardwareFactor;
}

/** Section 8.2: address space that cannot hold the workload forces bank switching. */
export function addressShortfallFactor(
  isa: IsaConfig,
  workload: WorkloadProfile,
  tuning: Tuning,
): number {
  const footprintBytes = (workload.footprintKB.instr + workload.footprintKB.data) * 1024;
  const addressableBytes = 2 ** isa.addressBits;
  if (footprintBytes <= addressableBytes || addressableBytes <= 0) {
    return 1;
  }
  const shortfall = Math.log2(footprintBytes / addressableBytes);
  return 1 + shortfall * tuning.isa.addressShortfallPenaltyPerDoubling;
}

/**
 * Section 8.2/8.3: a register-starved ISA spills values to memory. More ILP and
 * more operands need more live registers, so the same register file hurts the
 * wider/more parallel workload more.
 */
export function registerSpillFraction(
  isa: IsaConfig,
  workload: WorkloadProfile,
  tuning: Tuning,
): number {
  const required = Math.ceil(
    workload.ilpMax * tuning.isa.registersPerIlp + tuning.isa.baseWorkingRegisters,
  );
  if (required <= 0) {
    return 0;
  }
  return clamp((required - isa.registers) / required, 0, 1);
}

/** Byte size of one instruction before opcode-budget overflow. */
export function baseInstructionBytes(
  isa: IsaConfig,
  archetypeBytes: number,
  tuning: Tuning,
): number {
  if (isa.fixedLength) {
    return Math.max(tuning.isa.minimumInstructionBytes, Math.ceil(isa.wordBits / 8));
  }
  const widthFactor =
    (isa.wordBits / tuning.isa.referenceWordBits) ** tuning.isa.variableBytesWidthExponent;
  const densityReduction = Math.min(
    tuning.isa.maxAddressingDensityReduction,
    Math.max(0, isa.addressingModes - 1) * tuning.isa.addressingModesDensityPerMode,
  );
  return Math.max(
    tuning.isa.minimumInstructionBytes,
    archetypeBytes * widthFactor * (1 - densityReduction),
  );
}

function totalOps(workload: WorkloadProfile): number {
  return OP_CLASSES.reduce((sum, opClass) => sum + (workload.opsPerUnit[opClass] ?? 0), 0);
}

function applyCustomInstructions(
  selected: readonly CustomInstruction[],
  workload: WorkloadProfile,
  totalInstructionOps: number,
  compilerSupport: number,
  maxRemovalShare: number,
): { removed: number; effects: CustomInstructionEffect[] } {
  const ops = totalOps(workload);
  const raw: CustomInstructionEffect[] = [];
  for (const instruction of selected) {
    const patternShare = workload.patterns[instruction.patternId] ?? 0;
    if (patternShare <= 0) {
      continue;
    }
    const effectiveShare = patternShare * compilerSupport;
    const removedOps = effectiveShare * ops * (1 - 1 / instruction.opsReplaced);
    raw.push({
      id: instruction.id,
      name: instruction.name,
      patternId: instruction.patternId,
      patternShare,
      removedOps,
    });
  }

  const rawRemoved = raw.reduce((sum, effect) => sum + effect.removedOps, 0);
  const cap = totalInstructionOps * maxRemovalShare;
  const scale = rawRemoved > cap && rawRemoved > 0 ? cap / rawRemoved : 1;
  const effects = raw.map((effect) => ({ ...effect, removedOps: effect.removedOps * scale }));
  return {
    removed: Math.min(rawRemoved, cap),
    effects,
  };
}

function buildRows(
  isa: IsaConfig,
  workload: WorkloadProfile,
  archetypeOpsToInstr: Readonly<Record<OpClass, number>>,
  spillTotal: number,
  addressTotal: number,
  tuning: Tuning,
): OpClassInstructionRow[] {
  const partial = OP_CLASSES.map((opClass) => {
    const ops = workload.opsPerUnit[opClass] ?? 0;
    const opsToInstr = archetypeOpsToInstr[opClass];
    const widthPasses = widthPassesFor(opClass, isa, workload, tuning);
    const baseInstructions = ops * opsToInstr;
    const widthExtra = baseInstructions * (widthPasses - 1);
    const missingHardwareFactor = missingHardwareFactorFor(opClass, isa, tuning);
    const missingHardwareExtra = (baseInstructions + widthExtra) * (missingHardwareFactor - 1);
    return {
      opClass,
      ops,
      opsToInstr,
      widthPasses,
      baseInstructions,
      widthExtra,
      missingHardwareExtra,
      spillExtra: 0,
      addressExtra: 0,
    };
  }).filter((row) => row.ops > 0);

  const loadStoreBase = partial
    .filter((row) => row.opClass === "load" || row.opClass === "store")
    .reduce((sum, row) => sum + row.baseInstructions + row.widthExtra + row.missingHardwareExtra, 0);
  const subtotal = partial.reduce(
    (sum, row) => sum + row.baseInstructions + row.widthExtra + row.missingHardwareExtra,
    0,
  );

  return partial.map((row) => {
    const isLoadStore = row.opClass === "load" || row.opClass === "store";
    const rowSubtotal = row.baseInstructions + row.widthExtra + row.missingHardwareExtra;
    const shareOfLoadStore = isLoadStore && loadStoreBase > 0 ? rowSubtotal / loadStoreBase : 0;
    const spillExtra = spillTotal * shareOfLoadStore;
    const addressExtra = addressTotal * shareOfLoadStore;
    return {
      ...row,
      spillExtra,
      addressExtra,
      instructions: rowSubtotal + spillExtra + addressExtra,
      share: subtotal > 0 ? rowSubtotal / subtotal : 0,
    };
  });
}

function buildOne(
  design: ChipDesign,
  workload: WorkloadProfile,
  data: GameData,
  tuning: Tuning,
  selected: readonly CustomInstruction[],
  opcode: OpcodeBudget,
): InstructionBreakdown {
  const isa = design.isa;
  const archetype = data.isaById[isa.archetypeId];
  if (archetype === undefined) {
    throw new Error(`Design references unknown ISA archetype "${isa.archetypeId}"`);
  }

  const baseRows = buildRows(isa, workload, archetype.opsToInstr, 0, 0, tuning);
  let subtotal = baseRows.reduce((sum, row) => sum + row.instructions, 0);
  const spillFraction = registerSpillFraction(isa, workload, tuning);
  const loadStoreInstructions = baseRows
    .filter((row) => row.opClass === "load" || row.opClass === "store")
    .reduce((sum, row) => sum + row.instructions, 0);
  const addressFactor = addressShortfallFactor(isa, workload, tuning);
  const spillTotal =
    loadStoreInstructions * spillFraction * tuning.isa.spillTrafficFactor;
  const addressTotal = loadStoreInstructions * (addressFactor - 1);
  const rows = buildRows(
    isa,
    workload,
    archetype.opsToInstr,
    spillTotal,
    addressTotal,
    tuning,
  );
  subtotal = rows.reduce((sum, row) => sum + row.instructions, 0);

  const custom = applyCustomInstructions(
    selected,
    workload,
    subtotal,
    tuning.isa.customCompilerSupport,
    tuning.isa.maxCustomRemovalShare,
  );
  const totalInstructions = Math.max(0, subtotal - custom.removed);
  const baseBytesPerInstr = baseInstructionBytes(isa, archetype.bytesPerInstr, tuning);
  const bytesPerInstr = baseBytesPerInstr + opcode.extraEncodingBytes;

  return {
    workloadId: workload.id,
    workloadName: workload.name,
    workUnit: workload.workUnit,
    totalOps: totalOps(workload),
    baseInstructions: rows.reduce((sum, row) => sum + row.baseInstructions, 0),
    widthExtra: rows.reduce((sum, row) => sum + row.widthExtra, 0),
    missingHardwareExtra: rows.reduce((sum, row) => sum + row.missingHardwareExtra, 0),
    spillExtra: rows.reduce((sum, row) => sum + row.spillExtra, 0),
    addressExtra: rows.reduce((sum, row) => sum + row.addressExtra, 0),
    customRemoved: custom.removed,
    totalInstructions,
    compilerSupport: tuning.isa.customCompilerSupport,
    rows,
    customEffects: custom.effects,
    opcode,
    baseBytesPerInstr,
    bytesPerInstr,
    codeBytes: totalInstructions * bytesPerInstr,
  };
}

/** Section 9.4 step 1, with the breakdown the Architecture Lab displays. */
export function buildInstructionBreakdown(
  design: ChipDesign,
  workload: WorkloadProfile,
  data: GameData,
  tuning: Tuning,
): InstructionBreakdown {
  const resolved = resolveCustomInstructions(design.customInstructions, data);
  if (resolved.error !== null) {
    throw new Error(resolved.error);
  }
  const archetype = data.isaById[design.isa.archetypeId];
  if (archetype === undefined) {
    throw new Error(`Design references unknown ISA archetype "${design.isa.archetypeId}"`);
  }
  const opcode = computeOpcodeBudget(
    design.isa,
    archetype.opcodeSpaceBits,
    resolved.instructions,
    tuning,
  );
  return buildOne(design, workload, data, tuning, resolved.instructions, opcode);
}

export function buildInstructionEstimates(
  design: ChipDesign,
  data: GameData,
  tuning: Tuning,
): InstructionEstimateSet {
  const resolved = resolveCustomInstructions(design.customInstructions, data);
  if (resolved.error !== null) {
    throw new Error(resolved.error);
  }
  const archetype = data.isaById[design.isa.archetypeId];
  if (archetype === undefined) {
    throw new Error(`Design references unknown ISA archetype "${design.isa.archetypeId}"`);
  }
  const opcode = computeOpcodeBudget(
    design.isa,
    archetype.opcodeSpaceBits,
    resolved.instructions,
    tuning,
  );
  return {
    opcode,
    breakdowns: data.workloads.map((workload) =>
      buildOne(design, workload, data, tuning, resolved.instructions, opcode),
    ),
  };
}
