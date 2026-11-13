import type { ProcessNode } from "../../data/schemas";
import type { ChipDesign, DesignLink, PlacedBlock } from "./types";

export interface PointMm {
  x: number;
  y: number;
}

export interface TilePoint {
  x: number;
  y: number;
}

/** Inclusive tile bounding box used by the RUDY estimate. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
}

export interface LinkGeometry {
  link: DesignLink;
  fromTile: TilePoint;
  toTile: TilePoint;
  fromMm: PointMm;
  toMm: PointMm;
  lengthMm: number;
  bbox: TileRect;
}

export function tileSizeMm(node: ProcessNode): number {
  return Math.sqrt(node.transistorsPerTile / node.densityTrPerMm2);
}

/** Tile-space center of a block (kept fractional to avoid grid bias). */
export function blockCenterTile(block: PlacedBlock): TilePoint {
  return { x: block.x + block.w / 2, y: block.y + block.h / 2 };
}

export function blockCenterMm(block: PlacedBlock, node: ProcessNode): PointMm {
  const center = blockCenterTile(block);
  const size = tileSizeMm(node);
  return { x: center.x * size, y: center.y * size };
}

/** Section 7.5: Manhattan distance in mm between tile centers. */
export function manhattanDistanceMm(a: PointMm, b: PointMm): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function linkBoundingBox(from: TilePoint, to: TilePoint): TileRect {
  const x0 = Math.floor(Math.min(from.x, to.x));
  const y0 = Math.floor(Math.min(from.y, to.y));
  const x1 = Math.floor(Math.max(from.x, to.x));
  const y1 = Math.floor(Math.max(from.y, to.y));
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function linkGeometries(
  design: ChipDesign,
  links: readonly DesignLink[],
  node: ProcessNode,
): LinkGeometry[] {
  const byUid = new Map(design.blocks.map((block) => [block.uid, block]));
  const geometries: LinkGeometry[] = [];

  for (const link of links) {
    const from = byUid.get(link.fromUid);
    const to = byUid.get(link.toUid);
    if (from === undefined || to === undefined) {
      throw new Error(`Link ${link.id} references a missing block`);
    }
    const fromTile = blockCenterTile(from);
    const toTile = blockCenterTile(to);
    const fromMm = blockCenterMm(from, node);
    const toMm = blockCenterMm(to, node);
    geometries.push({
      link,
      fromTile,
      toTile,
      fromMm,
      toMm,
      lengthMm: manhattanDistanceMm(fromMm, toMm),
      bbox: linkBoundingBox(fromTile, toTile),
    });
  }

  return geometries;
}

/** Center of the die in mm, used when no explicit clock source exists. */
export function dieCenterMm(design: ChipDesign, node: ProcessNode): PointMm {
  const size = tileSizeMm(node);
  return { x: (design.dieW / 2) * size, y: (design.dieH / 2) * size };
}
