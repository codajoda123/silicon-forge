import { describe, expect, it } from "vitest";

import { applyDesignCommand } from "../../src/sim/design/commands";
import { autoPlace } from "../../src/sim/design/autoplace";
import { buildPresetDesign } from "../../src/sim/design/presets";
import { createDefaultIsaConfig } from "../../src/sim/isa/defaults";
import { validateDesignGeometry } from "../../src/sim/design/floorplan";
import type { ChipDesign } from "../../src/sim/design/types";
import { data, emptyDesign, tuning } from "../design/helpers";

const isEdgeOnly = (typeId: string): boolean => data.blockById[typeId]?.edgeOnly === true;

function blockSignature(design: ChipDesign): string[] {
  return design.blocks
    .map((block) => {
      const config = Object.keys(block.config)
        .sort()
        .map((name) => `${name}=${String(block.config[name])}`)
        .join(",");
      return `${block.typeId}|${config}`;
    })
    .sort();
}

describe("processor design presets", () => {
  it("loads four complete preset designs", () => {
    expect(data.designPresets).toHaveLength(4);
    for (const preset of data.designPresets) {
      expect(preset.blocks.length).toBeGreaterThan(0);
      expect(data.nodeById[preset.nodeId]).toBeDefined();
      expect(data.packageById[preset.packageId]).toBeDefined();
    }
  });

  for (const preset of data.designPresets) {
    it(`${preset.id}: builds a legal design from its block set`, () => {
      const design = buildPresetDesign(preset, data, tuning);
      expect(design.nodeId).toBe(preset.nodeId);
      expect(design.packageId).toBe(preset.packageId);
      expect(design.dieW).toBe(preset.dieW);
      expect(design.dieH).toBe(preset.dieH);
      expect(design.blocks).toHaveLength(preset.blocks.length);
      expect(design.isa).toEqual(createDefaultIsaConfig(preset.historicalYear, data));
      expect(validateDesignGeometry(design, isEdgeOnly)).toBeNull();
      expect(new Set(design.blocks.map((block) => block.uid)).size).toBe(
        design.blocks.length,
      );
      expect(blockSignature(design)).toEqual(
        [...preset.blocks]
          .map((block) => `${block.typeId}|${Object.keys(block.config).sort().map((name) => `${name}=${String(block.config[name])}`).join(",")}`)
          .sort(),
      );
    });

    it(`${preset.id}: auto-place rebuilds and rearranges the preset`, () => {
      const base = emptyDesign(1971);
      const first = autoPlace(base, data, tuning, {
        presetId: preset.id,
        seed: 1971,
        mode: "performance",
      });
      expect(first.report.presetId).toBe(preset.id);
      expect(first.report.presetName).toBe(preset.name);
      expect(first.design.nodeId).toBe(preset.nodeId);
      expect(first.design.packageId).toBe(preset.packageId);
      expect(first.design.dieW).toBe(preset.dieW);
      expect(first.design.dieH).toBe(preset.dieH);
      expect(first.design.blocks).toHaveLength(preset.blocks.length);
      expect(validateDesignGeometry(first.design, isEdgeOnly)).toBeNull();
      expect(first.changed).toBe(true);
      expect(first.report.improvementPct).toBeGreaterThanOrEqual(0);

      const second = autoPlace(base, data, tuning, {
        presetId: preset.id,
        seed: 1971,
        mode: "performance",
      });
      expect(second.design.blocks).toEqual(first.design.blocks);
      expect(second.report).toEqual(first.report);
    });
  }

  it("applies a generated preset as one atomic design command", () => {
    const preset = data.designPresets[1];
    expect(preset).toBeDefined();
    if (preset === undefined) {
      return;
    }
    const base = emptyDesign(1971);
    const result = autoPlace(base, data, tuning, { presetId: preset.id, seed: 5 });
    const applied = applyDesignCommand(
      base,
      {
        type: "applyDesignContent",
        nodeId: result.design.nodeId,
        packageId: result.design.packageId,
        dieW: result.design.dieW,
        dieH: result.design.dieH,
        blocks: result.design.blocks,
      },
      data,
    );
    expect(applied.error).toBeNull();
    expect(applied.changed).toBe(true);
    expect(applied.design.id).toBe(base.id);
    expect(applied.design.name).toBe(base.name);
    expect(applied.design.nodeId).toBe(preset.nodeId);
    expect(applied.design.blocks).toHaveLength(preset.blocks.length);
    expect(applied.design.pipelinedLinks).toEqual([]);

    const again = applyDesignCommand(
      applied.design,
      {
        type: "applyDesignContent",
        nodeId: result.design.nodeId,
        packageId: result.design.packageId,
        dieW: result.design.dieW,
        dieH: result.design.dieH,
        blocks: result.design.blocks,
      },
      data,
    );
    expect(again.error).toBeNull();
    expect(again.changed).toBe(false);
  });

  it("rejects an overlapping or malformed generated design", () => {
    const preset = data.designPresets[2];
    expect(preset).toBeDefined();
    if (preset === undefined) {
      return;
    }
    const base = emptyDesign(1971);
    const result = autoPlace(base, data, tuning, { presetId: preset.id, seed: 8 });
    const first = result.design.blocks[0];
    const second = result.design.blocks[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) {
      return;
    }

    const overlapping = applyDesignCommand(
      base,
      {
        type: "applyDesignContent",
        nodeId: result.design.nodeId,
        packageId: result.design.packageId,
        dieW: result.design.dieW,
        dieH: result.design.dieH,
        blocks: result.design.blocks.map((block, index) =>
          index === 1 ? { ...block, x: first.x, y: first.y } : block,
        ),
      },
      data,
    );
    expect(overlapping.error).toMatch(/invalid/i);
    expect(overlapping.design).toBe(base);

    const malformed = applyDesignCommand(
      base,
      {
        type: "applyDesignContent",
        nodeId: result.design.nodeId,
        packageId: result.design.packageId,
        dieW: result.design.dieW,
        dieH: result.design.dieH,
        blocks: result.design.blocks.map((block, index) =>
          index === 0 ? { ...block, w: block.w + 1 } : block,
        ),
      },
      data,
    );
    expect(malformed.error).toMatch(/footprint/);
  });

  it("rejects an unknown preset at runtime", () => {
    expect(() =>
      autoPlace(emptyDesign(1971), data, tuning, { presetId: "missing-preset" }),
    ).toThrow(/Unknown design preset/);
  });
});
