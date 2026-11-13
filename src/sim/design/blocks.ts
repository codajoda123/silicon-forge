import { getTuning } from "../../data/gameData";
import { compileFormula, type FormulaVariables } from "../../data/formula";
import type { BlockType, ConfigValue, ProcessNode } from "../../data/schemas";
import type { BlockStats } from "./types";

const tuning = getTuning();

export interface ConfigResult {
  config: Record<string, ConfigValue>;
  error: string | null;
}

/** Every config option has a concrete default, so a fresh block is always valid. */
export function blockConfigDefaults(block: BlockType): Record<string, ConfigValue> {
  const config: Record<string, ConfigValue> = {};
  for (const [name, option] of Object.entries(block.configSchema)) {
    config[name] = option.default;
  }
  return config;
}

function validateConfigValue(
  block: BlockType,
  name: string,
  value: ConfigValue,
): string | null {
  const option = block.configSchema[name];
  if (option === undefined) {
    return `${block.name}: unknown config option "${name}".`;
  }

  switch (option.kind) {
    case "enum":
      if (typeof value === "boolean" || !option.values.includes(value)) {
        return `${block.name}: ${option.label} must be one of ${option.values.join(", ")}.`;
      }
      return null;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return `${block.name}: ${option.label} must be a whole number.`;
      }
      if (value < option.min || value > option.max) {
        return `${block.name}: ${option.label} must be between ${String(option.min)} and ${String(option.max)}.`;
      }
      return null;
    case "boolean":
      if (typeof value !== "boolean") {
        return `${block.name}: ${option.label} must be true or false.`;
      }
      return null;
  }
}

/**
 * Merge a requested config with the block defaults, rejecting missing,
 * mistyped or out-of-range values with a message suitable for the status bar.
 */
export function normalizeBlockConfig(
  block: BlockType,
  requested: Readonly<Record<string, ConfigValue>>,
): ConfigResult {
  const config = blockConfigDefaults(block);
  for (const [name, value] of Object.entries(requested)) {
    const error = validateConfigValue(block, name, value);
    if (error !== null) {
      return { config, error };
    }
    config[name] = value;
  }

  for (const name of Object.keys(config)) {
    const value = config[name];
    if (value === undefined) {
      return { config, error: `${block.name}: missing config option "${name}".` };
    }
    const error = validateConfigValue(block, name, value);
    if (error !== null) {
      return { config, error };
    }
  }

  return { config, error: null };
}

export function formulaVariables(
  config: Readonly<Record<string, ConfigValue>>,
): FormulaVariables {
  return config;
}

/**
 * Evaluate the block's transistor count and logic depth for a config.
 * Formula errors are data errors; the UI turns them into a status message.
 */
export function blockStats(
  block: BlockType,
  config: Readonly<Record<string, ConfigValue>>,
  node: ProcessNode,
): BlockStats {
  const variables = formulaVariables(config);
  const transistors = compileFormula(block.transistors).evaluateNumber(variables);
  const logicDepth = compileFormula(block.logicDepth).evaluateNumber(variables);
  const rawTiles = Math.ceil(transistors / node.transistorsPerTile);
  const tileCount = Math.max(tuning.design.minBlockTiles, rawTiles);
  return { transistors, logicDepth, tileCount, w: 0, h: 0 };
}

/**
 * Fit a tile count into the requested aspect ratio. The height is derived
 * first, then the width is rounded up so the rectangle always covers the
 * transistor budget. Ratio 1 for 5 tiles gives 2x3, matching Section 7.2.
 */
export function fitBlockDimensions(
  tileCount: number,
  aspectRatio: number,
): { w: number; h: number } {
  if (!Number.isInteger(tileCount) || tileCount <= 0) {
    throw new Error(`Tile count must be a positive integer, received ${String(tileCount)}`);
  }
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new Error(`Aspect ratio must be positive, received ${String(aspectRatio)}`);
  }

  const idealHeight = Math.sqrt(tileCount / aspectRatio);
  const h = Math.max(1, Math.ceil(idealHeight - Number.EPSILON * 64));
  const w = Math.max(1, Math.ceil(tileCount / h - Number.EPSILON * 64));
  return { w, h };
}

export function defaultAspectRatio(): number {
  const first = tuning.design.aspectRatios[0];
  if (first === undefined) {
    throw new Error("Tuning must define at least one block aspect ratio");
  }
  return first.ratio;
}

export function aspectRatioOptions(): readonly { label: string; ratio: number }[] {
  return tuning.design.aspectRatios;
}

/** Fully evaluate the footprint of a placed block, including its shape. */
export function footprint(
  block: BlockType,
  config: Readonly<Record<string, ConfigValue>>,
  node: ProcessNode,
  aspectRatio: number,
): BlockStats {
  const stats = blockStats(block, config, node);
  const shape = fitBlockDimensions(stats.tileCount, aspectRatio);
  return { ...stats, ...shape };
}
