import { describe, expect, it } from "vitest";

import { countLinksByTiming, generateLinks } from "../../src/sim/design/links";
import { data, emptyDesign, place, run } from "../design/helpers";

function twoAluDesign() {
  let design = emptyDesign();
  design = place(design, "register-file", 0, 0, {
    config: { registers: 16, width: 8, ports: 3 },
  });
  design = place(design, "alu", 4, 0, { config: { width: 8, carry: "ripple" } });
  design = place(design, "alu", 0, 4, { config: { width: 8, carry: "ripple" } });
  return design;
}

describe("auto-generated links", () => {
  it("creates a link for every matching block instance", () => {
    const links = generateLinks(twoAluDesign(), data);
    expect(links).toHaveLength(4);
    expect(new Set(links.map((link) => link.id)).size).toBe(4);
    expect(links.every((link) => link.timing === "critical")).toBe(true);
    expect(links.every((link) => link.widthBits === 8)).toBe(true);
  });

  it("evaluates link width from the source block's config", () => {
    let design = emptyDesign();
    design = run(design, { type: "resizeDie", dieW: 20, dieH: 20 });
    design = place(design, "program-counter", 0, 0, {
      config: { addressWidth: 16 },
    });
    design = place(design, "bus-interface", 16, 16, {
      config: { busWidth: 8, multiplexed: true, prefetchBytes: 0 },
    });

    const links = generateLinks(design, data);
    const pcLink = links.find(
      (link) => link.fromTypeId === "program-counter" && link.toTypeId === "bus-interface",
    );
    expect(pcLink?.widthBits).toBe(16);
    expect(pcLink?.timing).toBe("critical");

    const padLink = links.find(
      (link) => link.fromTypeId === "bus-interface" && link.toTypeId === "io-pads",
    );
    expect(padLink).toBeUndefined();
  });

  it("counts timing classes for the estimates panel", () => {
    const links = generateLinks(twoAluDesign(), data);
    expect(countLinksByTiming(links)).toEqual({ critical: 4, normal: 0, relaxed: 0 });
  });
});
