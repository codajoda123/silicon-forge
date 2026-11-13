import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import { blockStats } from "./blocks";
import type { ChipDesign, DieAreaBreakdown, PinUsage } from "./types";

export function transistorCount(design: ChipDesign, data: GameData): number {
  let total = 0;
  for (const block of design.blocks) {
    const type = data.blockById[block.typeId];
    if (type === undefined) {
      throw new Error(`Design ${design.id} references unknown block type "${block.typeId}"`);
    }
    const node = data.nodeById[design.nodeId];
    if (node === undefined) {
      throw new Error(`Design ${design.id} references unknown node "${design.nodeId}"`);
    }
    total += blockStats(type, block.config, node).transistors;
  }
  return total;
}

export function tileUsage(design: ChipDesign): { used: number; whitespace: number; total: number } {
  const total = design.dieW * design.dieH;
  const used = design.blocks.reduce((sum, block) => sum + block.w * block.h, 0);
  return { used, whitespace: Math.max(0, total - used), total };
}

/**
 * Section 7.2 area: core tiles plus a pad ring whose area is perimeter × pad
 * depth, plus a scribe strip around the ring. Areas are in mm².
 */
export function dieAreaBreakdown(
  design: ChipDesign,
  data: GameData,
  tuning: Tuning,
): DieAreaBreakdown {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design ${design.id} references unknown node "${design.nodeId}"`);
  }

  const tileAreaMm2 = node.transistorsPerTile / node.densityTrPerMm2;
  const tileSizeMm = Math.sqrt(tileAreaMm2);
  const coreWmm = design.dieW * tileSizeMm;
  const coreHmm = design.dieH * tileSizeMm;
  const coreAreaMm2 = design.dieW * design.dieH * tileAreaMm2;

  const padDepth = tuning.design.padDepthMm;
  const padRingAreaMm2 = 2 * (coreWmm + coreHmm) * padDepth;

  const outerWmm = coreWmm + 2 * padDepth;
  const outerHmm = coreHmm + 2 * padDepth;
  const scribeAreaMm2 = 2 * (outerWmm + outerHmm) * tuning.design.scribeWidthMm;

  return {
    tileAreaMm2,
    tileSizeMm,
    coreAreaMm2,
    padRingAreaMm2,
    scribeAreaMm2,
    totalAreaMm2: coreAreaMm2 + padRingAreaMm2 + scribeAreaMm2,
  };
}

/**
 * Section 11.6: I/O pad configs define data/address/control pins; power and
 * ground pads are always required. Both package and perimeter can limit pads.
 */
export function pinUsage(
  design: ChipDesign,
  data: GameData,
  tuning: Tuning,
): PinUsage {
  let dataPins = 0;
  let addressPins = 0;
  let controlPins = 0;
  for (const block of design.blocks) {
    if (block.typeId !== "io-pads") {
      continue;
    }
    for (const [name, value] of Object.entries(block.config)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        continue;
      }
      if (name === "dataPins") {
        dataPins += value;
      } else if (name === "addressPins") {
        addressPins += value;
      } else if (name === "controlPins") {
        controlPins += value;
      }
    }
  }
  const pinsNeeded = dataPins + addressPins + controlPins + tuning.design.powerGroundPins;
  const multiplexedPinsNeeded =
    Math.max(dataPins, addressPins) + controlPins + tuning.design.powerGroundPins;
  const effectivePinsNeeded = design.settings.busMultiplexed
    ? multiplexedPinsNeeded
    : pinsNeeded;

  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design ${design.id} references unknown node "${design.nodeId}"`);
  }
  const pkg = data.packageById[design.packageId];
  if (pkg === undefined) {
    throw new Error(`Design ${design.id} references unknown package "${design.packageId}"`);
  }

  const tileSizeMm = Math.sqrt(node.transistorsPerTile / node.densityTrPerMm2);
  const perimeterMm = 2 * (design.dieW + design.dieH) * tileSizeMm;
  const perimeterCapacity = Math.floor(perimeterMm / tuning.design.padPitchMm);
  const capacity = Math.min(pkg.maxPins, perimeterCapacity);

  return {
    pinsNeeded,
    effectivePinsNeeded,
    multiplexedPinsNeeded,
    multiplexingSaves: pinsNeeded - multiplexedPinsNeeded,
    packageLimit: pkg.maxPins,
    perimeterCapacity,
    capacity,
    overflow: Math.max(0, effectivePinsNeeded - capacity),
    overflowWithoutMultiplexing: Math.max(0, pinsNeeded - capacity),
  };
}
