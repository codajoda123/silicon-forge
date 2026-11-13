import type { GameData } from "../../data/load";
import type { ChipPackage, ProcessNode, Tuning } from "../../data/schemas";
import { createDefaultIsaConfig, createDefaultSettings } from "../isa/defaults";
import type { ChipDesign } from "./types";

function latestAvailable<T extends { historicalYear: number }>(
  records: readonly T[],
  year: number,
): T {
  let best: T | undefined;
  for (const record of records) {
    if (record.historicalYear <= year && (best === undefined || record.historicalYear > best.historicalYear)) {
      best = record;
    }
  }
  if (best !== undefined) {
    return best;
  }
  const earliest = records[0];
  if (earliest === undefined) {
    throw new Error("Cannot create a design from an empty data set");
  }
  return records.reduce((current, record) =>
    record.historicalYear < current.historicalYear ? record : current,
  );
}

export function pickDefaultNode(data: GameData, year: number): ProcessNode {
  return latestAvailable(data.nodes, year);
}

export function pickDefaultPackage(data: GameData, year: number): ChipPackage {
  return latestAvailable(data.packages, year);
}

/**
 * A new game starts with one empty, editable design. The node and package are
 * the newest ones available in the start year, so a 1984 game does not begin
 * on a 1971 process.
 */
export function createDefaultDesign(
  startYear: number,
  data: GameData,
  tuning: Tuning,
): ChipDesign {
  const node = pickDefaultNode(data, startYear);
  const pkg = pickDefaultPackage(data, startYear);
  return {
    id: "design-1",
    name: tuning.design.defaultName,
    nodeId: node.id,
    packageId: pkg.id,
    dieW: tuning.design.defaultDieWidth,
    dieH: tuning.design.defaultDieHeight,
    blocks: [],
    pipelinedLinks: [],
    isa: createDefaultIsaConfig(startYear, data),
    settings: createDefaultSettings(node, tuning),
    customInstructions: [],
  };
}
