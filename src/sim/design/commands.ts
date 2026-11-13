import { getGameData, getTuning } from "../../data/gameData";
import type { GameData } from "../../data/load";
import type { ConfigValue } from "../../data/schemas";
import {
  aspectRatioOptions,
  blockConfigDefaults,
  defaultAspectRatio,
  footprint,
  normalizeBlockConfig,
} from "./blocks";
import {
  changedDesign as changed,
  unchangedDesign as unchanged,
  type DesignCommandResult,
} from "./commandResult";
import { nextBlockUid, validatePlacement } from "./floorplan";
import { applyDesignContent, type DesignContentInput } from "./contentCommands";
import {
  applyResizeDie,
  applySetBlockPlacements,
  applySetBlockRegion,
  type BlockPlacementInput,
} from "./layoutCommands";
import { generateLinks } from "./links";
import {
  applySetCustomInstructions,
  applySetDesignSettings,
  applySetIsa,
  applySetIsaArchetype,
  applySetNode,
  applySetPackage,
} from "./configCommands";
import type { DesignSettings, IsaConfig } from "../isa/types";
import type { BlockRegion, ChipDesign, PlacedBlock } from "./types";

const tuning = getTuning();

export type { BlockPlacementInput };

export type DesignCommand =
  | {
      type: "placeBlock";
      blockTypeId: string;
      x: number;
      y: number;
      aspectRatio?: number;
      config?: Readonly<Record<string, ConfigValue>>;
    }
  | { type: "moveBlock"; uid: string; x: number; y: number }
  | { type: "rotateBlock"; uid: string }
  | { type: "deleteBlock"; uid: string }
  | { type: "setBlockLocked"; uid: string; locked: boolean }
  | {
      type: "setBlockConfig";
      uid: string;
      config: Readonly<Record<string, ConfigValue>>;
      /** Optional shape change applied atomically with the config. */
      aspectRatio?: number;
    }
  | { type: "setBlockAspect"; uid: string; aspectRatio: number }
  | { type: "setBlockRegion"; uid: string; region: BlockRegion | null }
  | { type: "setBlockPlacements"; placements: readonly BlockPlacementInput[] }
  | ({ type: "applyDesignContent" } & DesignContentInput)
  | { type: "resizeDie"; dieW: number; dieH: number }
  | { type: "setNode"; nodeId: string }
  | { type: "setPackage"; packageId: string }
  | { type: "setLinkPipelined"; linkId: string; pipelined: boolean }
  | { type: "setIsa"; isa: IsaConfig }
  | { type: "setIsaArchetype"; archetypeId: string }
  | { type: "setDesignSettings"; settings: DesignSettings }
  | { type: "setCustomInstructions"; ids: readonly string[] }
  | { type: "renameDesign"; name: string };

function isEdgeOnly(data: GameData, typeId: string): boolean {
  return data.blockById[typeId]?.edgeOnly === true;
}

function findBlock(design: ChipDesign, uid: string): PlacedBlock | undefined {
  return design.blocks.find((block) => block.uid === uid);
}

function replaceBlock(design: ChipDesign, block: PlacedBlock): ChipDesign {
  return {
    ...design,
    blocks: design.blocks.map((current) => (current.uid === block.uid ? block : current)),
  };
}

function nodeFor(design: ChipDesign, data: GameData) {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design ${design.id} references unknown node "${design.nodeId}"`);
  }
  return node;
}

function validAspectRatio(ratio: number): boolean {
  return aspectRatioOptions().some((option) => option.ratio === ratio);
}

export function applyDesignCommand(
  design: ChipDesign,
  command: DesignCommand,
  data: GameData = getGameData(),
): DesignCommandResult {
  const node = nodeFor(design, data);

  switch (command.type) {
    case "placeBlock": {
      const blockType = data.blockById[command.blockTypeId];
      if (blockType === undefined) {
        return unchanged(design, `Unknown block type "${command.blockTypeId}".`);
      }
      const normalized = normalizeBlockConfig(blockType, command.config ?? {});
      if (normalized.error !== null) {
        return unchanged(design, normalized.error);
      }
      const aspectRatio = command.aspectRatio ?? defaultAspectRatio();
      if (!validAspectRatio(aspectRatio)) {
        return unchanged(design, `Unknown aspect ratio ${String(aspectRatio)}.`);
      }
      const stats = footprint(blockType, normalized.config, node, aspectRatio);
      const placement = {
        x: command.x,
        y: command.y,
        w: stats.w,
        h: stats.h,
      };
      const error = validatePlacement(design, placement, blockType.edgeOnly === true);
      if (error !== null) {
        return unchanged(design, error);
      }
      const placed: PlacedBlock = {
        uid: nextBlockUid(design),
        typeId: blockType.id,
        config: normalized.config,
        ...placement,
        rotated: false,
        locked: false,
      };
      return changed({ ...design, blocks: [...design.blocks, placed] });
    }

    case "moveBlock": {
      const block = findBlock(design, command.uid);
      if (block === undefined) {
        return unchanged(design, `Block "${command.uid}" does not exist.`);
      }
      if (block.locked) {
        return unchanged(design, "Block is locked. Unlock it before moving.");
      }
      const placement = { x: command.x, y: command.y, w: block.w, h: block.h };
      const error = validatePlacement(
        design,
        placement,
        isEdgeOnly(data, block.typeId),
        block.uid,
        block.region,
      );
      if (error !== null) {
        return unchanged(design, error);
      }
      if (block.x === placement.x && block.y === placement.y) {
        return unchanged(design);
      }
      return changed(replaceBlock(design, { ...block, ...placement }));
    }

    case "rotateBlock": {
      const block = findBlock(design, command.uid);
      if (block === undefined) {
        return unchanged(design, `Block "${command.uid}" does not exist.`);
      }
      if (block.locked) {
        return unchanged(design, "Block is locked. Unlock it before rotating.");
      }
      const placement = { x: block.x, y: block.y, w: block.h, h: block.w };
      const error = validatePlacement(
        design,
        placement,
        isEdgeOnly(data, block.typeId),
        block.uid,
        block.region,
      );
      if (error !== null) {
        return unchanged(design, error);
      }
      return changed(
        replaceBlock(design, {
          ...block,
          ...placement,
          rotated: !block.rotated,
        }),
      );
    }

    case "deleteBlock": {
      const block = findBlock(design, command.uid);
      if (block === undefined) {
        return unchanged(design, `Block "${command.uid}" does not exist.`);
      }
      if (block.locked) {
        return unchanged(design, "Block is locked. Unlock it before deleting.");
      }
      return changed({
        ...design,
        blocks: design.blocks.filter((current) => current.uid !== command.uid),
      });
    }

    case "setBlockLocked": {
      const block = findBlock(design, command.uid);
      if (block === undefined) {
        return unchanged(design, `Block "${command.uid}" does not exist.`);
      }
      if (block.locked === command.locked) {
        return unchanged(design);
      }
      return changed(replaceBlock(design, { ...block, locked: command.locked }));
    }

    case "setBlockConfig": {
      const block = findBlock(design, command.uid);
      if (block === undefined) {
        return unchanged(design, `Block "${command.uid}" does not exist.`);
      }
      if (block.locked) {
        return unchanged(design, "Block is locked. Unlock it before changing its config.");
      }
      const blockType = data.blockById[block.typeId];
      if (blockType === undefined) {
        return unchanged(design, `Unknown block type "${block.typeId}".`);
      }
      const normalized = normalizeBlockConfig(blockType, command.config);
      if (normalized.error !== null) {
        return unchanged(design, normalized.error);
      }
      const aspectRatio = command.aspectRatio ?? block.w / block.h;
      if (command.aspectRatio !== undefined && !validAspectRatio(command.aspectRatio)) {
        return unchanged(design, `Unknown aspect ratio ${String(command.aspectRatio)}.`);
      }
      const stats = footprint(blockType, normalized.config, node, aspectRatio);
      const placement = { x: block.x, y: block.y, w: stats.w, h: stats.h };
      const error = validatePlacement(
        design,
        placement,
        blockType.edgeOnly === true,
        block.uid,
        block.region,
      );
      if (error !== null) {
        return unchanged(design, error);
      }
      return changed(
        replaceBlock(design, {
          ...block,
          config: normalized.config,
          ...placement,
          rotated: command.aspectRatio === undefined ? block.rotated : false,
        }),
      );
    }

    case "setBlockAspect": {
      const block = findBlock(design, command.uid);
      if (block === undefined) {
        return unchanged(design, `Block "${command.uid}" does not exist.`);
      }
      if (block.locked) {
        return unchanged(design, "Block is locked. Unlock it before changing its shape.");
      }
      if (!validAspectRatio(command.aspectRatio)) {
        return unchanged(design, `Unknown aspect ratio ${String(command.aspectRatio)}.`);
      }
      const blockType = data.blockById[block.typeId];
      if (blockType === undefined) {
        return unchanged(design, `Unknown block type "${block.typeId}".`);
      }
      const stats = footprint(blockType, block.config, node, command.aspectRatio);
      const placement = { x: block.x, y: block.y, w: stats.w, h: stats.h };
      const error = validatePlacement(
        design,
        placement,
        blockType.edgeOnly === true,
        block.uid,
        block.region,
      );
      if (error !== null) {
        return unchanged(design, error);
      }
      return changed(replaceBlock(design, { ...block, ...placement, rotated: false }));
    }

    case "setBlockRegion": {
      return applySetBlockRegion(design, command.uid, command.region, data);
    }

    case "setBlockPlacements": {
      return applySetBlockPlacements(design, command.placements, data);
    }

    case "applyDesignContent": {
      return applyDesignContent(design, command, data, tuning);
    }

    case "resizeDie": {
      return applyResizeDie(design, command.dieW, command.dieH, data, tuning);
    }

    case "setNode": {
      return applySetNode(design, command.nodeId, data);
    }

    case "setPackage": {
      return applySetPackage(design, command.packageId, data);
    }

    case "setLinkPipelined": {
      const link = generateLinks(design, data).find(
        (candidate) => candidate.id === command.linkId,
      );
      if (link === undefined) {
        return unchanged(design, `Link "${command.linkId}" does not exist.`);
      }
      if (link.timing !== "critical") {
        return unchanged(design, "Only critical links can be pipelined.");
      }
      const current = design.pipelinedLinks.includes(command.linkId);
      if (current === command.pipelined) {
        return unchanged(design);
      }
      return changed({
        ...design,
        pipelinedLinks: command.pipelined
          ? [...design.pipelinedLinks, command.linkId]
          : design.pipelinedLinks.filter((id) => id !== command.linkId),
      });
    }

    case "setIsa": {
      return applySetIsa(design, command.isa, data, tuning);
    }

    case "setIsaArchetype": {
      return applySetIsaArchetype(design, command.archetypeId, data, tuning);
    }

    case "setDesignSettings": {
      return applySetDesignSettings(design, command.settings, data, tuning);
    }

    case "setCustomInstructions": {
      return applySetCustomInstructions(design, command.ids, data);
    }

    case "renameDesign": {
      const name = command.name.trim().slice(0, tuning.design.nameMaxLength);
      if (name.length === 0) {
        return unchanged(design, "Project name cannot be empty.");
      }
      if (name === design.name) {
        return unchanged(design);
      }
      return changed({ ...design, name });
    }
  }
}

export function emptyDesignConfig(blockTypeId: string): Record<string, ConfigValue> {
  const data = getGameData();
  const block = data.blockById[blockTypeId];
  if (block === undefined) {
    throw new Error(`Unknown block type "${blockTypeId}"`);
  }
  return blockConfigDefaults(block);
}
