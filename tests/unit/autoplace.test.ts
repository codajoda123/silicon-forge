import { describe, expect, it } from "vitest";

import { getTuning } from "../../src/data/gameData";
import { autoPlace } from "../../src/sim/design/autoplace";
import {
  createAutoPlaceContext,
  evaluateLayout,
  relativePlacementScore,
} from "../../src/sim/design/autoplaceCost";
import { validateDesignGeometry } from "../../src/sim/design/floorplan";
import type { ChipDesign } from "../../src/sim/design/types";
import { AUTOPLACE_FIXTURES, randomDesign, referenceDesign } from "../design/autoplaceFixtures";
import { data, run, tuning } from "../design/helpers";

const isEdgeOnly = (typeId: string): boolean => data.blockById[typeId]?.edgeOnly === true;

function scoringContext(fixture: (typeof AUTOPLACE_FIXTURES)[number]) {
  const reference = referenceDesign(fixture);
  const context = createAutoPlaceContext(reference, data, tuning, {
    thermalIterations: getTuning().physical.thermalIterations,
  });
  return {
    reference,
    context,
    referenceCost: evaluateLayout(context, reference.blocks).cost,
  };
}

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

describe("auto-place acceptance fixtures", () => {
  for (const fixture of AUTOPLACE_FIXTURES) {
    it(`${fixture.id}: scores 75-95% of the reference and beats random layouts`, () => {
      const { reference, context, referenceCost } = scoringContext(fixture);
      const start = randomDesign(fixture, fixture.startSeed);
      const result = autoPlace(start, data, tuning, { seed: fixture.autoSeed });
      const autoCost = evaluateLayout(context, result.design.blocks).cost;
      const score = relativePlacementScore(referenceCost, autoCost);

      expect(score).toBeGreaterThanOrEqual(75);
      expect(score).toBeLessThanOrEqual(95);
      expect(autoCost).toBeGreaterThan(0);

      for (const seed of fixture.randomSeeds) {
        const random = randomDesign(fixture, seed);
        const randomCost = evaluateLayout(context, random.blocks).cost;
        expect(autoCost).toBeLessThan(randomCost);
      }

      expect(result.changed).toBe(true);
      expect(result.design.blocks).toHaveLength(reference.blocks.length);
      expect(blockSignature(result.design)).toEqual(blockSignature(reference));
      expect(validateDesignGeometry(result.design, isEdgeOnly)).toBeNull();
      expect(result.report.lockedBlocks).toBe(0);
      expect(result.report.finalCost).toBeGreaterThan(0);
      expect(result.report.finalCost).toBeLessThan(result.report.initialCost);
      expect(result.report.reasons.length).toBeGreaterThan(0);
      expect(result.report.reasons.length).toBeLessThanOrEqual(3);
      const shareSum = result.report.reasons.reduce((sum, reason) => sum + reason.share, 0);
      expect(shareSum).toBeLessThanOrEqual(1.0000001);
      for (const reason of result.report.reasons) {
        expect(reason.share).toBeGreaterThan(0);
        expect(reason.detail.length).toBeGreaterThan(0);
      }
    });
  }
});

describe("auto-place determinism and search controls", () => {
  const fixture = AUTOPLACE_FIXTURES[0]!;

  it("produces the same layout and report for the same seed", () => {
    const start = randomDesign(fixture, fixture.startSeed);
    const first = autoPlace(start, data, tuning, { seed: 1234 });
    const second = autoPlace(start, data, tuning, { seed: 1234 });
    expect(second.design.blocks).toEqual(first.design.blocks);
    expect(second.report).toEqual(first.report);

    const different = autoPlace(start, data, tuning, { seed: 1235 });
    expect(different.design.blocks).not.toEqual(first.design.blocks);
  });

  it("scales iterations with the EDA level", () => {
    const start = randomDesign(fixture, fixture.startSeed);
    const result = autoPlace(start, data, tuning, { edaLevel: 2, seed: 7 });
    expect(result.report.edaLevel).toBe(2);
    expect(result.report.iterations).toBe(tuning.autoplace.baseIterations * 2);
  });

  it("keeps locked blocks fixed", () => {
    let design = randomDesign(fixture, fixture.startSeed);
    const first = design.blocks[0]!;
    const third = design.blocks[2]!;
    design = run(design, { type: "setBlockLocked", uid: first.uid, locked: true });
    design = run(design, { type: "setBlockLocked", uid: third.uid, locked: true });
    const before = new Map(design.blocks.map((block) => [block.uid, block]));

    const result = autoPlace(design, data, tuning, { seed: 99 });
    expect(result.report.lockedBlocks).toBe(2);
    for (const uid of [first.uid, third.uid]) {
      const original = before.get(uid);
      const updated = result.design.blocks.find((block) => block.uid === uid);
      expect(updated).toEqual(original);
    }
    expect(validateDesignGeometry(result.design, isEdgeOnly)).toBeNull();
  });

  it("returns unchanged when every block is locked", () => {
    const start = randomDesign(fixture, fixture.startSeed);
    const locked: ChipDesign = {
      ...start,
      blocks: start.blocks.map((block) => ({ ...block, locked: true })),
    };
    const result = autoPlace(locked, data, tuning, { seed: 9 });
    expect(result.changed).toBe(false);
    expect(result.design.blocks).toEqual(locked.blocks);
    expect(result.report.lockedBlocks).toBe(locked.blocks.length);
    expect(result.report.movedBlocks).toBe(0);
    expect(result.report.finalCost).toBe(result.report.initialCost);
  });

  it("keeps region-constrained blocks inside their regions", () => {
    const { reference } = scoringContext(fixture);
    const io = reference.blocks[0];
    const alu = reference.blocks[5];
    expect(io).toBeDefined();
    expect(alu).toBeDefined();
    if (io === undefined || alu === undefined) {
      return;
    }

    let design = run(reference, {
      type: "setBlockRegion",
      uid: io.uid,
      region: { x: 8, y: 11, w: 6, h: 3 },
    });
    design = run(design, {
      type: "setBlockRegion",
      uid: alu.uid,
      region: { x: 4, y: 9, w: 7, h: 5 },
    });
    const result = autoPlace(design, data, tuning, { seed: 5 });
    expect(result.report.regionedBlocks).toBe(2);
    for (const uid of [io.uid, alu.uid]) {
      const block = result.design.blocks.find((candidate) => candidate.uid === uid);
      const region = block?.region;
      expect(block).toBeDefined();
      expect(region).toBeDefined();
      if (block === undefined || region === undefined) {
        continue;
      }
      expect(block.x).toBeGreaterThanOrEqual(region.x);
      expect(block.y).toBeGreaterThanOrEqual(region.y);
      expect(block.x + block.w).toBeLessThanOrEqual(region.x + region.w);
      expect(block.y + block.h).toBeLessThanOrEqual(region.y + region.h);
    }
    expect(validateDesignGeometry(result.design, isEdgeOnly)).toBeNull();
  });
});

describe("auto-place modes and report", () => {
  it("weights wire, thermal and area differently in each mode", () => {
    const fixture = AUTOPLACE_FIXTURES[4]!;
    const reference = referenceDesign(fixture);
    const performance = evaluateLayout(
      createAutoPlaceContext(reference, data, tuning, {
        mode: "performance",
        thermalIterations: getTuning().physical.thermalIterations,
      }),
      reference.blocks,
    );
    const thermal = evaluateLayout(
      createAutoPlaceContext(reference, data, tuning, {
        mode: "thermal",
        thermalIterations: getTuning().physical.thermalIterations,
      }),
      reference.blocks,
    );
    const area = evaluateLayout(
      createAutoPlaceContext(reference, data, tuning, {
        mode: "area",
        thermalIterations: getTuning().physical.thermalIterations,
      }),
      reference.blocks,
    );

    expect(thermal.heat).toBeGreaterThan(performance.heat);
    expect(area.area).toBeGreaterThan(performance.area);
    expect(thermal.wire).toBeLessThan(performance.wire);
    expect(area.wire).toBeLessThan(performance.wire);
  });

  it("thermal mode spreads more heat than performance mode", () => {
    const fixture = AUTOPLACE_FIXTURES[4]!;
    const start = randomDesign(fixture, fixture.startSeed);
    const performance = autoPlace(start, data, tuning, {
      mode: "performance",
      seed: fixture.autoSeed,
    });
    const thermal = autoPlace(start, data, tuning, {
      mode: "thermal",
      seed: fixture.autoSeed,
    });
    expect(thermal.report.final.hotspotC).toBeLessThanOrEqual(
      performance.report.final.hotspotC,
    );
    expect(thermal.report.mode).toBe("thermal");
  });

  it("area mode produces a more compact footprint", () => {
    const fixture = AUTOPLACE_FIXTURES[0]!;
    const start = randomDesign(fixture, fixture.startSeed);
    const performance = autoPlace(start, data, tuning, {
      mode: "performance",
      seed: fixture.autoSeed,
    });
    const area = autoPlace(start, data, tuning, {
      mode: "area",
      seed: fixture.autoSeed,
    });
    expect(area.report.final.boundingBoxAreaTiles).toBeLessThan(
      performance.report.final.boundingBoxAreaTiles,
    );
    expect(area.report.mode).toBe("area");
  });

  it("reports a finite cost improvement and at most three reasons", () => {
    const fixture = AUTOPLACE_FIXTURES[2]!;
    const start = randomDesign(fixture, fixture.startSeed);
    const result = autoPlace(start, data, tuning, { seed: fixture.autoSeed });
    expect(Number.isFinite(result.report.initialCost)).toBe(true);
    expect(Number.isFinite(result.report.finalCost)).toBe(true);
    expect(result.report.improvementPct).toBeGreaterThan(0);
    expect(result.report.reasons.length).toBeLessThanOrEqual(3);
    expect(result.report.reasons[0]?.label.length).toBeGreaterThan(0);
  });
});

describe("relative placement score", () => {
  it("is 100 for equal cost and falls as cost rises", () => {
    expect(relativePlacementScore(4, 4)).toBe(100);
    expect(relativePlacementScore(4, 5)).toBe(80);
    expect(relativePlacementScore(4, 8)).toBe(50);
  });

  it("rejects non-positive costs", () => {
    expect(() => relativePlacementScore(0, 1)).toThrow(/positive/);
    expect(() => relativePlacementScore(1, 0)).toThrow(/positive/);
  });
});
