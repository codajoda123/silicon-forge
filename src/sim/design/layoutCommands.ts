import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import {
  changedDesign,
  unchangedDesign,
  type DesignCommandResult,
} from "./commandResult";
import {
  isInsideDie,
  isInsideRegion,
  regionTouchesEdge,
  validateDesignGeometry,
} from "./floorplan";
import type { BlockRegion, ChipDesign, PlacedBlock } from "./types";

export interface BlockPlacementInput {
  uid: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

function isEdgeOnly(data: GameData, typeId: string): boolean {
  return data.blockById[typeId]?.edgeOnly === true;
}

function replaceBlock(design: ChipDesign, block: PlacedBlock): ChipDesign {
  return {
    ...design,
    blocks: design.blocks.map((current) => (current.uid === block.uid ? block : current)),
  };
}

export function applySetBlockRegion(
  design: ChipDesign,
  uid: string,
  region: BlockRegion | null,
  data: GameData,
): DesignCommandResult {
  const block = design.blocks.find((candidate) => candidate.uid === uid);
  if (block === undefined) {
    return unchangedDesign(design, `Block "${uid}" does not exist.`);
  }
  if (region === null) {
    if (block.region === undefined) {
      return unchangedDesign(design);
    }
    const withoutRegion: PlacedBlock = { ...block };
    delete withoutRegion.region;
    return changedDesign(replaceBlock(design, withoutRegion));
  }
  if (
    !Number.isInteger(region.x) ||
    !Number.isInteger(region.y) ||
    !Number.isInteger(region.w) ||
    !Number.isInteger(region.h) ||
    region.w <= 0 ||
    region.h <= 0
  ) {
    return unchangedDesign(design, "The auto-place region must be a whole-tile rectangle.");
  }
  if (!isInsideDie(design, region)) {
    return unchangedDesign(design, "The auto-place region must fit inside the die.");
  }
  if (!isInsideRegion(region, block)) {
    return unchangedDesign(design, "The auto-place region must contain the whole block.");
  }
  if (isEdgeOnly(data, block.typeId) && !regionTouchesEdge(design, region)) {
    return unchangedDesign(design, "An edge-only block's region must touch the die edge.");
  }
  if (
    block.region !== undefined &&
    block.region.x === region.x &&
    block.region.y === region.y &&
    block.region.w === region.w &&
    block.region.h === region.h
  ) {
    return unchangedDesign(design);
  }
  return changedDesign(replaceBlock(design, { ...block, region }));
}

export function applySetBlockPlacements(
  design: ChipDesign,
  placements: readonly BlockPlacementInput[],
  data: GameData,
): DesignCommandResult {
  if (placements.length === 0) {
    return unchangedDesign(design);
  }
  const byUid = new Map(design.blocks.map((block) => [block.uid, block]));
  const updates = new Map<string, PlacedBlock>();
  for (const placement of placements) {
    if (updates.has(placement.uid)) {
      return unchangedDesign(design, `Block "${placement.uid}" appears twice in the layout.`);
    }
    const block = byUid.get(placement.uid);
    if (block === undefined) {
      return unchangedDesign(design, `Block "${placement.uid}" does not exist.`);
    }
    if (
      !Number.isInteger(placement.x) ||
      !Number.isInteger(placement.y) ||
      !Number.isInteger(placement.w) ||
      !Number.isInteger(placement.h) ||
      placement.w <= 0 ||
      placement.h <= 0
    ) {
      return unchangedDesign(design, "Layout placements must be whole-tile rectangles.");
    }
    const sameShape = placement.w === block.w && placement.h === block.h;
    const rotatedShape = placement.w === block.h && placement.h === block.w;
    if (!sameShape && !rotatedShape) {
      return unchangedDesign(
        design,
        "A layout can move or rotate blocks, but not change their transistor footprint.",
      );
    }
    const moved =
      placement.x !== block.x ||
      placement.y !== block.y ||
      placement.w !== block.w ||
      placement.h !== block.h ||
      placement.rotated !== block.rotated;
    if (block.locked && moved) {
      return unchangedDesign(design, "A locked block cannot be moved by auto-place.");
    }
    updates.set(placement.uid, {
      ...block,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      rotated: placement.rotated,
    });
  }

  let changedAny = false;
  const blocks = design.blocks.map((block) => {
    const update = updates.get(block.uid);
    if (update === undefined) {
      return block;
    }
    if (
      update.x !== block.x ||
      update.y !== block.y ||
      update.w !== block.w ||
      update.h !== block.h ||
      update.rotated !== block.rotated
    ) {
      changedAny = true;
    }
    return update;
  });
  if (!changedAny) {
    return unchangedDesign(design);
  }
  const candidate: ChipDesign = { ...design, blocks };
  const error = validateDesignGeometry(candidate, (typeId) => isEdgeOnly(data, typeId));
  if (error !== null) {
    return unchangedDesign(design, `Layout is invalid: ${error}`);
  }
  return changedDesign(candidate);
}

export function applyResizeDie(
  design: ChipDesign,
  dieW: number,
  dieH: number,
  data: GameData,
  tuning: Tuning,
): DesignCommandResult {
  if (
    !Number.isInteger(dieW) ||
    !Number.isInteger(dieH) ||
    dieW < tuning.design.minDieWidth ||
    dieW > tuning.design.maxDieWidth ||
    dieH < tuning.design.minDieHeight ||
    dieH > tuning.design.maxDieHeight
  ) {
    return unchangedDesign(
      design,
      `Die size must be ${String(tuning.design.minDieWidth)}-${String(tuning.design.maxDieWidth)} by ${String(tuning.design.minDieHeight)}-${String(tuning.design.maxDieHeight)} tiles.`,
    );
  }
  if (dieW === design.dieW && dieH === design.dieH) {
    return unchangedDesign(design);
  }

  const shrinkingW = dieW < design.dieW;
  const shrinkingH = dieH < design.dieH;
  let blocked: string | null = null;
  let movedEdgeBlock = false;

  const blocks = design.blocks.map((block): PlacedBlock => {
    if (!isEdgeOnly(data, block.typeId)) {
      return block;
    }
    let x = block.x;
    let y = block.y;
    let moved = false;

    if (shrinkingW && x + block.w > dieW) {
      x = dieW - block.w;
      if (x < 0) {
        blocked = `${block.typeId} (${block.uid}) is ${String(block.w)} tiles wide and does not fit the ${String(dieW)}-tile die width.`;
        return block;
      }
      moved = true;
    }
    if (shrinkingH && y + block.h > dieH) {
      y = dieH - block.h;
      if (y < 0) {
        blocked = `${block.typeId} (${block.uid}) is ${String(block.h)} tiles tall and does not fit the ${String(dieH)}-tile die height.`;
        return block;
      }
      moved = true;
    }
    if (!moved) {
      return block;
    }
    movedEdgeBlock = true;
    const dx = x - block.x;
    const dy = y - block.y;
    const region: BlockRegion | undefined =
      block.region === undefined
        ? undefined
        : { ...block.region, x: block.region.x + dx, y: block.region.y + dy };
    return { ...block, x, y, ...(region === undefined ? {} : { region }) };
  });

  if (blocked !== null) {
    return unchangedDesign(design, blocked);
  }
  const candidate: ChipDesign = { ...design, dieW, dieH, blocks };
  const error = validateDesignGeometry(candidate, (typeId) => isEdgeOnly(data, typeId));
  if (error !== null) {
    return unchangedDesign(
      design,
      movedEdgeBlock
        ? `Could not resize automatically: ${error}. Move the edge block manually or shrink less.`
        : error,
    );
  }
  return changedDesign(candidate);
}
