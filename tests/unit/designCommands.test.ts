import { describe, expect, it } from "vitest";

import { applyCommands } from "../../src/sim/core/commands";
import { createNewGame, getActiveDesign } from "../../src/sim/core/state";
import { applyDesignCommand } from "../../src/sim/design/commands";
import { validateDesignGeometry } from "../../src/sim/design/floorplan";
import { countLinksByTiming, generateLinks } from "../../src/sim/design/links";
import { data, emptyDesign, place, run } from "../design/helpers";

describe("the 1971 example chip", () => {
  it("can be built by hand on the default die", () => {
    let design = emptyDesign(1971);

    design = place(design, "decoder-microcoded", 0, 0, {
      config: { microcodeWords: 128, microcodeWidth: 16 },
    });
    design = place(design, "io-pads", 0, 5, {
      config: { dataPins: 4, addressPins: 0, controlPins: 2 },
    });
    design = place(design, "bus-interface", 5, 0, {
      config: { busWidth: 4, multiplexed: true, prefetchBytes: 0 },
    });
    design = place(design, "register-file", 5, 6, {
      config: { registers: 16, width: 4, ports: 3 },
      aspectRatio: 0.5,
    });
    design = place(design, "program-counter", 7, 6, {
      config: { addressWidth: 4 },
      aspectRatio: 2,
    });
    design = place(design, "alu", 7, 8, {
      config: { width: 4, carry: "ripple" },
      aspectRatio: 2,
    });

    expect(design.blocks).toHaveLength(6);
    expect(validateDesignGeometry(design, (typeId) => data.blockById[typeId]?.edgeOnly === true)).toBeNull();

    const links = generateLinks(design, data);
    expect(countLinksByTiming(links)).toEqual({ critical: 6, normal: 1, relaxed: 0 });
    expect(links.map((link) => link.widthBits)).toEqual(
      expect.arrayContaining([4, 8]),
    );
  });

  it("rejects a component that does not fit the chosen layout", () => {
    let design = place(emptyDesign(1971), "decoder-microcoded", 0, 0, {
      config: { microcodeWords: 128, microcodeWidth: 16 },
    });
    const result = applyDesignCommand(
      design,
      {
        type: "placeBlock",
        blockTypeId: "io-pads",
        x: 1,
        y: 1,
        config: { dataPins: 4, addressPins: 0, controlPins: 2 },
      },
      data,
    );
    expect(result.error).toMatch(/overlaps|edge-only/);
    design = result.design;
    expect(design.blocks).toHaveLength(1);
  });
});

describe("design command integration", () => {
  it("edits the active design and reports command failures", () => {
    const base = createNewGame({ seed: 7, startYear: 1971 });
    const design = getActiveDesign(base);

    const placed = applyCommands(base, [
      {
        type: "editDesign",
        designId: design.id,
        command: {
          type: "placeBlock",
          blockTypeId: "program-counter",
          x: 0,
          y: 0,
          config: { addressWidth: 4 },
        },
      },
    ]);
    expect(placed.failures).toHaveLength(0);
    expect(getActiveDesign(placed.state).blocks).toHaveLength(1);

    const failed = applyCommands(placed.state, [
      {
        type: "editDesign",
        designId: design.id,
        command: {
          type: "placeBlock",
          blockTypeId: "alu",
          x: 0,
          y: 0,
          config: { width: 4, carry: "ripple" },
        },
      },
    ]);
    expect(failed.failures[0]).toMatch(/overlaps/);
    expect(failed.state).toBe(placed.state);
  });

  it("recalculates every footprint when the process node changes", () => {
    let design = place(emptyDesign(), "decoder-hardwired", 0, 0);
    const before = design.blocks[0];
    design = run(design, { type: "setNode", nodeId: "6um-nmos" });
    const after = design.blocks[0];
    expect(design.nodeId).toBe("6um-nmos");
    expect(before).toMatchObject({ w: 4, h: 4 });
    expect(after).toMatchObject({ w: 3, h: 4 });
  });

  it("toggles critical link pipelining and rejects non-critical links", () => {
    let design = place(emptyDesign(), "register-file", 0, 0);
    design = place(design, "alu", 4, 0);
    design = place(design, "decoder-hardwired", 0, 5);
    const links = generateLinks(design, data);
    const critical = links.find(
      (link) =>
        link.timing === "critical" &&
        link.fromTypeId === "register-file" &&
        link.toTypeId === "alu",
    );
    const normal = links.find((link) => link.timing === "normal");
    if (critical === undefined || normal === undefined) {
      throw new Error("fixture must contain both a critical and a normal link");
    }

    const rejected = applyDesignCommand(
      design,
      { type: "setLinkPipelined", linkId: normal.id, pipelined: true },
      data,
    );
    expect(rejected.changed).toBe(false);
    expect(rejected.error).toMatch(/Only critical links/);

    const unknown = applyDesignCommand(
      design,
      { type: "setLinkPipelined", linkId: "no-such-link", pipelined: true },
      data,
    );
    expect(unknown.error).toMatch(/does not exist/);

    const pipelined = applyDesignCommand(
      design,
      { type: "setLinkPipelined", linkId: critical.id, pipelined: true },
      data,
    );
    expect(pipelined.changed).toBe(true);
    expect(pipelined.design.pipelinedLinks).toEqual([critical.id]);

    const repeated = applyDesignCommand(
      pipelined.design,
      { type: "setLinkPipelined", linkId: critical.id, pipelined: true },
      data,
    );
    expect(repeated.changed).toBe(false);
    expect(repeated.design).toBe(pipelined.design);

    const cleared = applyDesignCommand(
      pipelined.design,
      { type: "setLinkPipelined", linkId: critical.id, pipelined: false },
      data,
    );
    expect(cleared.changed).toBe(true);
    expect(cleared.design.pipelinedLinks).toEqual([]);
  });
});
