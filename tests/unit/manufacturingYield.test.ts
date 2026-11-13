import { describe, expect, it } from "vitest";

import { data } from "../design/helpers";
import {
  defectDensity,
  dieYield,
  diesPerWafer,
  goodDiesPerWafer,
  weeksSinceNodeIntro,
} from "../../src/sim/fab/yield";

describe("manufacturing yield reference values", () => {
  it("matches the Section 11.2 dies-per-wafer formula", () => {
    expect(diesPerWafer(50, 12)).toBe(131);
    expect(diesPerWafer(75, 35)).toBe(98);
    expect(diesPerWafer(100, 20)).toBe(343);
  });

  it("matches the Section 11.3 negative-binomial yield reference", () => {
    expect(dieYield(12, 5, 2.5)).toBeCloseTo(0.5840442963929985, 12);
    expect(dieYield(35, 2.5, 2.5)).toBeCloseTo(0.4722430539499974, 12);
    expect(goodDiesPerWafer(50, 12, dieYield(12, 5, 2.5))).toBeCloseTo(
      131 * 0.5840442963929985,
      10,
    );
  });

  it("decays D0 with process maturity and applies fab learning", () => {
    const node = data.nodeById["10um-pmos"];
    if (node === undefined) {
      throw new Error("fixture node missing");
    }
    expect(defectDensity(node, 0)).toBeCloseTo(8, 12);
    expect(defectDensity(node, 80)).toBeCloseTo(4.523336926442933, 12);
    expect(defectDensity(node, 80, 0.5)).toBeCloseTo(3.5116684632214665, 12);
    expect(weeksSinceNodeIntro(1971, 52, node)).toBe(52);
  });

  it("rejects invalid yield inputs instead of producing NaN", () => {
    expect(() => diesPerWafer(0, 12)).toThrow(/positive/);
    expect(() => diesPerWafer(50, 0)).toThrow(/positive/);
    expect(() => dieYield(12, 5, 0)).toThrow(/positive/);
  });
});