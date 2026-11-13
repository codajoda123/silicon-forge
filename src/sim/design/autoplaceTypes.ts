import type { ChipDesign } from "./types";

/** Auto-place modes from Section 7.8. */
export type AutoPlaceMode = "performance" | "thermal" | "area";

export const AUTO_PLACE_MODES: readonly AutoPlaceMode[] = [
  "performance",
  "thermal",
  "area",
];

export interface AutoPlaceWeights {
  wire: number;
  congestion: number;
  heat: number;
  area: number;
  edge: number;
}

export interface AutoPlaceOptions {
  mode?: AutoPlaceMode;
  seed?: number;
  /** Optional processor preset: rebuild the design before annealing. */
  presetId?: string;
  /** EDA research level; iteration budget = baseIterations × edaLevel. */
  edaLevel?: number;
  /** Test/tooling override for the iteration budget. */
  iterations?: number;
  /** Test/tooling override for the coarse thermal iterations used during search. */
  thermalIterations?: number;
}

export interface LayoutCost {
  /** Weighted total, in normalized cost points. Lower is better. */
  cost: number;
  /** Weighted contribution of each term (they sum to `cost`). */
  wire: number;
  congestion: number;
  heat: number;
  area: number;
  edge: number;
  /** Raw measurements before weights and normalization. */
  wireMmBits: number;
  totalOverflowTracks: number;
  overflowTiles: number;
  hotspotC: number;
  targetTempC: number;
  boundingBoxAreaTiles: number;
  edgeViolations: number;
}

export interface AutoPlaceReason {
  label: string;
  detail: string;
  /** Share of the final weighted cost, 0..1. */
  share: number;
}

export interface AutoPlaceReport {
  mode: AutoPlaceMode;
  seed: number;
  edaLevel: number;
  iterations: number;
  initialCost: number;
  finalCost: number;
  improvementPct: number;
  final: LayoutCost;
  reasons: readonly AutoPlaceReason[];
  presetId: string | null;
  presetName: string | null;
  lockedBlocks: number;
  regionedBlocks: number;
  movedBlocks: number;
}

export interface AutoPlaceResult {
  design: ChipDesign;
  report: AutoPlaceReport;
  changed: boolean;
}
