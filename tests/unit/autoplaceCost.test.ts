import { describe, expect, it } from "vitest";

import { autoPlaceTargetTempC, createAutoPlaceContext, evaluateLayout } from "../../src/sim/design/autoplaceCost";
import type { ChipDesign } from "../../src/sim/design/types";
import { AUTOPLACE_FIXTURES, referenceDesign } from "../design/autoplaceFixtures";
import { data, emptyDesign, place, tuning } from "../design/helpers";

const fixture = AUTOPLACE_FIXTURES[0]!;

function boundingBox(design: ChipDesign): number {
  if (design.blocks.length === 0) {
    return 0;
  }
  const minX = Math.min(...design.blocks.map((block) => block.x));
  const minY = Math.min(...design.blocks.map((block) => block.y));
  const maxX = Math.max(...design.blocks.map((block) => block.x + block.w));
  const maxY = Math.max(...design.blocks.map((block) => block.y + block.h));
  return (maxX - minX) * (maxY - minY);
}

describe("auto-place cost terms", () => {
  it("counts only critical links in the wire term", () => {
    let critical = place(emptyDesign(1971), "decoder-hardwired", 0, 0);
    critical = place(critical, "alu", 5, 0);
    const criticalCost = evaluateLayout(
      createAutoPlaceContext(critical, data, tuning, { thermalIterations: 10 }),
      critical.blocks,
    );
    expect(criticalCost.wireMmBits).toBeGreaterThan(0);

    let normalOnly = place(emptyDesign(1971), "shifter", 0, 0);
    normalOnly = place(normalOnly, "alu", 5, 0);
    const normalCost = evaluateLayout(
      createAutoPlaceContext(normalOnly, data, tuning, { thermalIterations: 10 }),
      normalOnly.blocks,
    );
    expect(normalCost.wireMmBits).toBe(0);
  });

  it("reports the block bounding box area", () => {
    const reference = referenceDesign(fixture);
    const context = createAutoPlaceContext(reference, data, tuning, {
      thermalIterations: 10,
    });
    const cost = evaluateLayout(context, reference.blocks);
    expect(cost.boundingBoxAreaTiles).toBe(boundingBox(reference));
    expect(cost.area).toBeGreaterThan(0);
  });

  it("charges a large penalty for an edge-only violation", () => {
    const reference = referenceDesign(fixture);
    const context = createAutoPlaceContext(reference, data, tuning, {
      thermalIterations: 10,
    });
    const bus = reference.blocks.find((block) => block.typeId === "bus-interface");
    expect(bus).toBeDefined();
    if (bus === undefined) {
      return;
    }
    const moved: ChipDesign = {
      ...reference,
      blocks: reference.blocks.map((block) =>
        block.uid === bus.uid ? { ...block, x: 5, y: 5 } : block,
      ),
    };
    const cost = evaluateLayout(context, moved.blocks);
    expect(cost.edgeViolations).toBe(1);
    expect(cost.edge).toBeGreaterThanOrEqual(tuning.autoplace.edgePenalty);
  });

  it("reports RUDY overflow when tile capacity is exceeded", () => {
    const reference = referenceDesign(fixture);
    const crowdedTuning = {
      ...tuning,
      congestion: { ...tuning.congestion, tracksPerTile: 0.5 },
    };
    const context = createAutoPlaceContext(reference, data, crowdedTuning, {
      thermalIterations: 10,
    });
    const cost = evaluateLayout(context, reference.blocks);
    expect(cost.totalOverflowTracks).toBeGreaterThan(0);
    expect(cost.overflowTiles).toBeGreaterThan(0);
    expect(cost.congestion).toBeGreaterThan(0);
  });

  it("targets a comfortable rise but never above the package limit", () => {
    const pkg = data.packageById["plastic-dip"];
    const ceramic = data.packageById["ceramic-dip"];
    expect(pkg).toBeDefined();
    expect(ceramic).toBeDefined();
    if (pkg === undefined || ceramic === undefined) {
      return;
    }
    expect(autoPlaceTargetTempC(tuning, pkg)).toBe(
      tuning.physical.ambientTempC + tuning.autoplace.thermalTargetRiseC,
    );
    expect(autoPlaceTargetTempC(tuning, ceramic)).toBe(
      tuning.physical.ambientTempC + tuning.autoplace.thermalTargetRiseC,
    );
    const tight = { ...pkg, maxJunctionTempC: tuning.physical.ambientTempC + 10 };
    expect(autoPlaceTargetTempC(tuning, tight)).toBe(
      tuning.physical.ambientTempC + 10 - tuning.autoplace.thermalTargetMarginC,
    );
  });
});
