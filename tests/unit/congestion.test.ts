import { describe, expect, it } from "vitest";

import { analyzeCongestion } from "../../src/sim/design/congestion";
import { generateLinks } from "../../src/sim/design/links";
import type { DesignLink } from "../../src/sim/design/types";
import { data, emptyDesign, place, tuning } from "../design/helpers";

function twoBlockDesign(): { design: ReturnType<typeof emptyDesign>; link: DesignLink } {
  let design = place(emptyDesign(), "register-file", 0, 0);
  design = place(design, "alu", 4, 0);
  const links = generateLinks(design, data);
  const link = links[0];
  if (link === undefined) {
    throw new Error("fixture must generate at least one link");
  }
  return { design, link };
}

describe("RUDY congestion", () => {
  it("reports zero demand and overflow for a design with no links", () => {
    const design = place(emptyDesign(), "alu", 0, 0);
    const result = analyzeCongestion(design, [], data, tuning);
    expect(result.capacityPerTile).toBe(48);
    expect(result.maxOverflow).toBe(0);
    expect(result.overflowTiles).toBe(0);
    expect(result.linkDetours).toEqual([]);
    expect(result.demand.every((value) => value === 0)).toBe(true);
    expect(result.why).toEqual([]);
  });

  it("spreads width * (w + h) / (w * h) demand across each link box", () => {
    const { design } = twoBlockDesign();
    const links = generateLinks(design, data);
    const result = analyzeCongestion(design, links, data, tuning);
    // RF center (2,2), ALU center (5.5,1.5) -> a 4x2 tile box; each 8-bit
    // link adds 8 * (4+2)/(4*2) = 6, and both directions overlap.
    expect(result.demand[1 * design.dieW + 3]).toBeCloseTo(12);
    expect(result.maxOverflow).toBe(0);
    expect(result.linkDetours.every((entry) => entry.detour === 1)).toBe(true);
  });

  it("overflows, detours and explains congested tiles", () => {
    const { design, link } = twoBlockDesign();
    const links: DesignLink[] = Array.from({ length: 10 }, (_, index) => ({
      ...link,
      id: `heavy-${String(index)}`,
      widthBits: 32,
    }));
    const result = analyzeCongestion(design, links, data, tuning);
    expect(result.maxOverflow).toBeGreaterThan(0);
    expect(result.overflowTiles).toBe(8);
    expect(result.linkDetours).toHaveLength(10);
    for (const entry of result.linkDetours) {
      expect(entry.detour).toBeCloseTo(9);
    }
    expect(result.why.reduce((sum, entry) => sum + entry.share, 0)).toBeCloseTo(1);
    expect(result.why[0]?.label).toMatch(/^Tile \d+,\d+$/);
  });
});
