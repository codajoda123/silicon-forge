import { describe, expect, it } from "vitest";

import { createRngSet } from "../../src/sim/core/rng";
import { runBinning, SCRAP_BIN } from "../../src/sim/fab/binning";
import type { Sku } from "../../src/sim/fab/types";
import { data, emptyDesign, place, tuning } from "../design/helpers";

function sku(overrides: Partial<Sku> & Pick<Sku, "id" | "name" | "price">): Sku {
  return {
    minFreqMHz: 0,
    requiredBlocks: [],
    disabledBlocks: [],
    maxPowerW: null,
    allocationTarget: null,
    ...overrides,
  };
}

function sharesSum(shares: Readonly<Record<string, number>>): number {
  return Object.values(shares).reduce((sum, share) => sum + share, 0);
}

const baseInput = {
  d0PerCm2: 3,
  designFrequencyMHz: 10,
  sigmaFreq: 0.2,
  powerAtDesignW: 1,
  escapeRate: 0.01,
  sampleSize: 1000,
};

describe("Monte Carlo binning", () => {
  it("assigns every sampled die to one bin or scrap so shares sum to 100%", () => {
    const skus = [
      sku({ id: "pro", name: "Pro", price: 200, minFreqMHz: 8 }),
      sku({ id: "value", name: "Value", price: 80, minFreqMHz: 0 }),
    ];
    const sample = runBinning(
      createRngSet(1234).stream("manufacturing"),
      {
        ...baseInput,
        design: emptyDesign(),
        data,
        tuning,
        skus,
      },
    );

    expect(sharesSum(sample.shares)).toBeCloseTo(1, 12);
    expect(sample.shares[SCRAP_BIN]).toBeCloseTo(sample.scrapCount / 1000, 12);
    expect(
      Object.values(sample.counts).reduce((sum, count) => sum + count, 0) + sample.scrapCount,
    ).toBe(1000);
  });

  it("down-bins qualifying dies when an allocation target caps the premium SKU", () => {
    const skus = [
      sku({ id: "pro", name: "Pro", price: 200, allocationTarget: 0.25 }),
      sku({ id: "value", name: "Value", price: 80 }),
    ];
    const sample = runBinning(
      createRngSet(99).stream("manufacturing"),
      {
        ...baseInput,
        design: emptyDesign(),
        data,
        tuning,
        skus,
      },
    );

    expect(sample.counts.pro).toBeGreaterThan(0);
    expect(sample.counts.pro).toBeLessThanOrEqual(250);
    expect(sample.counts.value).toBeGreaterThan(sample.counts.pro ?? 0);
    expect(sharesSum(sample.shares)).toBeCloseTo(1, 12);
  });

  it("routes dies with a disabled block into the salvage SKU", () => {
    const design = place(emptyDesign(), "fpu", 4, 4);
    const skus = [
      sku({ id: "full", name: "Full", price: 200, requiredBlocks: ["fpu"] }),
      sku({
        id: "salvage",
        name: "Salvage",
        price: 60,
        disabledBlocks: ["fpu"],
      }),
    ];
    const sample = runBinning(
      createRngSet(7).stream("manufacturing"),
      {
        ...baseInput,
        d0PerCm2: 15,
        design,
        data,
        tuning,
        skus,
      },
    );

    expect(sample.counts.salvage).toBeGreaterThan(0);
    expect(sample.counts.full).toBeGreaterThan(0);
    expect(sharesSum(sample.shares)).toBeCloseTo(1, 12);
  });

  it("is deterministic for the same seed and input", () => {
    const skus = [sku({ id: "only", name: "Only", price: 100 })];
    const input = {
      ...baseInput,
      design: emptyDesign(),
      data,
      tuning,
      skus,
    };
    const first = runBinning(createRngSet(2026).stream("manufacturing"), input);
    const second = runBinning(createRngSet(2026).stream("manufacturing"), input);
    expect(second).toEqual(first);
  });
});