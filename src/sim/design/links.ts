import type { GameData } from "../../data/load";
import { compileFormula } from "../../data/formula";
import type { ChipDesign, DesignLink } from "./types";

/**
 * Required links are generated from block data, never hand-routed. If several
 * blocks share a type (e.g. two ALUs), each instance gets its own links.
 */
export function generateLinks(design: ChipDesign, data: GameData): DesignLink[] {
  const links: DesignLink[] = [];

  for (const from of design.blocks) {
    const fromType = data.blockById[from.typeId];
    if (fromType === undefined) {
      throw new Error(`Design ${design.id} references unknown block type "${from.typeId}"`);
    }

    for (const required of fromType.requiredLinks) {
      const toType = data.blockById[required.to];
      if (toType === undefined) {
        throw new Error(`Block "${fromType.id}" links to unknown type "${required.to}"`);
      }
      const widthBits = compileFormula(required.widthBits).evaluateNumber(from.config);
      if (!Number.isFinite(widthBits) || widthBits <= 0) {
        throw new Error(
          `Link ${fromType.id} -> ${toType.id} has invalid width ${String(widthBits)}`,
        );
      }

      for (const to of design.blocks) {
        if (to.typeId !== toType.id) {
          continue;
        }
        links.push({
          id: `${from.uid}:${toType.id}:${to.uid}`,
          fromUid: from.uid,
          fromTypeId: from.typeId,
          toUid: to.uid,
          toTypeId: to.typeId,
          timing: required.timing,
          widthBits,
        });
      }
    }
  }

  return links;
}

export function countLinksByTiming(links: readonly DesignLink[]): {
  critical: number;
  normal: number;
  relaxed: number;
} {
  let critical = 0;
  let normal = 0;
  let relaxed = 0;
  for (const link of links) {
    if (link.timing === "critical") {
      critical += 1;
    } else if (link.timing === "normal") {
      normal += 1;
    } else {
      relaxed += 1;
    }
  }
  return { critical, normal, relaxed };
}
