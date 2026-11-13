import { describe, expect, it } from "vitest";

import { applyDesignCommand, type DesignCommand } from "../../src/sim/design/commands";
import { autoPlace } from "../../src/sim/design/autoplace";
import { deserializeSave, serializeSave } from "../../src/sim/core/save";
import { createNewGame, getActiveDesign, type GameState } from "../../src/sim/core/state";
import { isInsideRegion } from "../../src/sim/design/floorplan";
import type { ChipDesign } from "../../src/sim/design/types";
import { AUTOPLACE_FIXTURES, randomDesign, referenceDesign } from "../design/autoplaceFixtures";
import { data, emptyDesign, place, run, tuning } from "../design/helpers";

const fixture = AUTOPLACE_FIXTURES[0]!;

function apply(design: ChipDesign, command: DesignCommand) {
  return applyDesignCommand(design, command, data);
}

function autoPlacements(design: ChipDesign) {
  const result = autoPlace(design, data, tuning, {
    seed: fixture.autoSeed,
  });
  return result.design.blocks.map((block) => ({
    uid: block.uid,
    x: block.x,
    y: block.y,
    w: block.w,
    h: block.h,
    rotated: block.rotated,
  }));
}

describe("auto-place region command", () => {
  it("sets, reports and clears a region", () => {
    const reference = referenceDesign(fixture);
    const io = reference.blocks[0];
    expect(io).toBeDefined();
    if (io === undefined) {
      return;
    }
    const region = { x: 8, y: 11, w: 6, h: 3 };
    const result = apply(reference, { type: "setBlockRegion", uid: io.uid, region });
    expect(result.error).toBeNull();
    const updated = result.design.blocks.find((block) => block.uid === io.uid);
    expect(updated?.region).toEqual(region);

    const cleared = apply(result.design, {
      type: "setBlockRegion",
      uid: io.uid,
      region: null,
    });
    expect(cleared.error).toBeNull();
    expect(cleared.design.blocks.find((block) => block.uid === io.uid)?.region).toBeUndefined();
  });

  it("rejects malformed or impossible regions", () => {
    const reference = referenceDesign(fixture);
    const io = reference.blocks[0];
    expect(io).toBeDefined();
    if (io === undefined) {
      return;
    }

    const outside = apply(reference, {
      type: "setBlockRegion",
      uid: io.uid,
      region: { x: 12, y: 12, w: 5, h: 5 },
    });
    expect(outside.error).toMatch(/fit inside the die/);

    const tooSmall = apply(reference, {
      type: "setBlockRegion",
      uid: io.uid,
      region: { x: 0, y: 0, w: 3, h: 3 },
    });
    expect(tooSmall.error).toMatch(/contain the whole block/);

    const fractional = apply(reference, {
      type: "setBlockRegion",
      uid: io.uid,
      region: { x: 0.5, y: 0, w: 6, h: 6 },
    });
    expect(fractional.error).toMatch(/whole-tile/);
  });

  it("makes manual movement respect the region", () => {
    const reference = referenceDesign(fixture);
    const io = reference.blocks[0];
    expect(io).toBeDefined();
    if (io === undefined) {
      return;
    }
    const constrained = run(reference, {
      type: "setBlockRegion",
      uid: io.uid,
      region: { x: 8, y: 11, w: 6, h: 3 },
    });

    const inside = apply(constrained, { type: "moveBlock", uid: io.uid, x: 11, y: 11 });
    expect(inside.error).toBeNull();
    expect(inside.design.blocks.find((block) => block.uid === io.uid)?.y).toBe(11);

    const outside = apply(inside.design, { type: "moveBlock", uid: io.uid, x: 0, y: 0 });
    expect(outside.error).toMatch(/auto-place region/);
  });
});

describe("setBlockPlacements command", () => {
  const start = randomDesign(fixture, fixture.startSeed);

  it("applies a whole auto-place layout in one command", () => {
    const placements = autoPlacements(start);
    const result = apply(start, { type: "setBlockPlacements", placements });
    expect(result.error).toBeNull();
    expect(result.changed).toBe(true);
    expect(result.design.blocks).toHaveLength(start.blocks.length);
    expect(result.design.blocks.map((block) => block.x)).not.toEqual(
      start.blocks.map((block) => block.x),
    );
  });

  it("rejects an overlapping layout without changing the design", () => {
    const placements = autoPlacements(start).map((placement, index) => {
      if (index === 0) {
        return placement;
      }
      const first = autoPlacements(start)[0];
      return first === undefined ? placement : { ...placement, x: first.x, y: first.y };
    });
    const result = apply(start, { type: "setBlockPlacements", placements });
    expect(result.error).toMatch(/Layout is invalid/);
    expect(result.design).toBe(start);
  });

  it("rejects footprint changes and locked-block moves", () => {
    const tooWide = apply(start, {
      type: "setBlockPlacements",
      placements: [
        {
          uid: start.blocks[0]?.uid ?? "",
          x: 0,
          y: 0,
          w: (start.blocks[0]?.w ?? 1) + 1,
          h: start.blocks[0]?.h ?? 1,
          rotated: false,
        },
      ],
    });
    expect(tooWide.error).toMatch(/transistor footprint/);

    const lockedUid = start.blocks[1]?.uid ?? "";
    const locked = run(start, { type: "setBlockLocked", uid: lockedUid, locked: true });
    const moved = apply(locked, {
      type: "setBlockPlacements",
      placements: [
        {
          uid: lockedUid,
          x: 0,
          y: 0,
          w: locked.blocks[1]?.w ?? 1,
          h: locked.blocks[1]?.h ?? 1,
          rotated: false,
        },
      ],
    });
    expect(moved.error).toMatch(/locked block/);
  });

  it("accepts a pure rotation", () => {
    const design = place(emptyDesign(1971), "alu", 0, 0, { aspectRatio: 2 });
    const block = design.blocks[0];
    expect(block).toBeDefined();
    if (block === undefined) {
      return;
    }
    expect(block.w).toBe(4);
    expect(block.h).toBe(2);
    const result = apply(design, {
      type: "setBlockPlacements",
      placements: [
        { uid: block.uid, x: block.x, y: block.y, w: 2, h: 4, rotated: true },
      ],
    });
    expect(result.error).toBeNull();
    const updated = result.design.blocks[0];
    expect(updated?.w).toBe(2);
    expect(updated?.h).toBe(4);
    expect(updated?.rotated).toBe(true);
  });

  it("rejects a placement outside its region", () => {
    const reference = referenceDesign(fixture);
    const io = reference.blocks[0];
    expect(io).toBeDefined();
    if (io === undefined) {
      return;
    }
    const constrained = run(reference, {
      type: "setBlockRegion",
      uid: io.uid,
      region: { x: 8, y: 11, w: 6, h: 3 },
    });
    const result = apply(constrained, {
      type: "setBlockPlacements",
      placements: [
        { uid: io.uid, x: 0, y: 0, w: io.w, h: io.h, rotated: io.rotated },
      ],
    });
    expect(result.error).toMatch(/auto-place region/);
  });

  it("preserves the region when moving a constrained block inside it", () => {
    const reference = referenceDesign(fixture);
    const io = reference.blocks[0];
    expect(io).toBeDefined();
    if (io === undefined) {
      return;
    }
    const region = { x: 8, y: 11, w: 6, h: 3 };
    const constrained = run(reference, {
      type: "setBlockRegion",
      uid: io.uid,
      region,
    });
    const result = apply(constrained, {
      type: "setBlockPlacements",
      placements: [
        { uid: io.uid, x: 11, y: 11, w: io.w, h: io.h, rotated: io.rotated },
      ],
    });
    expect(result.error).toBeNull();
    const moved = result.design.blocks.find((block) => block.uid === io.uid);
    expect(moved?.region).toEqual(region);
    expect(moved === undefined ? false : isInsideRegion(region, moved)).toBe(true);
  });
});

describe("auto-place region persistence", () => {
  it("round-trips regions through the save format", () => {
    const reference = referenceDesign(fixture);
    const io = reference.blocks[0];
    expect(io).toBeDefined();
    if (io === undefined) {
      return;
    }
    const region = { x: 8, y: 11, w: 6, h: 3 };
    const withRegion = run(reference, { type: "setBlockRegion", uid: io.uid, region });
    const base = createNewGame({ seed: 11 });
    const state: GameState = {
      ...base,
      designs: [withRegion],
      activeDesignId: withRegion.id,
    };

    const loaded = deserializeSave(serializeSave(state));
    const design = getActiveDesign(loaded);
    expect(design.blocks.find((block) => block.uid === io.uid)?.region).toEqual(region);
  });
});
