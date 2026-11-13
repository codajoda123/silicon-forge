import { describe, expect, it } from "vitest";

import {
  aspectRatioOptions,
  blockConfigDefaults,
  blockStats,
  fitBlockDimensions,
  footprint,
  normalizeBlockConfig,
} from "../../src/sim/design/blocks";
import { data, emptyDesign, tuning } from "../design/helpers";

function block(id: string) {
  const record = data.blockById[id];
  if (record === undefined) {
    throw new Error(`missing fixture block ${id}`);
  }
  return record;
}

function node(id: string) {
  const record = data.nodeById[id];
  if (record === undefined) {
    throw new Error(`missing fixture node ${id}`);
  }
  return record;
}

describe("block footprints", () => {
  it("starts every block from its data defaults", () => {
    expect(blockConfigDefaults(block("register-file"))).toEqual({
      registers: 16,
      width: 8,
      ports: 3,
    });
    expect(blockConfigDefaults(block("decoder-hardwired"))).toEqual({});
  });

  it("rejects invalid config values with readable messages", () => {
    expect(
      normalizeBlockConfig(block("alu"), { width: 7 }).error,
    ).toMatch(/ALU width/);
    expect(
      normalizeBlockConfig(block("register-file"), { ports: 13 }).error,
    ).toMatch(/Total ports/);
    expect(
      normalizeBlockConfig(block("bus-interface"), { multiplexed: "yes" }).error,
    ).toMatch(/true or false/);
    expect(
      normalizeBlockConfig(block("alu"), { carry: "lookahead", width: 16 }).error,
    ).toBeNull();
  });

  it("derives aspect-ratio rectangles that always cover the tile budget", () => {
    expect(fitBlockDimensions(5, 1)).toEqual({ w: 2, h: 3 });
    expect(fitBlockDimensions(5, 2)).toEqual({ w: 3, h: 2 });
    expect(fitBlockDimensions(5, 0.5)).toEqual({ w: 2, h: 4 });
    expect(fitBlockDimensions(100, 1)).toEqual({ w: 10, h: 10 });

    for (const option of aspectRatioOptions()) {
      const shape = fitBlockDimensions(37, option.ratio);
      expect(shape.w * shape.h).toBeGreaterThanOrEqual(37);
    }
  });

  it("uses the node's transistors-per-tile density", () => {
    const alu = block("alu");
    const config = { width: 8, carry: "ripple" };
    const oldNode = node("10um-pmos");
    const newNode = node("6um-nmos");

    const oldStats = blockStats(alu, config, oldNode);
    const newStats = blockStats(alu, config, newNode);

    expect(oldStats.transistors).toBe(356);
    expect(oldStats.logicDepth).toBe(20);
    expect(oldStats.tileCount).toBe(Math.ceil(356 / oldNode.transistorsPerTile));
    expect(newStats.tileCount).toBe(Math.ceil(356 / newNode.transistorsPerTile));
    expect(newStats.tileCount).toBeLessThan(oldStats.tileCount);
  });

  it("applies aspect-ratio padding to the final footprint", () => {
    const stats = footprint(block("alu"), { width: 8, carry: "ripple" }, node("10um-pmos"), 1);
    expect(stats.tileCount).toBe(8);
    expect(stats.w * stats.h).toBeGreaterThanOrEqual(stats.tileCount);
    expect({ w: stats.w, h: stats.h }).toEqual({ w: 3, h: 3 });
  });

  it("keeps zero-transistor configurations selectable with the tuned minimum", () => {
    const stats = footprint(
      block("multiplier"),
      blockConfigDefaults(block("multiplier")),
      node("10um-pmos"),
      1,
    );
    expect(stats.transistors).toBe(0);
    expect(stats.tileCount).toBe(tuning.design.minBlockTiles);
    expect({ w: stats.w, h: stats.h }).toEqual({ w: 1, h: 1 });
  });

  it("keeps every default block footprint placeable on the starting die", () => {
    const design = emptyDesign();
    const defaultNode = data.nodeById[design.nodeId];
    if (defaultNode === undefined) {
      throw new Error("default fixture node missing");
    }
    for (const blockType of data.blocks) {
      const stats = footprint(
        blockType,
        blockConfigDefaults(blockType),
        defaultNode,
        tuning.design.aspectRatios[0]?.ratio ?? 1,
      );
      expect(stats.w, `${blockType.id} width`).toBeLessThanOrEqual(design.dieW);
      expect(stats.h, `${blockType.id} height`).toBeLessThanOrEqual(design.dieH);
    }
  });
});
