import type { GameData } from "../../data/load";
import type { ConfigValue, Tuning } from "../../data/schemas";
import { resolveCustomInstructions } from "../isa/opcode";
import { clampVdd, normalizeDesignSettings, normalizeIsaConfig } from "../isa/params";
import type { DesignSettings, IsaConfig } from "../isa/types";
import { footprint, normalizeBlockConfig } from "./blocks";
import {
  changedDesign,
  unchangedDesign,
  type DesignCommandResult,
} from "./commandResult";
import { validateDesignGeometry } from "./floorplan";
import type { ChipDesign, PlacedBlock } from "./types";

export interface DesignContentInput {
  nodeId: string;
  packageId: string;
  dieW: number;
  dieH: number;
  blocks: readonly PlacedBlock[];
  /** Optional architecture content, e.g. applying a historical preset. */
  isa?: IsaConfig;
  settings?: DesignSettings;
  customInstructions?: readonly string[];
}

function isEdgeOnly(data: GameData, typeId: string): boolean {
  return data.blockById[typeId]?.edgeOnly === true;
}

function contentKey(design: ChipDesign): string {
  return JSON.stringify({
    nodeId: design.nodeId,
    packageId: design.packageId,
    dieW: design.dieW,
    dieH: design.dieH,
    pipelinedLinks: design.pipelinedLinks,
    isa: design.isa,
    settings: design.settings,
    customInstructions: design.customInstructions,
    blocks: design.blocks.map((block) => ({
      uid: block.uid,
      typeId: block.typeId,
      config: Object.keys(block.config)
        .sort()
        .map((name) => [name, block.config[name] as ConfigValue]),
      x: block.x,
      y: block.y,
      w: block.w,
      h: block.h,
      rotated: block.rotated,
      locked: block.locked,
      region: block.region ?? null,
    })),
  });
}

/** Atomic application of a generated (preset) design. */
export function applyDesignContent(
  design: ChipDesign,
  content: DesignContentInput,
  data: GameData,
  tuning: Tuning,
): DesignCommandResult {
  const node = data.nodeById[content.nodeId];
  if (node === undefined) {
    return unchangedDesign(design, `Unknown process node "${content.nodeId}".`);
  }
  if (data.packageById[content.packageId] === undefined) {
    return unchangedDesign(design, `Unknown package "${content.packageId}".`);
  }
  if (
    !Number.isInteger(content.dieW) ||
    !Number.isInteger(content.dieH) ||
    content.dieW < tuning.design.minDieWidth ||
    content.dieW > tuning.design.maxDieWidth ||
    content.dieH < tuning.design.minDieHeight ||
    content.dieH > tuning.design.maxDieHeight
  ) {
    return unchangedDesign(
      design,
      `Die size must be ${String(tuning.design.minDieWidth)}-${String(tuning.design.maxDieWidth)} by ${String(tuning.design.minDieHeight)}-${String(tuning.design.maxDieHeight)} tiles.`,
    );
  }

  const seen = new Set<string>();
  const blocks: PlacedBlock[] = [];
  for (const block of content.blocks) {
    if (seen.has(block.uid)) {
      return unchangedDesign(design, `Block "${block.uid}" appears twice in the design.`);
    }
    seen.add(block.uid);
    const type = data.blockById[block.typeId];
    if (type === undefined) {
      return unchangedDesign(design, `Unknown block type "${block.typeId}".`);
    }
    const normalized = normalizeBlockConfig(type, block.config);
    if (normalized.error !== null) {
      return unchangedDesign(design, normalized.error);
    }
    const validShapes = tuning.design.aspectRatios.flatMap((option) => {
      const shape = footprint(type, normalized.config, node, option.ratio);
      return [
        `${String(shape.w)}x${String(shape.h)}`,
        `${String(shape.h)}x${String(shape.w)}`,
      ];
    });
    if (!validShapes.includes(`${String(block.w)}x${String(block.h)}`)) {
      return unchangedDesign(
        design,
        `${type.name} has an invalid ${String(block.w)}x${String(block.h)} footprint for its config.`,
      );
    }
    blocks.push({
      uid: block.uid,
      typeId: block.typeId,
      config: normalized.config,
      x: block.x,
      y: block.y,
      w: block.w,
      h: block.h,
      rotated: block.rotated,
      locked: block.locked,
      ...(block.region === undefined ? {} : { region: block.region }),
    });
  }

  const isa = content.isa ?? design.isa;
  const normalizedIsa = normalizeIsaConfig(isa, data, tuning);
  if (normalizedIsa.error !== null) {
    return unchangedDesign(design, normalizedIsa.error);
  }
  const settings =
    content.settings === undefined
      ? { ...design.settings, vdd: clampVdd(design.settings.vdd, node) }
      : content.settings;
  const normalizedSettings = normalizeDesignSettings(settings, node, tuning);
  if (normalizedSettings.error !== null) {
    return unchangedDesign(design, normalizedSettings.error);
  }
  const customIds = content.customInstructions ?? design.customInstructions;
  const resolvedCustom = resolveCustomInstructions(customIds, data);
  if (resolvedCustom.error !== null) {
    return unchangedDesign(design, resolvedCustom.error);
  }

  const candidate: ChipDesign = {
    ...design,
    nodeId: content.nodeId,
    packageId: content.packageId,
    dieW: content.dieW,
    dieH: content.dieH,
    blocks,
    pipelinedLinks: [],
    isa: normalizedIsa.value,
    settings: normalizedSettings.value,
    customInstructions: [...customIds],
  };
  const error = validateDesignGeometry(candidate, (typeId) => isEdgeOnly(data, typeId));
  if (error !== null) {
    return unchangedDesign(design, `Design content is invalid: ${error}`);
  }
  if (contentKey(candidate) === contentKey(design)) {
    return unchangedDesign(design);
  }
  return changedDesign(candidate);
}

