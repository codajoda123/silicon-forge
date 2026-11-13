import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import { buildContributors, type Contributor } from "../explain/why";
import { linkGeometries, type LinkGeometry } from "./geometry";
import type { ChipDesign, DesignLink } from "./types";

export interface LinkDetour {
  linkId: string;
  averageOverflowRatio: number;
  detour: number;
}

export interface CongestionResult {
  dieW: number;
  dieH: number;
  capacityPerTile: number;
  demand: readonly number[];
  overflow: readonly number[];
  overflowRatio: readonly number[];
  maxOverflow: number;
  maxOverflowRatio: number;
  overflowTiles: number;
  totalOverflow: number;
  linkDetours: readonly LinkDetour[];
  why: readonly Contributor[];
}

function averageOverflowRatio(
  overflow: readonly number[],
  capacity: number,
  geometry: LinkGeometry,
  dieW: number,
): number {
  const { bbox } = geometry;
  let sum = 0;
  for (let y = bbox.y0; y <= bbox.y1; y += 1) {
    for (let x = bbox.x0; x <= bbox.x1; x += 1) {
      const index = y * dieW + x;
      const tileOverflow = overflow[index] ?? 0;
      sum += tileOverflow / capacity;
    }
  }
  return sum / (bbox.w * bbox.h);
}

/**
 * Section 7.5(d) RUDY estimate: each link adds b*(w+h)/(w*h) demand to every
 * tile in its inclusive bounding box. Tile capacity is metal layers × tracks.
 */
export function analyzeCongestion(
  design: ChipDesign,
  links: readonly DesignLink[],
  data: GameData,
  tuning: Tuning,
): CongestionResult {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design ${design.id} references unknown node "${design.nodeId}"`);
  }

  const tileCount = design.dieW * design.dieH;
  const demand = new Array<number>(tileCount).fill(0);
  const capacityPerTile = node.metalLayers * tuning.congestion.tracksPerTile;

  const geometries = linkGeometries(design, links, node);
  for (const geometry of geometries) {
    const { bbox } = geometry;
    const demandPerTile =
      (geometry.link.widthBits * (bbox.w + bbox.h)) / (bbox.w * bbox.h);
    for (let y = bbox.y0; y <= bbox.y1; y += 1) {
      for (let x = bbox.x0; x <= bbox.x1; x += 1) {
        const index = y * design.dieW + x;
        demand[index] = (demand[index] ?? 0) + demandPerTile;
      }
    }
  }

  const overflow = demand.map((value) => Math.max(0, value - capacityPerTile));
  const overflowRatio = overflow.map((value) => value / capacityPerTile);
  let maxOverflow = 0;
  let maxOverflowRatio = 0;
  let overflowTiles = 0;
  let totalOverflow = 0;
  for (const value of overflow) {
    maxOverflow = Math.max(maxOverflow, value);
    maxOverflowRatio = Math.max(maxOverflowRatio, value / capacityPerTile);
    if (value > 0) {
      overflowTiles += 1;
      totalOverflow += value;
    }
  }

  const linkDetours = geometries.map((geometry) => {
    const average = averageOverflowRatio(overflow, capacityPerTile, geometry, design.dieW);
    return {
      linkId: geometry.link.id,
      averageOverflowRatio: average,
      detour: 1 + tuning.congestion.detourPerOverflowRatio * average,
    };
  });

  const why = buildContributors(
    overflow
      .map((value, index) => ({
        label: `Tile ${String(index % design.dieW)},${String(Math.floor(index / design.dieW))}`,
        value,
        detail: `${(demand[index] ?? 0).toFixed(1)} demand / ${capacityPerTile.toFixed(0)} capacity`,
      }))
      .filter((entry) => entry.value > 0),
    { limit: 5, otherLabel: "Other congested tiles" },
  );

  return {
    dieW: design.dieW,
    dieH: design.dieH,
    capacityPerTile,
    demand,
    overflow,
    overflowRatio,
    maxOverflow,
    maxOverflowRatio,
    overflowTiles,
    totalOverflow,
    linkDetours,
    why,
  };
}
