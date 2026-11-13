import { getGameData, getTuning } from "../../src/data/gameData";
import type { ConfigValue } from "../../src/data/schemas";
import {
  applyDesignCommand,
  type DesignCommand,
} from "../../src/sim/design/commands";
import { createDefaultDesign } from "../../src/sim/design/defaults";
import type { ChipDesign } from "../../src/sim/design/types";

export const data = getGameData();
export const tuning = getTuning();

export function emptyDesign(startYear = 1971): ChipDesign {
  return createDefaultDesign(startYear, data, tuning);
}

export function run(design: ChipDesign, command: DesignCommand): ChipDesign {
  const result = applyDesignCommand(design, command, data);
  if (result.error !== null) {
    throw new Error(result.error);
  }
  return result.design;
}

export function place(
  design: ChipDesign,
  blockTypeId: string,
  x: number,
  y: number,
  options: {
    config?: Record<string, ConfigValue>;
    aspectRatio?: number;
  } = {},
): ChipDesign {
  return run(design, {
    type: "placeBlock",
    blockTypeId,
    x,
    y,
    config: options.config,
    aspectRatio: options.aspectRatio,
  });
}
