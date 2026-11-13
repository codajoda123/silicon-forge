import type { GameData } from "../../data/load";
import type { DesignPreset } from "../../data/presetSchema";
import type { Tuning } from "../../data/schemas";
import { createDefaultIsaConfig, createDefaultSettings } from "../isa/defaults";
import { footprint, normalizeBlockConfig } from "./blocks";
import { isInsideDie, overlaps, touchesEdge, validateDesignGeometry } from "./floorplan";
import type { ChipDesign, PlacedBlock } from "./types";

export interface PresetBase {
  id: string;
  name: string;
}

interface Origin {
  x: number;
  y: number;
}

function candidatesFor(
  dieW: number,
  dieH: number,
  w: number,
  h: number,
  edgeOnly: boolean,
): Origin[] {
  const origins: Origin[] = [];
  if (edgeOnly) {
    for (let x = 0; x <= dieW - w; x += 1) {
      origins.push({ x, y: 0 });
      origins.push({ x, y: dieH - h });
    }
    for (let y = 0; y <= dieH - h; y += 1) {
      origins.push({ x: 0, y });
      origins.push({ x: dieW - w, y });
    }
    return origins;
  }
  for (let y = 0; y <= dieH - h; y += 1) {
    for (let x = 0; x <= dieW - w; x += 1) {
      origins.push({ x, y });
    }
  }
  return origins;
}

function placeSpec(
  preset: DesignPreset,
  data: GameData,
  tuning: Tuning,
  specIndex: number,
  placed: readonly PlacedBlock[],
  node: GameData["nodes"][number],
): PlacedBlock {
  const spec = preset.blocks[specIndex];
  if (spec === undefined) {
    throw new Error(`Preset ${preset.id} is missing block ${String(specIndex)}`);
  }
  const type = data.blockById[spec.typeId];
  if (type === undefined) {
    throw new Error(`Preset ${preset.id} references unknown block "${spec.typeId}"`);
  }
  const normalized = normalizeBlockConfig(type, spec.config);
  if (normalized.error !== null) {
    throw new Error(`Preset ${preset.id}: ${normalized.error}`);
  }
  const stats = footprint(
    type,
    normalized.config,
    node,
    spec.aspectRatio ?? tuning.design.aspectRatios[0]?.ratio ?? 1,
  );
  const origins = candidatesFor(
    preset.dieW,
    preset.dieH,
    stats.w,
    stats.h,
    type.edgeOnly === true,
  );
  for (const origin of origins) {
    const candidate: PlacedBlock = {
      uid: `block-${String(specIndex + 1)}`,
      typeId: type.id,
      config: normalized.config,
      x: origin.x,
      y: origin.y,
      w: stats.w,
      h: stats.h,
      rotated: false,
      locked: false,
    };
    const inside = isInsideDie({ dieW: preset.dieW, dieH: preset.dieH }, candidate);
    const edgeOk = type.edgeOnly !== true || touchesEdge({ dieW: preset.dieW, dieH: preset.dieH }, candidate);
    if (!inside || !edgeOk) {
      continue;
    }
    if (placed.some((other) => overlaps(candidate, other))) {
      continue;
    }
    return candidate;
  }
  throw new Error(
    `Preset ${preset.id}: ${type.name} (${String(stats.w)}x${String(stats.h)}) does not fit on the ${String(preset.dieW)}x${String(preset.dieH)} die`,
  );
}

/**
 * Build a complete preset design with a deterministic first-fit placement.
 * Auto-place then searches from this legal starting layout. Edge-only blocks
 * are packed first so their border space is reserved.
 */
export function buildPresetDesign(
  preset: DesignPreset,
  data: GameData,
  tuning: Tuning,
  base: PresetBase = { id: "design-1", name: preset.name },
): ChipDesign {
  const node = data.nodeById[preset.nodeId];
  if (node === undefined) {
    throw new Error(`Preset ${preset.id} references unknown node "${preset.nodeId}"`);
  }
  if (data.packageById[preset.packageId] === undefined) {
    throw new Error(`Preset ${preset.id} references unknown package "${preset.packageId}"`);
  }

  const order = preset.blocks
    .map((spec, index) => ({ spec, index }))
    .sort((a, b) => {
      const aEdge = data.blockById[a.spec.typeId]?.edgeOnly === true ? 0 : 1;
      const bEdge = data.blockById[b.spec.typeId]?.edgeOnly === true ? 0 : 1;
      return aEdge - bEdge || a.index - b.index;
    });

  const blocks: PlacedBlock[] = [];
  for (const entry of order) {
    blocks.push(placeSpec(preset, data, tuning, entry.index, blocks, node));
  }
  blocks.sort((a, b) => Number(a.uid.slice(6)) - Number(b.uid.slice(6)));

  const design: ChipDesign = {
    id: base.id,
    name: base.name,
    nodeId: preset.nodeId,
    packageId: preset.packageId,
    dieW: preset.dieW,
    dieH: preset.dieH,
    blocks,
    pipelinedLinks: [],
    isa: createDefaultIsaConfig(preset.historicalYear, data),
    settings: createDefaultSettings(node, tuning),
    customInstructions: [],
  };
  const error = validateDesignGeometry(
    design,
    (typeId) => data.blockById[typeId]?.edgeOnly === true,
  );
  if (error !== null) {
    throw new Error(`Preset ${preset.id} layout is invalid: ${error}`);
  }
  return design;
}
