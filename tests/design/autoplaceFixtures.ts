import type { ConfigValue } from "../../src/data/schemas";
import { getGameData, getTuning } from "../../src/data/gameData";
import { createRngSet } from "../../src/sim/core/rng";
import { footprint, normalizeBlockConfig } from "../../src/sim/design/blocks";
import { createDefaultDesign } from "../../src/sim/design/defaults";
import { isInsideDie, overlaps, validateDesignGeometry } from "../../src/sim/design/floorplan";
import type { ChipDesign, PlacedBlock } from "../../src/sim/design/types";

import {
  AUTOPLACE_FIXTURES,
  type AutoPlaceFixture,
  type FixturePlacement,
} from "./autoplaceFixtureData";

export { AUTOPLACE_FIXTURES, type AutoPlaceFixture, type FixturePlacement };

const data = getGameData();
const tuning = getTuning();

function blockDimensions(
  fixture: AutoPlaceFixture,
  typeId: string,
  config: Record<string, ConfigValue>,
): { w: number; h: number; tileCount: number } {
  const node = data.nodeById[fixture.nodeId];
  const type = data.blockById[typeId];
  if (node === undefined || type === undefined) {
    throw new Error(`Fixture ${fixture.id} references unknown data`);
  }
  const normalized = normalizeBlockConfig(type, config).config;
  const stats = footprint(type, normalized, node, 1);
  return { w: stats.w, h: stats.h, tileCount: stats.tileCount };
}

function makeDesign(fixture: AutoPlaceFixture, placements: readonly FixturePlacement[]): ChipDesign {
  const node = data.nodeById[fixture.nodeId];
  if (node === undefined) {
    throw new Error(`Fixture ${fixture.id} references unknown node`);
  }
  const base = createDefaultDesign(fixture.year, data, tuning);
  const blocks: PlacedBlock[] = placements.map((placement, index) => {
    const type = data.blockById[placement.typeId];
    if (type === undefined) {
      throw new Error(`Fixture ${fixture.id} references unknown block "${placement.typeId}"`);
    }
    const normalized = normalizeBlockConfig(type, placement.config).config;
    const stats = footprint(type, normalized, node, 1);
    if (placement.w * placement.h < stats.tileCount) {
      throw new Error(
        `Fixture ${fixture.id}: ${placement.typeId} ${String(placement.w)}x${String(placement.h)} is too small for ${String(stats.tileCount)} tiles`,
      );
    }
    const validShapes = tuning.design.aspectRatios.flatMap((option) => {
      const shape = footprint(type, normalized, node, option.ratio);
      return [
        `${String(shape.w)}x${String(shape.h)}`,
        `${String(shape.h)}x${String(shape.w)}`,
      ];
    });
    if (!validShapes.includes(`${String(placement.w)}x${String(placement.h)}`)) {
      throw new Error(
        `Fixture ${fixture.id}: ${placement.typeId} ${String(placement.w)}x${String(placement.h)} is not an editor shape option`,
      );
    }
    return {
      uid: `block-${String(index + 1)}`,
      typeId: placement.typeId,
      config: normalized,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      rotated: false,
      locked: false,
    };
  });
  const design: ChipDesign = {
    ...base,
    nodeId: fixture.nodeId,
    packageId: fixture.packageId,
    dieW: fixture.dieW,
    dieH: fixture.dieH,
    blocks,
    pipelinedLinks: [],
  };
  const error = validateDesignGeometry(
    design,
    (typeId) => data.blockById[typeId]?.edgeOnly === true,
  );
  if (error !== null) {
    throw new Error(`Fixture ${fixture.id} reference layout is invalid: ${error}`);
  }
  return design;
}

export function referenceDesign(fixture: AutoPlaceFixture): ChipDesign {
  return makeDesign(fixture, fixture.reference);
}

function shuffledIndices(count: number, rng: ReturnType<ReturnType<typeof createRngSet>["stream"]>): number[] {
  const indices = Array.from({ length: count }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const other = rng.nextInt(0, index + 1);
    const value = indices[index];
    indices[index] = indices[other] ?? index;
    indices[other] = value ?? other;
  }
  return indices;
}

/** Deterministic random legal layout; retries with derived seeds if packing fails. */
export function randomDesign(fixture: AutoPlaceFixture, seed: number): ChipDesign {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const attemptSeed = seed + attempt * 977;
    const rng = createRngSet(attemptSeed).stream("autoplace-fixture");
    const edge: number[] = [];
    const interior: number[] = [];
    fixture.reference.forEach((placement, index) => {
      const type = data.blockById[placement.typeId];
      (type?.edgeOnly === true ? edge : interior).push(index);
    });
    const order = [...shuffledIndices(edge.length, rng).map((index) => edge[index] ?? 0)];
    for (const index of shuffledIndices(interior.length, rng)) {
      const source = interior[index];
      if (source !== undefined) {
        order.push(source);
      }
    }

    const placementsByIndex: (FixturePlacement | undefined)[] = [];
    let failed = false;
    for (const index of order) {
      const template = fixture.reference[index];
      if (template === undefined) {
        failed = true;
        break;
      }
      const type = data.blockById[template.typeId];
      if (type === undefined) {
        failed = true;
        break;
      }
      const normalized = normalizeBlockConfig(type, template.config).config;
      const dimensions = blockDimensions(fixture, template.typeId, normalized);
      let placed: FixturePlacement | null = null;
      for (let tryIndex = 0; tryIndex < 6000; tryIndex += 1) {
        let x: number;
        let y: number;
        if (type.edgeOnly === true) {
          const side = rng.nextInt(0, 4);
          if (side < 2) {
            x = rng.nextInt(0, fixture.dieW - dimensions.w + 1);
            y = side === 0 ? 0 : fixture.dieH - dimensions.h;
          } else {
            y = rng.nextInt(0, fixture.dieH - dimensions.h + 1);
            x = side === 2 ? 0 : fixture.dieW - dimensions.w;
          }
        } else {
          x = rng.nextInt(0, fixture.dieW - dimensions.w + 1);
          y = rng.nextInt(0, fixture.dieH - dimensions.h + 1);
        }
        const candidate = { x, y, w: dimensions.w, h: dimensions.h };
        if (
          !isInsideDie(
            { dieW: fixture.dieW, dieH: fixture.dieH },
            candidate,
          ) ||
          placementsByIndex.some((other) => other !== undefined && overlaps(candidate, other))
        ) {
          continue;
        }
        placed = {
          typeId: template.typeId,
          config: normalized,
          x,
          y,
          w: dimensions.w,
          h: dimensions.h,
        };
        break;
      }
      if (placed === null) {
        failed = true;
        break;
      }
      placementsByIndex[index] = placed;
    }

    if (!failed) {
      const placements: FixturePlacement[] = [];
      for (let index = 0; index < fixture.reference.length; index += 1) {
        const placement = placementsByIndex[index];
        if (placement === undefined) {
          failed = true;
          break;
        }
        placements.push(placement);
      }
      if (!failed) {
        return makeDesign(fixture, placements);
      }
    }
  }
  throw new Error(`Could not build a random legal layout for fixture ${fixture.id}`);
}
