import { describe, expect, it } from "vitest";

import { applyDesignCommand } from "../../src/sim/design/commands";
import { validateDesignGeometry, validatePlacement } from "../../src/sim/design/floorplan";
import { data, emptyDesign, place, run } from "../design/helpers";

function errorOf(design: ReturnType<typeof emptyDesign>, command: Parameters<typeof applyDesignCommand>[1]) {
  const result = applyDesignCommand(design, command, data);
  return result.error;
}

describe("floorplan placement rules", () => {
  it("places a block and gives it a deterministic uid", () => {
    const first = place(emptyDesign(), "program-counter", 0, 0, {
      config: { addressWidth: 4 },
    });
    expect(first.blocks).toHaveLength(1);
    expect(first.blocks[0]?.uid).toBe("block-1");
    expect(first.blocks[0]?.w).toBe(2);
    expect(first.blocks[0]?.h).toBe(3);
  });

  it("blocks overlapping placements", () => {
    const design = place(emptyDesign(), "program-counter", 0, 0, {
      config: { addressWidth: 4 },
    });
    const error = errorOf(design, {
      type: "placeBlock",
      blockTypeId: "bus-interface",
      x: 0,
      y: 0,
      config: { busWidth: 4, multiplexed: true, prefetchBytes: 0 },
    });
    expect(error).toMatch(/overlaps program-counter/);
  });

  it("rejects placements outside the die", () => {
    const error = errorOf(emptyDesign(), {
      type: "placeBlock",
      blockTypeId: "program-counter",
      x: 9,
      y: 9,
      config: { addressWidth: 4 },
    });
    expect(error).toMatch(/does not fit/);
  });

  it("enforces edge-only blocks on placement and movement", () => {
    const config = { busWidth: 4, multiplexed: true, prefetchBytes: 0 };
    const interiorError = errorOf(emptyDesign(), {
      type: "placeBlock",
      blockTypeId: "bus-interface",
      x: 1,
      y: 1,
      config,
    });
    expect(interiorError).toMatch(/edge-only/);

    const onEdge = place(emptyDesign(), "bus-interface", 5, 6, { config });
    expect(onEdge.blocks[0]?.x).toBe(5);

    const moveError = errorOf(onEdge, {
      type: "moveBlock",
      uid: "block-1",
      x: 2,
      y: 2,
    });
    expect(moveError).toMatch(/edge-only/);
  });

  it("moves, rotates, locks and deletes blocks", () => {
    let design = place(emptyDesign(), "program-counter", 0, 0, {
      config: { addressWidth: 4 },
    });
    design = run(design, { type: "moveBlock", uid: "block-1", x: 2, y: 1 });
    expect(design.blocks[0]).toMatchObject({ x: 2, y: 1, w: 2, h: 3 });

    design = run(design, { type: "rotateBlock", uid: "block-1" });
    expect(design.blocks[0]).toMatchObject({ w: 3, h: 2, rotated: true });

    design = run(design, { type: "setBlockLocked", uid: "block-1", locked: true });
    expect(errorOf(design, { type: "moveBlock", uid: "block-1", x: 0, y: 0 })).toMatch(
      /locked/,
    );
    expect(errorOf(design, { type: "rotateBlock", uid: "block-1" })).toMatch(/locked/);
    expect(errorOf(design, { type: "deleteBlock", uid: "block-1" })).toMatch(/locked/);
    expect(
      errorOf(design, {
        type: "setBlockConfig",
        uid: "block-1",
        config: { addressWidth: 8 },
      }),
    ).toMatch(/locked/);

    design = run(design, { type: "setBlockLocked", uid: "block-1", locked: false });
    design = run(design, { type: "deleteBlock", uid: "block-1" });
    expect(design.blocks).toHaveLength(0);
  });

  it("recalculates a block's shape when its config changes", () => {
    let design = place(emptyDesign(), "alu", 0, 0, {
      config: { width: 4, carry: "ripple" },
    });
    expect(design.blocks[0]).toMatchObject({ w: 2, h: 3 });

    design = run(design, {
      type: "setBlockConfig",
      uid: "block-1",
      config: { width: 8, carry: "ripple" },
    });
    expect(design.blocks[0]).toMatchObject({ w: 2, h: 4 });
    expect(design.blocks[0]?.config).toEqual({ width: 8, carry: "ripple" });

    design = run(design, {
      type: "setBlockConfig",
      uid: "block-1",
      config: { width: 8, carry: "ripple" },
      aspectRatio: 2,
    });
    expect(design.blocks[0]).toMatchObject({ w: 4, h: 2, rotated: false });
    expect(
      errorOf(design, {
        type: "setBlockConfig",
        uid: "block-1",
        config: { width: 8, carry: "ripple" },
        aspectRatio: 3,
      }),
    ).toMatch(/Unknown aspect ratio/);
  });

  it("changes the aspect ratio and rotation explicitly", () => {
    let design = place(emptyDesign(), "program-counter", 0, 0, {
      config: { addressWidth: 4 },
    });
    expect(design.blocks[0]).toMatchObject({ w: 2, h: 3 });

    design = run(design, { type: "setBlockAspect", uid: "block-1", aspectRatio: 2 });
    expect(design.blocks[0]).toMatchObject({ w: 3, h: 2, rotated: false });

    design = run(design, { type: "rotateBlock", uid: "block-1" });
    expect(design.blocks[0]).toMatchObject({ w: 2, h: 3, rotated: true });
  });

  it("resizes the die only when every block stays legal", () => {
    let design = place(emptyDesign(), "program-counter", 0, 0, {
      config: { addressWidth: 4 },
    });
    design = run(design, { type: "resizeDie", dieW: 3, dieH: 3 });
    expect({ w: design.dieW, h: design.dieH }).toEqual({ w: 3, h: 3 });

    expect(errorOf(design, { type: "resizeDie", dieW: 2, dieH: 3 })).toMatch(/Die size/);
    expect(errorOf(design, { type: "resizeDie", dieW: 1, dieH: 1 })).toMatch(/Die size/);

    const withEdge = place(emptyDesign(), "bus-interface", 5, 6, {
      config: { busWidth: 4, multiplexed: true, prefetchBytes: 0 },
    });
    expect(errorOf(withEdge, { type: "resizeDie", dieW: 20, dieH: 20 })).toMatch(
      /edge-only/,
    );
  });

  it("shifts edge-only blocks inward when the die shrinks", () => {
    const busConfig = { busWidth: 4, multiplexed: true, prefetchBytes: 0 };
    const bus = place(emptyDesign(), "bus-interface", 5, 6, { config: busConfig });
    expect(bus.blocks[0]).toMatchObject({ x: 5, y: 6, w: 4, h: 4 });

    const narrower = applyDesignCommand(bus, { type: "resizeDie", dieW: 7, dieH: 10 }, data);
    expect(narrower.error).toBeNull();
    expect(narrower.design.blocks[0]).toMatchObject({ x: 3, y: 6 });
    expect(narrower.design.dieW).toBe(7);

    const shorter = applyDesignCommand(bus, { type: "resizeDie", dieW: 10, dieH: 8 }, data);
    expect(shorter.error).toBeNull();
    expect(shorter.design.blocks[0]).toMatchObject({ x: 5, y: 4 });
    expect(shorter.design.dieH).toBe(8);

    const both = applyDesignCommand(bus, { type: "resizeDie", dieW: 7, dieH: 8 }, data);
    expect(both.error).toBeNull();
    expect(both.design.blocks[0]).toMatchObject({ x: 3, y: 4 });
  });

  it("rejects a shrink when the edge-only block has no room", () => {
    const bus = place(emptyDesign(), "bus-interface", 5, 6, {
      config: { busWidth: 4, multiplexed: true, prefetchBytes: 0 },
    });
    const result = applyDesignCommand(bus, { type: "resizeDie", dieW: 3, dieH: 10 }, data);
    expect(result.error).toMatch(/does not fit the 3-tile die width/);
    expect(result.design).toBe(bus);
  });

  it("rejects a shrink when the inward shift would overlap", () => {
    const busConfig = { busWidth: 4, multiplexed: true, prefetchBytes: 0 };
    let design = place(emptyDesign(), "bus-interface", 5, 6, { config: busConfig });
    design = place(design, "program-counter", 2, 4, {
      config: { addressWidth: 4 },
    });
    const result = applyDesignCommand(design, { type: "resizeDie", dieW: 7, dieH: 10 }, data);
    expect(result.error).toMatch(/Could not resize automatically: .*overlap/);
    expect(result.design).toBe(design);
  });

  it("validates whole designs for later global changes", () => {
    const design = emptyDesign();
    expect(validateDesignGeometry(design, () => false)).toBeNull();
    expect(
      validatePlacement(
        { dieW: 10, dieH: 10, blocks: [] },
        { x: -1, y: 0, w: 1, h: 1 },
        false,
      ),
    ).toMatch(/does not fit/);
  });
});
