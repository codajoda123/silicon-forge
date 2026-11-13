import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import type { Rng } from "../core/rng";
import type { ChipDesign, PlacedBlock } from "../design/types";
import { sampleNegativeBinomial, sampleNormal } from "./statistics";
import { skuQualifies } from "./skus";
import type { Sku } from "./types";

export const SCRAP_BIN = "scrap";

export interface BinningInput {
  design: ChipDesign;
  data: GameData;
  tuning: Tuning;
  skus: readonly Sku[];
  d0PerCm2: number;
  designFrequencyMHz: number;
  sigmaFreq: number;
  powerAtDesignW: number;
  escapeRate: number;
  sampleSize?: number;
}

export interface BinningSample {
  sampleDies: number;
  counts: Record<string, number>;
  shares: Record<string, number>;
  scrapCount: number;
  deadCount: number;
  goodCount: number;
  yieldFraction: number;
  escapedDiesSample: number;
}

function blockIndexAtTile(design: ChipDesign): {
  tileMap: Int32Array;
  blocks: readonly PlacedBlock[];
} {
  const tileCount = design.dieW * design.dieH;
  const tileMap = new Int32Array(tileCount);
  tileMap.fill(-1);
  design.blocks.forEach((block, index) => {
    for (let y = block.y; y < block.y + block.h; y += 1) {
      for (let x = block.x; x < block.x + block.w; x += 1) {
        if (x >= 0 && x < design.dieW && y >= 0 && y < design.dieH) {
          tileMap[y * design.dieW + x] = index;
        }
      }
    }
  });
  return { tileMap, blocks: design.blocks };
}

/**
 * Section 11.3 per-die Monte Carlo. Every sampled die is either assigned to
 * exactly one SKU or to scrap, so the returned shares sum to 1.
 */
export function runBinning(rng: Rng, input: BinningInput): BinningSample {
  const tuning = input.tuning;
  const defectConfig = tuning.manufacturing.waferDefect;
  const sampleSize = input.sampleSize ?? defectConfig.monteCarloDies;
  const { tileMap, blocks } = blockIndexAtTile(input.design);
  const node = input.data.nodeById[input.design.nodeId];
  if (node === undefined) {
    throw new Error(`Design references unknown node "${input.design.nodeId}"`);
  }
  const tileAreaMm2 = node.transistorsPerTile / node.densityTrPerMm2;
  const areaCm2 = (input.design.dieW * input.design.dieH * tileAreaMm2) / 100;

  const enabledByDefault = new Set<string>();
  const disableableByBlock = new Map<string, string>();
  const spareRows = new Map<string, number>();
  for (const block of blocks) {
    const type = input.data.blockById[block.typeId];
    if (type === undefined) {
      throw new Error(`Design references unknown block type "${block.typeId}"`);
    }
    enabledByDefault.add(block.typeId);
    if (type.disableable === true) {
      disableableByBlock.set(block.uid, block.typeId);
    }
    if (type.repairable === true && input.design.settings.spareRows) {
      spareRows.set(block.uid, defectConfig.spareRowsPerArray);
    }
  }

  const counts: Record<string, number> = {};
  for (const sku of input.skus) {
    counts[sku.id] = 0;
  }
  const quota = new Map<string, number>();
  for (const sku of input.skus) {
    quota.set(
      sku.id,
      sku.allocationTarget === null ? Number.POSITIVE_INFINITY : sku.allocationTarget * sampleSize,
    );
  }
  const sortedSkus = [...input.skus].sort(
    (a, b) => b.price - a.price || a.id.localeCompare(b.id),
  );

  let scrapCount = 0;
  let deadCount = 0;
  const groupPowerExponent = tuning.manufacturing.waferDefect.powerFrequencyExponent;

  for (let die = 0; die < sampleSize; die += 1) {
    const defectCount = sampleNegativeBinomial(
      rng,
      areaCm2 * input.d0PerCm2,
      defectConfig.clusteringAlpha,
    );
    const localSpares = new Map(spareRows);
    const disabledUids = new Set<string>();
    let dead = false;

    for (let defect = 0; defect < defectCount; defect += 1) {
      const tileIndex = rng.nextInt(0, Math.max(1, tileMap.length));
      const blockIndex = tileMap[tileIndex] ?? -1;
      if (blockIndex < 0) {
        if (!rng.chance(defectConfig.whitespaceHarmlessChance)) {
          dead = true;
          break;
        }
        continue;
      }
      const block = blocks[blockIndex];
      if (block === undefined) {
        continue;
      }
      const type = input.data.blockById[block.typeId];
      if (type === undefined) {
        continue;
      }
      const remainingSpares = localSpares.get(block.uid) ?? 0;
      if (type.repairable === true && remainingSpares > 0) {
        localSpares.set(block.uid, remainingSpares - 1);
        continue;
      }
      if (type.disableable === true && !disabledUids.has(block.uid)) {
        disabledUids.add(block.uid);
        continue;
      }
      dead = true;
      break;
    }

    if (dead) {
      deadCount += 1;
      scrapCount += 1;
      continue;
    }

    const frequencyMHz = Math.max(
      defectConfig.minimumFrequencyMHz,
      sampleNormal(
        rng,
        input.designFrequencyMHz,
        Math.max(0, input.sigmaFreq) * input.designFrequencyMHz,
      ),
    );
    const powerW =
      input.powerAtDesignW *
      Math.pow(
        frequencyMHz / Math.max(defectConfig.minimumFrequencyMHz, input.designFrequencyMHz),
        groupPowerExponent,
      );

    const disabledTypes = new Set<string>();
    for (const uid of disabledUids) {
      const typeId = disableableByBlock.get(uid);
      if (typeId !== undefined) {
        disabledTypes.add(typeId);
      }
    }
    const enabledTypes = new Set(enabledByDefault);
    for (const typeId of disabledTypes) {
      enabledTypes.delete(typeId);
    }

    const qualifiers = sortedSkus.filter((sku) =>
      skuQualifies(sku, {
        frequencyMHz,
        powerW,
        enabledBlockTypes: enabledTypes,
        disabledBlockTypes: disabledTypes,
      }),
    );
    if (qualifiers.length === 0) {
      scrapCount += 1;
      continue;
    }

    const targeted = qualifiers.find((sku) => {
      const limit = quota.get(sku.id) ?? Number.POSITIVE_INFINITY;
      return Number.isFinite(limit) && (counts[sku.id] ?? 0) < limit;
    });
    const chosen =
      targeted ??
      qualifiers.find((sku) => sku.allocationTarget === null) ??
      qualifiers[0];
    if (chosen === undefined) {
      scrapCount += 1;
      continue;
    }
    counts[chosen.id] = (counts[chosen.id] ?? 0) + 1;
  }

  const shares: Record<string, number> = { [SCRAP_BIN]: scrapCount / sampleSize };
  for (const sku of input.skus) {
    shares[sku.id] = (counts[sku.id] ?? 0) / sampleSize;
  }
  const goodCount = sampleSize - scrapCount;
  return {
    sampleDies: sampleSize,
    counts,
    shares,
    scrapCount,
    deadCount,
    goodCount,
    yieldFraction: goodCount / sampleSize,
    escapedDiesSample: Math.round(deadCount * input.escapeRate),
  };
}

/**
 * Scale sampled bins to the real wafer count with largest-remainder rounding,
 * so inventory counts still add up to the exact number of dies started.
 */
export function scaleBinningCounts(
  sampleCounts: Readonly<Record<string, number>>,
  sampleDies: number,
  totalDies: number,
): Record<string, number> {
  const entries = Object.entries(sampleCounts);
  if (sampleDies <= 0 || totalDies <= 0 || entries.length === 0) {
    return Object.fromEntries(entries.map(([key]) => [key, 0]));
  }
  const scaled = entries.map(([key, value], index) => {
    const exact = (value / sampleDies) * totalDies;
    return { key, value: Math.floor(exact), fraction: exact - Math.floor(exact), index };
  });
  let remaining = totalDies - scaled.reduce((sum, entry) => sum + entry.value, 0);
  const order = [...scaled].sort(
    (a, b) => b.fraction - a.fraction || a.index - b.index,
  );
  let cursor = 0;
  while (remaining > 0 && order.length > 0) {
    const entry = order[cursor % order.length];
    if (entry !== undefined) {
      entry.value += 1;
      remaining -= 1;
    }
    cursor += 1;
  }
  const result: Record<string, number> = {};
  for (const entry of scaled) {
    result[entry.key] = entry.value;
  }
  return result;
}