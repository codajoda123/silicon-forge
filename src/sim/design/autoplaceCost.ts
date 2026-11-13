import type { GameData } from "../../data/load";
import type { ChipPackage, ProcessNode, Tuning } from "../../data/schemas";
import { computeBlockPower, workloadShares } from "../perf/power";
import type { AutoPlaceMode, AutoPlaceWeights, LayoutCost } from "./autoplaceTypes";
import {
  blockCenterMm,
  blockCenterTile,
  linkBoundingBox,
  manhattanDistanceMm,
} from "./geometry";
import { generateLinks } from "./links";
import type { ChipDesign, DesignLink, PlacedBlock } from "./types";

export interface AutoPlaceContext {
  data: GameData;
  tuning: Tuning;
  node: ProcessNode;
  pkg: ChipPackage;
  dieSize: { w: number; h: number };
  links: readonly DesignLink[];
  weights: AutoPlaceWeights;
  /** Block power at a fixed scoring clock, so layouts are comparable. */
  powerFor: (block: PlacedBlock) => number;
  thermalIterations: number;
  targetTempC: number;
}

export interface AutoPlaceContextOptions {
  mode?: AutoPlaceMode;
  thermalIterations?: number;
}

export function autoPlaceWeights(tuning: Tuning, mode: AutoPlaceMode): AutoPlaceWeights {
  return tuning.autoplace.modes[mode];
}

/** Target junction temperature: a comfortable rise, capped below the package limit. */
export function autoPlaceTargetTempC(
  tuning: Tuning,
  pkg: ChipPackage,
): number {
  const comfortable = tuning.physical.ambientTempC + tuning.autoplace.thermalTargetRiseC;
  const belowLimit = pkg.maxJunctionTempC - tuning.autoplace.thermalTargetMarginC;
  return Math.max(tuning.physical.ambientTempC, Math.min(comfortable, belowLimit));
}

/**
 * Placement scoring uses one fixed clock so two different layouts are compared
 * on the same power budget. The real design clock arrives with M5 settings.
 */
export function createAutoPlaceContext(
  design: ChipDesign,
  data: GameData,
  tuning: Tuning,
  options: AutoPlaceContextOptions = {},
): AutoPlaceContext {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design ${design.id} references unknown node "${design.nodeId}"`);
  }
  const pkg = data.packageById[design.packageId];
  if (pkg === undefined) {
    throw new Error(`Design ${design.id} references unknown package "${design.packageId}"`);
  }
  const mode = options.mode ?? "performance";
  const workload = data.workloadById[tuning.power.referenceWorkloadId];
  if (workload === undefined) {
    throw new Error(`Unknown workload "${tuning.power.referenceWorkloadId}"`);
  }
  const shares = workloadShares(workload);
  const powerCache = new Map<string, number>();
  const powerFor = (block: PlacedBlock): number => {
    const key = `${block.typeId}|${Object.keys(block.config)
      .sort()
      .map((name) => `${name}:${JSON.stringify(block.config[name] ?? null)}`)
      .join(",")}`;
    const cached = powerCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const type = data.blockById[block.typeId];
    if (type === undefined) {
      throw new Error(`Unknown block type "${block.typeId}"`);
    }
    const value = computeBlockPower(
      type,
      block.config,
      node,
      shares,
      tuning.autoplace.scoringClockMHz,
      node.vddNominal,
      tuning,
    ).totalW;
    powerCache.set(key, value);
    return value;
  };

  return {
    data,
    tuning,
    node,
    pkg,
    dieSize: { w: design.dieW, h: design.dieH },
    links: generateLinks(design, data),
    weights: autoPlaceWeights(tuning, mode),
    powerFor,
    thermalIterations:
      options.thermalIterations ?? tuning.autoplace.searchThermalIterations,
    targetTempC: autoPlaceTargetTempC(tuning, pkg),
  };
}

function thermalHotspotC(
  blocks: readonly PlacedBlock[],
  context: AutoPlaceContext,
): number {
  const { tuning, pkg } = context;
  const dieW = context.dieSize.w;
  const dieH = context.dieSize.h;
  const tileCount = dieW * dieH;
  const source = new Float64Array(tileCount);
  let hasPower = false;

  for (const block of blocks) {
    const powerW = context.powerFor(block);
    if (powerW <= 0) {
      continue;
    }
    hasPower = true;
    const perTile = powerW / (block.w * block.h);
    for (let y = block.y; y < block.y + block.h; y += 1) {
      for (let x = block.x; x < block.x + block.w; x += 1) {
        const index = y * dieW + x;
        source[index] = (source[index] ?? 0) + perTile;
      }
    }
  }

  const ambient = tuning.physical.ambientTempC;
  if (!hasPower) {
    return ambient;
  }

  const vertical = pkg.gVerticalWPerC;
  const lateral = tuning.physical.lateralConductanceWPerC;
  let current = new Float64Array(tileCount);
  let next = new Float64Array(tileCount);

  for (let iteration = 0; iteration < context.thermalIterations; iteration += 1) {
    for (let y = 0; y < dieH; y += 1) {
      for (let x = 0; x < dieW; x += 1) {
        const index = y * dieW + x;
        let neighborSum = 0;
        let neighborCount = 0;
        if (x > 0) {
          neighborSum += current[index - 1] ?? 0;
          neighborCount += 1;
        }
        if (x + 1 < dieW) {
          neighborSum += current[index + 1] ?? 0;
          neighborCount += 1;
        }
        if (y > 0) {
          neighborSum += current[index - dieW] ?? 0;
          neighborCount += 1;
        }
        if (y + 1 < dieH) {
          neighborSum += current[index + dieW] ?? 0;
          neighborCount += 1;
        }
        next[index] =
          ((source[index] ?? 0) + lateral * neighborSum) /
          (vertical + neighborCount * lateral);
      }
    }
    const previous = current;
    current = next;
    next = previous;
  }

  let maximum = 0;
  for (let index = 0; index < tileCount; index += 1) {
    maximum = Math.max(maximum, current[index] ?? 0);
  }
  return ambient + maximum;
}

function linkDemand(
  blocks: readonly PlacedBlock[],
  context: AutoPlaceContext,
): { wireMmBits: number; demand: Float64Array; capacity: number } {
  const byUid = new Map(blocks.map((block) => [block.uid, block]));
  const dieW = context.dieSize.w;
  const dieH = context.dieSize.h;
  const demand = new Float64Array(dieW * dieH);
  let wireMmBits = 0;

  for (const link of context.links) {
    const from = byUid.get(link.fromUid);
    const to = byUid.get(link.toUid);
    if (from === undefined || to === undefined) {
      throw new Error(`Link ${link.id} references a missing block`);
    }
    const fromTile = blockCenterTile(from);
    const toTile = blockCenterTile(to);
    const lengthMm = manhattanDistanceMm(
      blockCenterMm(from, context.node),
      blockCenterMm(to, context.node),
    );
    const bbox = linkBoundingBox(fromTile, toTile);
    if (link.timing === "critical") {
      wireMmBits += lengthMm * link.widthBits;
    }
    const demandPerTile = (link.widthBits * (bbox.w + bbox.h)) / (bbox.w * bbox.h);
    for (let y = bbox.y0; y <= bbox.y1; y += 1) {
      for (let x = bbox.x0; x <= bbox.x1; x += 1) {
        const index = y * dieW + x;
        demand[index] = (demand[index] ?? 0) + demandPerTile;
      }
    }
  }

  const capacity = context.node.metalLayers * context.tuning.congestion.tracksPerTile;
  return { wireMmBits, demand, capacity };
}

function boundingBoxAreaTiles(blocks: readonly PlacedBlock[]): number {
  if (blocks.length === 0) {
    return 0;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const block of blocks) {
    minX = Math.min(minX, block.x);
    minY = Math.min(minY, block.y);
    maxX = Math.max(maxX, block.x + block.w);
    maxY = Math.max(maxY, block.y + block.h);
  }
  return (maxX - minX) * (maxY - minY);
}

/**
 * Section 7.8 cost for one placement. The search uses a coarse thermal proxy
 * for speed; the same function with more iterations is the scoring authority.
 */
export function evaluateLayout(
  context: AutoPlaceContext,
  blocks: readonly PlacedBlock[],
): LayoutCost {
  const { tuning } = context;
  const { wireMmBits, demand, capacity } = linkDemand(blocks, context);

  let totalOverflowTracks = 0;
  let overflowTiles = 0;
  for (const value of demand) {
    const overflow = Math.max(0, value - capacity);
    if (overflow > 0) {
      totalOverflowTracks += overflow;
      overflowTiles += 1;
    }
  }

  const hotspotC = thermalHotspotC(blocks, context);
  const heatAboveTargetC = Math.max(0, hotspotC - context.targetTempC);
  const bboxArea = boundingBoxAreaTiles(blocks);
  const dieArea = context.dieSize.w * context.dieSize.h;
  const edgeViolations = blocks.filter((block) => {
    const type = context.data.blockById[block.typeId];
    if (type?.edgeOnly !== true) {
      return false;
    }
    return !(
      block.x === 0 ||
      block.y === 0 ||
      block.x + block.w >= context.dieSize.w ||
      block.y + block.h >= context.dieSize.h
    );
  }).length;

  const wire =
    context.weights.wire * (wireMmBits / tuning.autoplace.wireScaleMmBits);
  const congestion =
    context.weights.congestion *
    (totalOverflowTracks / tuning.autoplace.congestionScaleTracks);
  const heat =
    context.weights.heat * (heatAboveTargetC / tuning.autoplace.heatScaleC);
  const area = context.weights.area * (dieArea > 0 ? bboxArea / dieArea : 0);
  const edge = context.weights.edge * edgeViolations * tuning.autoplace.edgePenalty;

  return {
    cost: wire + congestion + heat + area + edge,
    wire,
    congestion,
    heat,
    area,
    edge,
    wireMmBits,
    totalOverflowTracks,
    overflowTiles,
    hotspotC,
    targetTempC: context.targetTempC,
    boundingBoxAreaTiles: bboxArea,
    edgeViolations,
  };
}

/** Relative placement score: the reference scores 100 by construction. */
export function relativePlacementScore(
  referenceCost: number,
  candidateCost: number,
): number {
  if (!(referenceCost > 0) || !(candidateCost > 0)) {
    throw new Error("Placement costs must be positive to compute a relative score");
  }
  return (100 * referenceCost) / candidateCost;
}
