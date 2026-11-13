import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import { createRngSet, type Rng } from "../core/rng";
import {
  createAutoPlaceContext,
  evaluateLayout,
  type AutoPlaceContext,
} from "./autoplaceCost";
import type {
  AutoPlaceMode,
  AutoPlaceOptions,
  AutoPlaceReason,
  AutoPlaceReport,
  AutoPlaceResult,
  LayoutCost,
} from "./autoplaceTypes";
import { isInsideRegion, overlaps } from "./floorplan";
import { buildPresetDesign } from "./presets";
import type { ChipDesign, PlacedBlock } from "./types";

interface AxisRange {
  minimum: number;
  maximum: number;
}

function axisRange(
  size: number,
  dieSize: number,
  regionStart: number | null,
  regionSize: number | null,
): AxisRange | null {
  const low = Math.max(0, regionStart ?? 0);
  const high = Math.min(dieSize - size, regionStart === null ? dieSize - size : regionStart + (regionSize ?? 0) - size);
  return high < low ? null : { minimum: low, maximum: high };
}

function allowedRanges(
  block: PlacedBlock,
  w: number,
  h: number,
  dieW: number,
  dieH: number,
): { x: AxisRange; y: AxisRange } | null {
  const region = block.region;
  const x = axisRange(w, dieW, region?.x ?? null, region?.w ?? null);
  const y = axisRange(h, dieH, region?.y ?? null, region?.h ?? null);
  if (x === null || y === null) {
    return null;
  }
  return { x, y };
}

function touchesDieEdge(
  placement: PlacedBlock,
  dieW: number,
  dieH: number,
): boolean {
  return (
    placement.x === 0 ||
    placement.y === 0 ||
    placement.x + placement.w === dieW ||
    placement.y + placement.h === dieH
  );
}

function clamp(value: number, range: AxisRange): number {
  return Math.min(range.maximum, Math.max(range.minimum, value));
}

/**
 * Propose one legal move. Edge-only blocks always land on an edge, and every
 * edge-only region touches an edge (enforced by the design commands).
 */
function proposePlacement(
  blocks: readonly PlacedBlock[],
  index: number,
  context: AutoPlaceContext,
  rng: Rng,
): PlacedBlock | null {
  const block = blocks[index];
  if (block === undefined) {
    return null;
  }
  const tuning = context.tuning;
  const dieW = context.dieSize.w;
  const dieH = context.dieSize.h;
  const type = context.data.blockById[block.typeId];
  if (type === undefined) {
    throw new Error(`Unknown block type "${block.typeId}"`);
  }

  const rotate =
    block.w !== block.h && rng.chance(tuning.autoplace.rotationChance);
  const w = rotate ? block.h : block.w;
  const h = rotate ? block.w : block.h;
  const ranges = allowedRanges(block, w, h, dieW, dieH);
  if (ranges === null) {
    return null;
  }

  let x: number;
  let y: number;
  if (type.edgeOnly === true) {
    const side = rng.nextInt(0, 4);
    if (side === 0 || side === 1) {
      y = side === 0 ? 0 : dieH - h;
      x = rng.nextInt(ranges.x.minimum, ranges.x.maximum + 1);
    } else {
      x = side === 2 ? 0 : dieW - w;
      y = rng.nextInt(ranges.y.minimum, ranges.y.maximum + 1);
    }
  } else if (rng.chance(tuning.autoplace.localMoveFraction)) {
    const radius = tuning.autoplace.localMoveRadiusTiles;
    x = clamp(block.x + rng.nextInt(-radius, radius + 1), ranges.x);
    y = clamp(block.y + rng.nextInt(-radius, radius + 1), ranges.y);
  } else {
    x = rng.nextInt(ranges.x.minimum, ranges.x.maximum + 1);
    y = rng.nextInt(ranges.y.minimum, ranges.y.maximum + 1);
  }

  if (x === block.x && y === block.y && !rotate) {
    return null;
  }

  const candidate: PlacedBlock = {
    ...block,
    x,
    y,
    w,
    h,
    rotated: rotate ? !block.rotated : block.rotated,
  };
  if (!touchesDieEdge(candidate, dieW, dieH) && type.edgeOnly === true) {
    return null;
  }
  if (block.region !== undefined && !isInsideRegion(block.region, candidate)) {
    return null;
  }
  for (let otherIndex = 0; otherIndex < blocks.length; otherIndex += 1) {
    if (otherIndex === index) {
      continue;
    }
    const other = blocks[otherIndex];
    if (other !== undefined && overlaps(candidate, other)) {
      return null;
    }
  }
  return candidate;
}

function buildReasons(
  cost: LayoutCost,
  context: AutoPlaceContext,
  blockCount: number,
  limit: number,
): AutoPlaceReason[] {
  const criticalLinks = context.links.filter((link) => link.timing === "critical").length;
  const entries: AutoPlaceReason[] = [];

  if (cost.wire > 0) {
    entries.push({
      label: "Critical wire budget",
      detail: `${cost.wireMmBits.toFixed(0)} mm·bits over ${String(criticalLinks)} critical links`,
      share: cost.cost > 0 ? cost.wire / cost.cost : 0,
    });
  }
  if (cost.congestion > 0) {
    entries.push({
      label: "Routing congestion",
      detail: `${String(cost.overflowTiles)} tile(s) over capacity`,
      share: cost.cost > 0 ? cost.congestion / cost.cost : 0,
    });
  }
  if (cost.heat > 0) {
    entries.push({
      label: "Thermal headroom",
      detail: `hotspot ${cost.hotspotC.toFixed(1)} °C vs target ${cost.targetTempC.toFixed(1)} °C`,
      share: cost.cost > 0 ? cost.heat / cost.cost : 0,
    });
  }
  if (cost.area > 0) {
    entries.push({
      label: "Compact footprint",
      detail: `${String(blockCount)} blocks span ${String(cost.boundingBoxAreaTiles)} tiles²`,
      share: cost.cost > 0 ? cost.area / cost.cost : 0,
    });
  }
  if (cost.edge > 0) {
    entries.push({
      label: "Edge-only rules",
      detail: `${String(cost.edgeViolations)} edge violation(s)`,
      share: cost.cost > 0 ? cost.edge / cost.cost : 0,
    });
  }

  return entries.sort((a, b) => b.share - a.share).slice(0, limit);
}

function movedBlockCount(before: readonly PlacedBlock[], after: readonly PlacedBlock[]): number {
  const beforeByUid = new Map(before.map((block) => [block.uid, block]));
  let moved = 0;
  for (const block of after) {
    const previous = beforeByUid.get(block.uid);
    if (
      previous === undefined ||
      previous.x !== block.x ||
      previous.y !== block.y ||
      previous.w !== block.w ||
      previous.h !== block.h ||
      previous.rotated !== block.rotated
    ) {
      moved += 1;
    }
  }
  return moved;
}

function sameDesignContent(before: ChipDesign, after: ChipDesign): boolean {
  if (
    before.nodeId !== after.nodeId ||
    before.packageId !== after.packageId ||
    before.dieW !== after.dieW ||
    before.dieH !== after.dieH ||
    before.blocks.length !== after.blocks.length
  ) {
    return false;
  }
  return before.blocks.every((block, index) => {
    const other = after.blocks[index];
    return (
      other !== undefined &&
      block.uid === other.uid &&
      block.typeId === other.typeId &&
      JSON.stringify(block.config) === JSON.stringify(other.config) &&
      block.x === other.x &&
      block.y === other.y &&
      block.w === other.w &&
      block.h === other.h &&
      block.rotated === other.rotated &&
      block.locked === other.locked &&
      JSON.stringify(block.region ?? null) === JSON.stringify(other.region ?? null)
    );
  });
}

/**
 * Section 7.8 auto-place: deterministic simulated annealing over free block
 * positions and rotations. Locked blocks are anchors; per-block regions limit
 * the legal rectangle. The search keeps the best layout it has seen.
 *
 * With `presetId`, the design is first rebuilt from a complete processor
 * preset (node, package, die and block set), then the same search runs.
 */
export function autoPlace(
  design: ChipDesign,
  data: GameData,
  tuning: Tuning,
  options: AutoPlaceOptions = {},
): AutoPlaceResult {
  const mode: AutoPlaceMode = options.mode ?? "performance";
  const seed = options.seed ?? tuning.autoplace.defaultSeed;
  const preset =
    options.presetId === undefined ? undefined : data.designPresetById[options.presetId];
  if (options.presetId !== undefined && preset === undefined) {
    throw new Error(`Unknown design preset "${options.presetId}"`);
  }
  const edaLevel = options.edaLevel ?? tuning.autoplace.defaultEdaLevel;
  if (!Number.isInteger(edaLevel) || edaLevel < 1) {
    throw new Error(`EDA level must be a positive integer, received ${String(edaLevel)}`);
  }
  const iterations =
    options.iterations ?? tuning.autoplace.baseIterations * edaLevel;
  if (!Number.isInteger(iterations) || iterations < 0) {
    throw new Error(`Auto-place iterations must be a non-negative integer, received ${String(iterations)}`);
  }

  const workingDesign =
    preset === undefined
      ? design
      : buildPresetDesign(preset, data, tuning, design);
  const context = createAutoPlaceContext(workingDesign, data, tuning, {
    mode,
    ...(options.thermalIterations === undefined
      ? {}
      : { thermalIterations: options.thermalIterations }),
  });
  const originalBlocks = workingDesign.blocks;
  let current = originalBlocks;
  let currentCost = evaluateLayout(context, current);
  let best = current;
  let bestCost = currentCost;
  const freeIndices = workingDesign.blocks
    .map((block, index) => (block.locked ? -1 : index))
    .filter((index) => index >= 0);
  const rng = createRngSet(seed).stream("autoplace");

  if (freeIndices.length > 0 && iterations > 0) {
    const initialTemperature =
      currentCost.cost * tuning.autoplace.initialTemperatureFraction;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const temperature =
        initialTemperature * Math.pow(tuning.autoplace.coolingRate, iteration);
      const freeIndex = rng.nextInt(0, freeIndices.length);
      const blockIndex = freeIndices[freeIndex];
      if (blockIndex === undefined) {
        continue;
      }

      let candidate: PlacedBlock | null = null;
      for (let attempt = 0; attempt < tuning.autoplace.attemptsPerIteration; attempt += 1) {
        candidate = proposePlacement(current, blockIndex, context, rng);
        if (candidate !== null) {
          break;
        }
      }
      if (candidate === null) {
        continue;
      }

      const candidateBlocks = current.slice();
      candidateBlocks[blockIndex] = candidate;
      const candidateCost = evaluateLayout(context, candidateBlocks);
      const delta = candidateCost.cost - currentCost.cost;
      const accepted =
        delta <= 0 || rng.next() < Math.exp(-delta / Math.max(temperature, Number.EPSILON));
      if (accepted) {
        current = candidateBlocks;
        currentCost = candidateCost;
        if (currentCost.cost < bestCost.cost) {
          best = current;
          bestCost = currentCost;
        }
      }
    }
  }

  const reportContext = createAutoPlaceContext(workingDesign, data, tuning, {
    mode,
    thermalIterations: tuning.physical.thermalIterations,
  });
  const reportInitial = evaluateLayout(reportContext, originalBlocks);
  let finalBlocks = best;
  let reportFinal = evaluateLayout(reportContext, best);
  // The search uses a cheaper thermal proxy. Never hand the player a layout
  // that is worse than their starting layout under the authoritative solve.
  if (reportFinal.cost > reportInitial.cost) {
    finalBlocks = originalBlocks;
    reportFinal = reportInitial;
  }
  const moved = movedBlockCount(originalBlocks, finalBlocks);
  const improvementPct =
    reportInitial.cost > 0
      ? ((reportInitial.cost - reportFinal.cost) / reportInitial.cost) * 100
      : 0;
  const report: AutoPlaceReport = {
    mode,
    seed,
    edaLevel,
    iterations,
    initialCost: reportInitial.cost,
    finalCost: reportFinal.cost,
    improvementPct,
    final: reportFinal,
    reasons: buildReasons(
      reportFinal,
      reportContext,
      finalBlocks.length,
      tuning.autoplace.reportReasons,
    ),
    presetId: preset?.id ?? null,
    presetName: preset?.name ?? null,
    lockedBlocks: workingDesign.blocks.filter((block) => block.locked).length,
    regionedBlocks: workingDesign.blocks.filter((block) => block.region !== undefined).length,
    movedBlocks: moved,
  };

  const resultDesign: ChipDesign = { ...workingDesign, blocks: finalBlocks };
  return {
    design: resultDesign,
    report,
    changed: !sameDesignContent(design, resultDesign),
  };
}
