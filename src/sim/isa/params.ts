import type { GameData } from "../../data/load";
import type { ProcessNode, Tuning } from "../../data/schemas";
import type { DesignSettings, IsaConfig } from "./types";

export interface Normalized<T> {
  value: T;
  error: string | null;
}

function isIntegerIn(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

/**
 * Section 8.2: parameter ranges are data (`tuning.isa`), not hard-coded.
 * Extensions are normalised to catalog order so equal sets compare equal.
 */
export function normalizeIsaConfig(
  requested: IsaConfig,
  data: GameData,
  tuning: Tuning,
): Normalized<IsaConfig> {
  const archetype = data.isaById[requested.archetypeId];
  if (archetype === undefined) {
    return { value: requested, error: `Unknown ISA archetype "${requested.archetypeId}".` };
  }
  if (!tuning.isa.wordBitsOptions.includes(requested.wordBits)) {
    return {
      value: requested,
      error: `Datapath width must be one of ${tuning.isa.wordBitsOptions.join(", ")} bits.`,
    };
  }
  if (!tuning.isa.registerOptions.includes(requested.registers)) {
    return {
      value: requested,
      error: `Register count must be one of ${tuning.isa.registerOptions.join(", ")}.`,
    };
  }
  if (!isIntegerIn(requested.addressBits, tuning.isa.addressBitsMin, tuning.isa.addressBitsMax)) {
    return {
      value: requested,
      error: `Address width must be a whole number from ${String(tuning.isa.addressBitsMin)} to ${String(tuning.isa.addressBitsMax)} bits.`,
    };
  }
  if (
    !isIntegerIn(
      requested.addressingModes,
      tuning.isa.addressingModesMin,
      tuning.isa.addressingModesMax,
    )
  ) {
    return {
      value: requested,
      error: `Addressing modes must be a whole number from ${String(tuning.isa.addressingModesMin)} to ${String(tuning.isa.addressingModesMax)}.`,
    };
  }
  if (typeof requested.fixedLength !== "boolean" || typeof requested.privilegeModes !== "boolean") {
    return { value: requested, error: "Instruction length and privilege options must be boolean." };
  }

  const catalogIds = new Set(tuning.isa.extensions.map((extension) => extension.id));
  const requestedExtensions = new Set<string>();
  for (const extensionId of requested.extensions) {
    if (!catalogIds.has(extensionId)) {
      return { value: requested, error: `Unknown ISA extension "${extensionId}".` };
    }
    if (requestedExtensions.has(extensionId)) {
      return { value: requested, error: `Duplicate ISA extension "${extensionId}".` };
    }
    requestedExtensions.add(extensionId);
  }

  const extensions = tuning.isa.extensions
    .map((extension) => extension.id)
    .filter((extensionId) => requestedExtensions.has(extensionId));

  return {
    value: {
      archetypeId: archetype.id,
      wordBits: requested.wordBits,
      registers: requested.registers,
      addressBits: requested.addressBits,
      fixedLength: requested.fixedLength,
      addressingModes: requested.addressingModes,
      privilegeModes: requested.privilegeModes,
      extensions,
    },
    error: null,
  };
}

/** Supply voltage is clamped only when the process node changes. */
export function clampVdd(vdd: number, node: ProcessNode): number {
  return Math.min(node.vddRange[1], Math.max(node.vddRange[0], vdd));
}

export function normalizeDesignSettings(
  requested: DesignSettings,
  node: ProcessNode,
  tuning: Tuning,
): Normalized<DesignSettings> {
  if (
    !Number.isFinite(requested.targetClockMHz) ||
    requested.targetClockMHz < tuning.isa.targetClockMinMHz ||
    requested.targetClockMHz > tuning.isa.targetClockMaxMHz
  ) {
    return {
      value: requested,
      error: `Target clock must be between ${String(tuning.isa.targetClockMinMHz)} and ${String(tuning.isa.targetClockMaxMHz)} MHz.`,
    };
  }
  if (
    !Number.isFinite(requested.vdd) ||
    requested.vdd < node.vddRange[0] ||
    requested.vdd > node.vddRange[1]
  ) {
    return {
      value: requested,
      error: `Supply voltage must stay inside the ${node.name} range ${String(node.vddRange[0])}-${String(node.vddRange[1])} V.`,
    };
  }
  if (
    !isIntegerIn(
      requested.pipelineStages,
      tuning.isa.pipelineStagesMin,
      tuning.isa.pipelineStagesMax,
    )
  ) {
    return {
      value: requested,
      error: `Pipeline stages must be a whole number from ${String(tuning.isa.pipelineStagesMin)} to ${String(tuning.isa.pipelineStagesMax)}.`,
    };
  }
  if (requested.control !== "hardwired" && requested.control !== "microcoded") {
    return { value: requested, error: "Control style must be hardwired or microcoded." };
  }
  if (!tuning.isa.coolingOptions.some((option) => option.id === requested.cooling)) {
    return { value: requested, error: `Unknown cooling option "${requested.cooling}".` };
  }
  if (!tuning.isa.testStrategies.some((option) => option.id === requested.testStrategy)) {
    return { value: requested, error: `Unknown test strategy "${requested.testStrategy}".` };
  }
  if (typeof requested.spareRows !== "boolean" || typeof requested.busMultiplexed !== "boolean") {
    return { value: requested, error: "Redundancy and bus options must be boolean." };
  }
  if (
    !isIntegerIn(
      requested.prefetchQueueBytes,
      tuning.isa.prefetchQueueMinBytes,
      tuning.isa.prefetchQueueMaxBytes,
    )
  ) {
    return {
      value: requested,
      error: `Prefetch queue must be a whole number from ${String(tuning.isa.prefetchQueueMinBytes)} to ${String(tuning.isa.prefetchQueueMaxBytes)} bytes.`,
    };
  }

  return {
    value: {
      targetClockMHz: requested.targetClockMHz,
      vdd: requested.vdd,
      pipelineStages: requested.pipelineStages,
      control: requested.control,
      cooling: requested.cooling,
      testStrategy: requested.testStrategy,
      spareRows: requested.spareRows,
      busMultiplexed: requested.busMultiplexed,
      prefetchQueueBytes: requested.prefetchQueueBytes,
    },
    error: null,
  };
}

export function coolingConductanceMultiplier(cooling: string, tuning: Tuning): number {
  const option = tuning.isa.coolingOptions.find((candidate) => candidate.id === cooling);
  if (option === undefined) {
    throw new Error(`Unknown cooling option "${cooling}"`);
  }
  return option.verticalConductanceMultiplier;
}
