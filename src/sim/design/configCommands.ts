import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import { isaConfigFromArchetype } from "../isa/defaults";
import { resolveCustomInstructions } from "../isa/opcode";
import { clampVdd, normalizeDesignSettings, normalizeIsaConfig } from "../isa/params";
import type { DesignSettings, IsaConfig } from "../isa/types";
import { footprint } from "./blocks";
import { changedDesign, unchangedDesign, type DesignCommandResult } from "./commandResult";
import { validateDesignGeometry } from "./floorplan";
import type { ChipDesign } from "./types";

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function applySetIsa(
  design: ChipDesign,
  isa: IsaConfig,
  data: GameData,
  tuning: Tuning,
): DesignCommandResult {
  const normalized = normalizeIsaConfig(isa, data, tuning);
  if (normalized.error !== null) {
    return unchangedDesign(design, normalized.error);
  }
  if (sameJson(normalized.value, design.isa)) {
    return unchangedDesign(design);
  }
  return changedDesign({ ...design, isa: normalized.value });
}

export function applySetIsaArchetype(
  design: ChipDesign,
  archetypeId: string,
  data: GameData,
  tuning: Tuning,
): DesignCommandResult {
  if (data.isaById[archetypeId] === undefined) {
    return unchangedDesign(design, `Unknown ISA archetype "${archetypeId}".`);
  }
  return applySetIsa(design, isaConfigFromArchetype(archetypeId, data), data, tuning);
}

export function applySetDesignSettings(
  design: ChipDesign,
  settings: DesignSettings,
  data: GameData,
  tuning: Tuning,
): DesignCommandResult {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    return unchangedDesign(design, `Design references unknown node "${design.nodeId}".`);
  }
  const normalized = normalizeDesignSettings(settings, node, tuning);
  if (normalized.error !== null) {
    return unchangedDesign(design, normalized.error);
  }
  if (sameJson(normalized.value, design.settings)) {
    return unchangedDesign(design);
  }
  return changedDesign({ ...design, settings: normalized.value });
}

export function applySetCustomInstructions(
  design: ChipDesign,
  ids: readonly string[],
  data: GameData,
): DesignCommandResult {
  const resolved = resolveCustomInstructions(ids, data);
  if (resolved.error !== null) {
    return unchangedDesign(design, resolved.error);
  }
  if (sameJson(ids, design.customInstructions)) {
    return unchangedDesign(design);
  }
  return changedDesign({ ...design, customInstructions: [...ids] });
}

/** Section 7.6: switching process node re-fits block footprints and Vdd. */
export function applySetNode(
  design: ChipDesign,
  nodeId: string,
  data: GameData,
): DesignCommandResult {
  const nextNode = data.nodeById[nodeId];
  if (nextNode === undefined) {
    return unchangedDesign(design, `Unknown process node "${nodeId}".`);
  }
  if (nextNode.id === design.nodeId) {
    return unchangedDesign(design);
  }
  const blocks = design.blocks.map((block) => {
    const blockType = data.blockById[block.typeId];
    if (blockType === undefined) {
      throw new Error(`Design references unknown block type "${block.typeId}"`);
    }
    const stats = footprint(blockType, block.config, nextNode, block.w / block.h);
    return { ...block, w: stats.w, h: stats.h };
  });
  const candidate: ChipDesign = {
    ...design,
    nodeId: nextNode.id,
    blocks,
    settings: {
      ...design.settings,
      vdd: clampVdd(design.settings.vdd, nextNode),
    },
  };
  const error = validateDesignGeometry(
    candidate,
    (typeId) => data.blockById[typeId]?.edgeOnly === true,
  );
  if (error !== null) {
    return unchangedDesign(design, `Cannot switch node: ${error}`);
  }
  return changedDesign(candidate);
}

export function applySetPackage(
  design: ChipDesign,
  packageId: string,
  data: GameData,
): DesignCommandResult {
  if (data.packageById[packageId] === undefined) {
    return unchangedDesign(design, `Unknown package "${packageId}".`);
  }
  if (packageId === design.packageId) {
    return unchangedDesign(design);
  }
  return changedDesign({ ...design, packageId });
}
