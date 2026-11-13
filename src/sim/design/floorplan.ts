import type { BlockRegion, ChipDesign, Placement, PlacedBlock } from "./types";

export function overlaps(a: Placement, b: Placement): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function isInsideRegion(region: BlockRegion, p: Placement): boolean {
  return (
    p.x >= region.x &&
    p.y >= region.y &&
    p.x + p.w <= region.x + region.w &&
    p.y + p.h <= region.y + region.h
  );
}

export function regionTouchesEdge(
  design: Pick<ChipDesign, "dieW" | "dieH">,
  region: BlockRegion,
): boolean {
  return (
    region.x === 0 ||
    region.y === 0 ||
    region.x + region.w === design.dieW ||
    region.y + region.h === design.dieH
  );
}

export function isInsideDie(design: Pick<ChipDesign, "dieW" | "dieH">, p: Placement): boolean {
  return p.x >= 0 && p.y >= 0 && p.w > 0 && p.h > 0 && p.x + p.w <= design.dieW && p.y + p.h <= design.dieH;
}

export function touchesEdge(
  design: Pick<ChipDesign, "dieW" | "dieH">,
  p: Placement,
): boolean {
  return p.x === 0 || p.y === 0 || p.x + p.w === design.dieW || p.y + p.h === design.dieH;
}

export function findBlockAt(
  design: Pick<ChipDesign, "blocks">,
  x: number,
  y: number,
): PlacedBlock | undefined {
  return design.blocks.find(
    (block) => x >= block.x && x < block.x + block.w && y >= block.y && y < block.y + block.h,
  );
}

/**
 * Return the first rule violation for a proposed rectangle, or null when the
 * placement is legal. `ignoreUid` lets move/rotate validate against everything
 * except the block being changed.
 */
export function validatePlacement(
  design: Pick<ChipDesign, "dieW" | "dieH" | "blocks">,
  placement: Placement,
  edgeOnly: boolean,
  ignoreUid?: string,
  region?: BlockRegion,
): string | null {
  if (
    !Number.isInteger(placement.x) ||
    !Number.isInteger(placement.y) ||
    !Number.isInteger(placement.w) ||
    !Number.isInteger(placement.h)
  ) {
    return "Block coordinates and dimensions must be whole tiles.";
  }
  if (!isInsideDie(design, placement)) {
    return `Placement does not fit inside the ${String(design.dieW)}x${String(design.dieH)} die.`;
  }
  if (region !== undefined && !isInsideRegion(region, placement)) {
    return "Placement must stay inside the block's auto-place region.";
  }
  if (edgeOnly && !touchesEdge(design, placement)) {
    return "This block is edge-only and must touch the die edge.";
  }

  for (const other of design.blocks) {
    if (other.uid === ignoreUid) {
      continue;
    }
    if (overlaps(placement, other)) {
      return `Placement overlaps ${other.typeId} (${other.uid}).`;
    }
  }
  return null;
}

/** Validate an entire design after a global resize/node change. */
export function validateDesignGeometry(
  design: Pick<ChipDesign, "dieW" | "dieH" | "blocks">,
  edgeOnlyByType: (typeId: string) => boolean,
): string | null {
  for (const block of design.blocks) {
    if (!isInsideDie(design, block)) {
      return `${block.typeId} (${block.uid}) does not fit inside the die.`;
    }
    if (block.region !== undefined) {
      if (!isInsideDie(design, block.region)) {
        return `${block.typeId} (${block.uid}) has an auto-place region outside the die.`;
      }
      if (!isInsideRegion(block.region, block)) {
        return `${block.typeId} (${block.uid}) is outside its auto-place region.`;
      }
      if (edgeOnlyByType(block.typeId) && !regionTouchesEdge(design, block.region)) {
        return `${block.typeId} (${block.uid}) is edge-only and its region does not touch the die edge.`;
      }
    }
    if (edgeOnlyByType(block.typeId) && !touchesEdge(design, block)) {
      return `${block.typeId} (${block.uid}) is edge-only and no longer touches the die edge.`;
    }
  }

  for (let index = 0; index < design.blocks.length; index += 1) {
    const block = design.blocks[index];
    if (block === undefined) {
      continue;
    }
    for (let otherIndex = index + 1; otherIndex < design.blocks.length; otherIndex += 1) {
      const other = design.blocks[otherIndex];
      if (other === undefined) {
        continue;
      }
      if (overlaps(block, other)) {
        return `${block.typeId} (${block.uid}) overlaps ${other.typeId} (${other.uid}).`;
      }
    }
  }
  return null;
}

export function nextBlockUid(design: Pick<ChipDesign, "blocks">): string {
  const used = new Set(design.blocks.map((block) => block.uid));
  let index = 1;
  while (used.has(`block-${String(index)}`)) {
    index += 1;
  }
  return `block-${String(index)}`;
}
