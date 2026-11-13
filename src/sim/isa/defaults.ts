import type { GameData } from "../../data/load";
import type { ProcessNode, Tuning } from "../../data/schemas";
import type { DesignSettings, IsaConfig } from "./types";

function latestAvailable<T extends { historicalYear: number }>(
  records: readonly T[],
  year: number,
): T {
  let best: T | undefined;
  for (const record of records) {
    if (
      record.historicalYear <= year &&
      (best === undefined || record.historicalYear > best.historicalYear)
    ) {
      best = record;
    }
  }
  if (best !== undefined) {
    return best;
  }
  const earliest = records[0];
  if (earliest === undefined) {
    throw new Error("Cannot choose an ISA archetype from an empty data set");
  }
  return records.reduce((current, record) =>
    record.historicalYear < current.historicalYear ? record : current,
  );
}

/** The newest archetype the start year knows; ties keep data-file order. */
export function pickDefaultIsa(data: GameData, year: number): GameData["isas"][number] {
  return latestAvailable(data.isas, year);
}

export function createDefaultIsaConfig(year: number, data: GameData): IsaConfig {
  const archetype = pickDefaultIsa(data, year);
  return {
    archetypeId: archetype.id,
    wordBits: archetype.defaultWordBits,
    registers: archetype.defaultRegisters,
    addressBits: archetype.defaultAddressBits,
    fixedLength: archetype.defaultFixedLength,
    addressingModes: archetype.defaultAddressingModes,
    privilegeModes: archetype.defaultPrivilegeModes,
    extensions: [...archetype.defaultExtensions],
  };
}

/** Reset every parameter to the chosen archetype's historical defaults. */
export function isaConfigFromArchetype(archetypeId: string, data: GameData): IsaConfig {
  const archetype = data.isaById[archetypeId];
  if (archetype === undefined) {
    throw new Error(`Unknown ISA archetype "${archetypeId}"`);
  }
  return {
    archetypeId: archetype.id,
    wordBits: archetype.defaultWordBits,
    registers: archetype.defaultRegisters,
    addressBits: archetype.defaultAddressBits,
    fixedLength: archetype.defaultFixedLength,
    addressingModes: archetype.defaultAddressingModes,
    privilegeModes: archetype.defaultPrivilegeModes,
    extensions: [...archetype.defaultExtensions],
  };
}

export function createDefaultSettings(node: ProcessNode, tuning: Tuning): DesignSettings {
  return {
    targetClockMHz: tuning.isa.defaultTargetClockMHz,
    vdd: node.vddNominal,
    pipelineStages: tuning.physical.defaultPipelineStages,
    control: tuning.isa.defaultControl,
    cooling: tuning.isa.defaultCooling,
    testStrategy: tuning.isa.defaultTestStrategy,
    spareRows: tuning.isa.defaultSpareRows,
    busMultiplexed: tuning.isa.defaultBusMultiplexed,
    prefetchQueueBytes: tuning.isa.defaultPrefetchQueueBytes,
  };
}
