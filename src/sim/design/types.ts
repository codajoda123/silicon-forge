import type { ConfigValue, TimingClass } from "../../data/schemas";
import type { DesignSettings, IsaConfig } from "../isa/types";

/** Inclusive rectangle in whole tiles used as an auto-place constraint. */
export interface BlockRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A block instance on the floorplan. All coordinates are in whole tiles. */
export interface PlacedBlock {
  uid: string;
  typeId: string;
  config: Record<string, ConfigValue>;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  locked: boolean;
  /** Optional auto-place/manual-move constraint; absent means the whole die. */
  region?: BlockRegion;
}

/**
 * M2 stores the floorplan, M5 adds the architecture and design settings. The
 * package stays top-level because it predates the settings panel and is edited
 * from the designer toolbar.
 */
export interface ChipDesign {
  id: string;
  name: string;
  nodeId: string;
  packageId: string;
  dieW: number;
  dieH: number;
  blocks: PlacedBlock[];
  pipelinedLinks: string[];
  isa: IsaConfig;
  settings: DesignSettings;
  customInstructions: string[];
}

export interface BlockStats {
  transistors: number;
  logicDepth: number;
  /** Rectangular footprint in tiles (after applying minBlockTiles). */
  tileCount: number;
  w: number;
  h: number;
}

export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DesignLink {
  id: string;
  fromUid: string;
  fromTypeId: string;
  toUid: string;
  toTypeId: string;
  timing: TimingClass;
  widthBits: number;
}

export interface DieAreaBreakdown {
  tileAreaMm2: number;
  tileSizeMm: number;
  coreAreaMm2: number;
  padRingAreaMm2: number;
  scribeAreaMm2: number;
  totalAreaMm2: number;
}

export interface PinUsage {
  /** Raw data + address + control + power pins. */
  pinsNeeded: number;
  /** Effective count after the player's multiplexing choice. */
  effectivePinsNeeded: number;
  multiplexedPinsNeeded: number;
  multiplexingSaves: number;
  packageLimit: number;
  perimeterCapacity: number;
  capacity: number;
  overflow: number;
  /** Overflow that would remain with separate address and data buses. */
  overflowWithoutMultiplexing: number;
}
