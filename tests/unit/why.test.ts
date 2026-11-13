import { describe, expect, it } from "vitest";

import { buildContributors } from "../../src/sim/explain/why";

describe("Why contributor shares", () => {
  it("orders contributions and normalizes shares to one", () => {
    const contributors = buildContributors([
      { label: "small", value: 1 },
      { label: "large", value: 3 },
      { label: "zero", value: 0 },
    ]);
    expect(contributors.map((entry) => entry.label)).toEqual(["large", "small"]);
    expect(contributors[0]?.share).toBeCloseTo(0.75);
    expect(contributors[1]?.share).toBeCloseTo(0.25);
    expect(contributors.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
  });

  it("folds values past the limit into a single Other row", () => {
    const contributors = buildContributors(
      [5, 4, 3, 2, 1].map((value, index) => ({
        label: `c${String(index)}`,
        value,
      })),
      { limit: 2, otherLabel: "Everything else" },
    );
    expect(contributors).toHaveLength(3);
    expect(contributors[2]?.label).toBe("Everything else");
    expect(contributors[2]?.share).toBeCloseTo((3 + 2 + 1) / 15);
    expect(contributors.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
  });

  it("returns no rows for an empty or non-positive total", () => {
    expect(buildContributors([])).toEqual([]);
    expect(buildContributors([{ label: "none", value: 0 }])).toEqual([]);
    expect(
      buildContributors([
        { label: "bad", value: Number.NaN },
        { label: "negative", value: -2 },
      ]),
    ).toEqual([]);
  });
});
