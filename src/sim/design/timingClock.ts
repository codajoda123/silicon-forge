import type { GameData } from "../../data/load";
import {
  blockCenterMm,
  dieCenterMm,
  manhattanDistanceMm,
  type PointMm,
} from "./geometry";
import type { ClockSource } from "./timingTypes";
import type { ChipDesign, PlacedBlock } from "./types";

/**
 * Section 7.5(f): one global clock. Prefer an on-chip clock generator, then the
 * best-placed I/O block, then the die centre. Skew grows with the farthest block.
 */
export function clockSourceFor(
  design: ChipDesign,
  node: GameData["nodes"][number],
): ClockSource {
  const clocked = design.blocks.filter((block) => block.typeId === "clock-generator");
  const pads = design.blocks.filter((block) => block.typeId === "io-pads");

  const distanceFrom = (point: PointMm): number => {
    let maximum = 0;
    for (const block of design.blocks) {
      maximum = Math.max(maximum, manhattanDistanceMm(point, blockCenterMm(block, node)));
    }
    return maximum;
  };

  if (clocked.length > 0) {
    const block = clocked[0];
    if (block === undefined) {
      throw new Error("Clock-generator list unexpectedly empty");
    }
    const point = blockCenterMm(block, node);
    return {
      kind: "clock-generator",
      uid: block.uid,
      distanceMm: distanceFrom(point),
    };
  }

  if (pads.length > 0) {
    let best: { block: PlacedBlock; point: PointMm; distance: number } | undefined;
    for (const block of pads) {
      const point = blockCenterMm(block, node);
      const distance = distanceFrom(point);
      if (best === undefined || distance < best.distance) {
        best = { block, point, distance };
      }
    }
    if (best !== undefined) {
      return {
        kind: "io-pads",
        uid: best.block.uid,
        distanceMm: best.distance,
      };
    }
  }

  return {
    kind: "die-center",
    uid: null,
    distanceMm: distanceFrom(dieCenterMm(design, node)),
  };
}
