import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import { buildContributors, type Contributor } from "../explain/why";
import type { ChipDesign } from "./types";
import type { PowerResult } from "../perf/power";

export interface ThermalOptions {
  ambientTempC?: number;
  iterations?: number;
  toleranceC?: number;
  lateralConductanceWPerC?: number;
  /** Package + cooling multiplier applied to the vertical conductance. */
  verticalConductanceScale?: number;
}

export interface BlockThermalContribution {
  uid: string;
  typeId: string;
  name: string;
  powerW: number;
  contributionC: number;
  share: number;
}

export interface ThermalResult {
  dieW: number;
  dieH: number;
  ambientC: number;
  packageId: string;
  packageName: string;
  maxJunctionTempC: number;
  tilePowerW: readonly number[];
  temperaturesC: readonly number[];
  hotspotC: number;
  averageC: number;
  marginC: number;
  overLimit: boolean;
  hotspotTile: { x: number; y: number };
  contributions: readonly BlockThermalContribution[];
  why: readonly Contributor[];
  iterations: number;
  converged: boolean;
}

interface ThermalGrid {
  current: Float64Array;
  next: Float64Array;
}

function stepGrid(
  grid: ThermalGrid,
  source: ArrayLike<number>,
  dieW: number,
  dieH: number,
  vertical: number,
  lateral: number,
  ambientTerm: number,
): number {
  let maxDelta = 0;
  for (let y = 0; y < dieH; y += 1) {
    for (let x = 0; x < dieW; x += 1) {
      const index = y * dieW + x;
      let neighborSum = 0;
      let neighborCount = 0;
      if (x > 0) {
        neighborSum += grid.current[index - 1] ?? 0;
        neighborCount += 1;
      }
      if (x + 1 < dieW) {
        neighborSum += grid.current[index + 1] ?? 0;
        neighborCount += 1;
      }
      if (y > 0) {
        neighborSum += grid.current[index - dieW] ?? 0;
        neighborCount += 1;
      }
      if (y + 1 < dieH) {
        neighborSum += grid.current[index + dieW] ?? 0;
        neighborCount += 1;
      }
      const denominator = vertical + neighborCount * lateral;
      const value =
        ((source[index] ?? 0) + ambientTerm + lateral * neighborSum) / denominator;
      grid.next[index] = value;
      maxDelta = Math.max(maxDelta, Math.abs(value - (grid.current[index] ?? 0)));
    }
  }
  const previous = grid.current;
  grid.current = grid.next;
  grid.next = previous;
  return maxDelta;
}

/**
 * Section 9.3: steady-state heat on the tile grid using Jacobi iteration.
 * The equation is linear, so one temperature-rise field per block gives an
 * exact "Why?" decomposition of the hotspot (contributions sum to the rise).
 */
export function analyzeThermal(
  design: ChipDesign,
  power: PowerResult,
  data: GameData,
  tuning: Tuning,
  options: ThermalOptions = {},
): ThermalResult {
  const pkg = data.packageById[design.packageId];
  if (pkg === undefined) {
    throw new Error(`Design ${design.id} references unknown package "${design.packageId}"`);
  }
  const ambientC = options.ambientTempC ?? tuning.physical.ambientTempC;
  const iterations = options.iterations ?? tuning.physical.thermalIterations;
  const toleranceC = options.toleranceC ?? tuning.physical.thermalToleranceC;
  const lateral = options.lateralConductanceWPerC ?? tuning.physical.lateralConductanceWPerC;
  const verticalScale = options.verticalConductanceScale ?? 1;
  if (!(verticalScale > 0)) {
    throw new Error(`Vertical conductance scale must be positive, received ${String(verticalScale)}`);
  }
  const vertical = pkg.gVerticalWPerC * verticalScale;
  const dieW = design.dieW;
  const dieH = design.dieH;
  const tileCount = dieW * dieH;

  const tilePower = new Float64Array(tileCount);
  const blockPowerByUid = new Map(power.blocks.map((block) => [block.uid, block]));
  const blockFields: { uid: string; field: ThermalGrid; source: Float64Array }[] = [];

  for (const block of design.blocks) {
    const blockPower = blockPowerByUid.get(block.uid);
    if (blockPower === undefined || blockPower.totalW <= 0) {
      continue;
    }
    const perTile = blockPower.totalW / (block.w * block.h);
    const source = new Float64Array(tileCount);
    for (let y = block.y; y < block.y + block.h; y += 1) {
      for (let x = block.x; x < block.x + block.w; x += 1) {
        const index = y * dieW + x;
        tilePower[index] = (tilePower[index] ?? 0) + perTile;
        source[index] = perTile;
      }
    }
    blockFields.push({
      uid: block.uid,
      field: {
        current: new Float64Array(tileCount),
        next: new Float64Array(tileCount),
      },
      source,
    });
  }

  const temperatures: ThermalGrid = {
    current: new Float64Array(tileCount).fill(ambientC),
    next: new Float64Array(tileCount).fill(ambientC),
  };
  let usedIterations = 0;
  let converged = true;

  if (tilePower.some((value) => value > 0)) {
    converged = false;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const delta = stepGrid(
        temperatures,
        tilePower,
        dieW,
        dieH,
        vertical,
        lateral,
        vertical * ambientC,
      );
      for (const block of blockFields) {
        stepGrid(block.field, block.source, dieW, dieH, vertical, lateral, 0);
      }
      usedIterations += 1;
      if (delta < toleranceC) {
        converged = true;
        break;
      }
    }
  }

  let hotspotC = -Infinity;
  let hotspotIndex = 0;
  let totalC = 0;
  for (let index = 0; index < tileCount; index += 1) {
    const value = temperatures.current[index] ?? ambientC;
    totalC += value;
    if (value > hotspotC) {
      hotspotC = value;
      hotspotIndex = index;
    }
  }

  const riseC = Math.max(0, hotspotC - ambientC);
  const blockContributions = blockFields
    .map((entry) => {
      const blockPower = blockPowerByUid.get(entry.uid);
      const contributionC = entry.field.current[hotspotIndex] ?? 0;
      return {
        uid: entry.uid,
        typeId: blockPower?.typeId ?? "",
        name: blockPower?.name ?? entry.uid,
        powerW: blockPower?.totalW ?? 0,
        contributionC,
        share: riseC > 0 ? contributionC / riseC : 0,
      };
    })
    .sort((a, b) => b.contributionC - a.contributionC);

  const why = buildContributors(
    blockContributions.map((entry) => ({
      label: entry.name,
      value: entry.contributionC,
      detail: `${(entry.powerW * 1000).toFixed(1)} mW block power`,
    })),
    { limit: 6, otherLabel: "Other heated blocks" },
  );

  return {
    dieW,
    dieH,
    ambientC,
    packageId: pkg.id,
    packageName: pkg.name,
    maxJunctionTempC: pkg.maxJunctionTempC,
    tilePowerW: Array.from(tilePower),
    temperaturesC: Array.from(temperatures.current),
    hotspotC,
    averageC: totalC / tileCount,
    marginC: pkg.maxJunctionTempC - hotspotC,
    overLimit: hotspotC > pkg.maxJunctionTempC,
    hotspotTile: {
      x: hotspotIndex % dieW,
      y: Math.floor(hotspotIndex / dieW),
    },
    contributions: blockContributions,
    why,
    iterations: usedIterations,
    converged,
  };
}
