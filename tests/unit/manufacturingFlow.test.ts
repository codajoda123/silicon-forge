import { describe, expect, it } from "vitest";

import { getTuning } from "../../src/data/gameData";
import { applyCommands } from "../../src/sim/core/commands";
import { deserializeSave, serializeSave } from "../../src/sim/core/save";
import {
  createNewGame,
  getActiveDesign,
  getPlayerCompany,
  SAVE_VERSION,
  type GameState,
} from "../../src/sim/core/state";
import { step } from "../../src/sim/core/step";
import { pinUsage } from "../../src/sim/design/area";
import { data, tuning } from "../design/helpers";
import { assignSeverities, patchErrata } from "../../src/sim/fab/validation";
import { createRngSet } from "../../src/sim/core/rng";

function runWeeks(state: GameState, weeks: number): GameState {
  let current = state;
  for (let index = 0; index < weeks; index += 1) {
    current = step(current).state;
  }
  return current;
}

describe("manufacturing commands and flow", () => {
  it("signs reserved capacity with the tuned deposit and event", () => {
    const base = createNewGame({ seed: 11 });
    const design = getActiveDesign(base);
    const cashBefore = getPlayerCompany(base).cash;
    const result = applyCommands(base, [
      { type: "signFabContract", nodeId: design.nodeId, kind: "reserved" },
    ]);
    const reserved = result.state.manufacturing.fabs.find((fab) => fab.kind === "reserved");

    expect(result.failures).toEqual([]);
    expect(reserved?.capacityPerWeek).toBe(
      tuning.manufacturing.foundry.reserved.capacityPerWeek,
    );
    expect(getPlayerCompany(result.state).cash).toBe(
      cashBefore - tuning.manufacturing.foundry.reserved.upfrontCost,
    );
    expect(result.events[0]?.kind).toBe("fabContractSigned");
  });

  it("forces a multiplexing choice when separate buses exceed the pin limit", () => {
    let state = createNewGame({ seed: 12 });
    const design = getActiveDesign(state);
    state = applyCommands(state, [
      {
        type: "editDesign",
        designId: design.id,
        command: {
          type: "placeBlock",
          blockTypeId: "io-pads",
          x: 0,
          y: 0,
          config: { dataPins: 24, addressPins: 16, controlPins: 4 },
        },
      },
    ]).state;
    const placed = getActiveDesign(state);
    state = applyCommands(state, [
      {
        type: "editDesign",
        designId: design.id,
        command: {
          type: "setDesignSettings",
          settings: { ...placed.settings, busMultiplexed: false },
        },
      },
    ]).state;
    const separate = getActiveDesign(state);
    const separatePins = pinUsage(separate, data, tuning);

    expect(separatePins.pinsNeeded).toBe(24 + 16 + 4 + tuning.design.powerGroundPins);
    expect(separatePins.capacity).toBe(40);
    expect(separatePins.overflowWithoutMultiplexing).toBe(6);
    expect(separatePins.overflow).toBe(6);

    const blocked = applyCommands(state, [
      { type: "tapeOut", designId: design.id },
    ]);
    expect(blocked.failures[0]).toMatch(/Pin overflow: 6 pins/);
    expect(blocked.state).toBe(state);

    state = applyCommands(state, [
      {
        type: "editDesign",
        designId: design.id,
        command: {
          type: "setDesignSettings",
          settings: { ...separate.settings, busMultiplexed: true },
        },
      },
    ]).state;
    const multiplexed = pinUsage(getActiveDesign(state), data, tuning);

    expect(multiplexed.effectivePinsNeeded).toBe(
      Math.max(24, 16) + 4 + tuning.design.powerGroundPins,
    );
    expect(multiplexed.multiplexingSaves).toBe(16);
    expect(multiplexed.overflow).toBe(0);

    const released = applyCommands(state, [
      { type: "tapeOut", designId: design.id },
    ]);
    expect(released.failures).toEqual([]);
    expect(released.state.manufacturing.tapeouts).toHaveLength(1);
  });

  it("runs tape-out, wafer start, lead time, binning and inventory end to end", () => {
    const base = createNewGame({ seed: 2026 });
    const design = getActiveDesign(base);
    const taped = applyCommands(base, [{ type: "tapeOut", designId: design.id }]);

    expect(taped.failures).toEqual([]);
    const tapeOut = taped.state.manufacturing.tapeouts[0];
    expect(tapeOut?.status).toBe("released");
    const product = taped.state.manufacturing.products.find(
      (candidate) => candidate.designId === design.id,
    );
    expect(product).toBeDefined();
    expect(product?.skus.length).toBeGreaterThan(0);

    const fab = taped.state.manufacturing.fabs.find((candidate) => candidate.nodeId === design.nodeId);
    if (fab === undefined) {
      throw new Error("fixture fab missing");
    }
    const cashBefore = getPlayerCompany(taped.state).cash;
    const started = applyCommands(taped.state, [
      { type: "startWaferLot", designId: design.id, fabId: fab.id, wafers: 10 },
    ]);
    const lot = started.state.manufacturing.lots[0];
    const node = data.nodeById[design.nodeId];
    if (lot === undefined || node === undefined) {
      throw new Error("fixture lot or node missing");
    }

    expect(started.failures).toEqual([]);
    expect(getPlayerCompany(started.state).cash).toBe(
      cashBefore - fab.waferCostMultiplier * node.waferCost * 10,
    );
    expect(lot.finishWeek).toBe(
      Math.max(fab.leadTimeWeeks, node.cycleWeeks) +
        tuning.manufacturing.foundry.testAndPackageWeeks,
    );
    expect(lot.result.totalDies).toBe(10 * lot.result.dpw);
    expect(Object.values(lot.result.shares).reduce((sum, value) => sum + value, 0)).toBeCloseTo(
      1,
      12,
    );

    const testing = runWeeks(started.state, lot.waferReadyWeek);
    expect(testing.manufacturing.lots[0]?.status).toBe("testing");

    const completed = runWeeks(testing, tuning.manufacturing.foundry.testAndPackageWeeks);
    const finished = completed.manufacturing.lots[0];
    expect(finished?.status).toBe("completed");

    const stored = completed.manufacturing.inventory.filter((item) => item.productId === lot.productId);
    expect(stored.reduce((sum, item) => sum + item.quantity, 0)).toBe(finished?.result.goodDies);
    expect(stored.length).toBeGreaterThan(0);
    expect(deserializeSave(serializeSave(completed))).toEqual(completed);
  });

  it("advances validation coverage and hides the exact bug count in the UI model", () => {
    const base = createNewGame({ seed: 77 });
    const design = getActiveDesign(base);
    const started = applyCommands(base, [
      { type: "startValidation", designId: design.id },
    ]);
    const record = started.state.manufacturing.validations[0];
    expect(record?.actualBugs).toBe(0);
    expect(record?.foundBugs).toBe(0);

    const after = runWeeks(started.state, 4);
    const advanced = after.manufacturing.validations[0];
    expect(advanced?.validatedWeeks).toBe(4);
    expect(advanced?.coverage).toBeCloseTo(
      1 - Math.exp((-4 * tuning.manufacturing.validation.weeklySkill) / tuning.manufacturing.validation.coverageScaleWeeks),
      12,
    );
    expect(advanced?.foundBugs).toBe(0);
  });

  it("splits severities and patches half of errata for microcoded designs", () => {
    const severities = assignSeverities(100, createRngSet(5).stream("manufacturing"), tuning);
    const total = severities.cosmetic + severities.errata + severities.serious;
    expect(total).toBe(100);

    const patched = patchErrata(severities, tuning, true);
    expect(patched.patched).toBe(
      Math.floor(severities.errata * tuning.manufacturing.validation.microcodeErrataFixShare),
    );
    expect(patched.severities.errata + patched.patched).toBe(severities.errata);
    expect(patchErrata(severities, tuning, false).patched).toBe(0);
  });

  it("requires a respin or erratum when serious bugs survive tape-out", () => {
    const base = createNewGame({ seed: 31 });
    const design = getActiveDesign(base);
    const taped = applyCommands(base, [{ type: "tapeOut", designId: design.id }]).state;
    const awaiting: GameState = {
      ...taped,
      manufacturing: {
        ...taped.manufacturing,
        tapeouts: taped.manufacturing.tapeouts.map((record) => ({
          ...record,
          status: "awaitingErratumDecision" as const,
          remainingBugs: 1,
          severities: { cosmetic: 0, errata: 0, serious: 1 },
        })),
      },
    };
    const cashBefore = getPlayerCompany(awaiting).cash;
    const respin = applyCommands(awaiting, [
      { type: "respinDesign", designId: design.id },
    ]);
    const record = respin.state.manufacturing.tapeouts[0];
    const node = data.nodeById[design.nodeId];

    expect(respin.failures).toEqual([]);
    expect(record?.status).toBe("respinning");
    expect(record?.respinReadyWeek).toBe(awaiting.week + tuning.manufacturing.respinWeeks);
    expect(getPlayerCompany(respin.state).cash).toBe(cashBefore - (node?.maskSetCost ?? 0));

    const released = runWeeks(respin.state, tuning.manufacturing.respinWeeks);
    expect(released.manufacturing.tapeouts[0]?.status).toBe("released");
    expect(released.manufacturing.tapeouts[0]?.severities.serious).toBe(0);
  });

  it("can ship with an erratum instead of respinning", () => {
    const base = createNewGame({ seed: 32 });
    const design = getActiveDesign(base);
    const taped = applyCommands(base, [{ type: "tapeOut", designId: design.id }]).state;
    const awaiting: GameState = {
      ...taped,
      manufacturing: {
        ...taped.manufacturing,
        tapeouts: taped.manufacturing.tapeouts.map((record) => ({
          ...record,
          status: "awaitingErratumDecision" as const,
          remainingBugs: 1,
          severities: { cosmetic: 0, errata: 0, serious: 1 },
        })),
      },
    };
    const shipped = applyCommands(awaiting, [
      { type: "acceptErratum", designId: design.id },
    ]);

    expect(shipped.failures).toEqual([]);
    expect(shipped.state.manufacturing.tapeouts[0]?.status).toBe("released");
    expect(shipped.state.manufacturing.tapeouts[0]?.erratumAccepted).toBe(true);
  });

  it("invalidates validation and tape-out when the silicon changes", () => {
    const base = createNewGame({ seed: 41 });
    const design = getActiveDesign(base);
    const started = applyCommands(base, [
      { type: "startValidation", designId: design.id },
    ]).state;
    const taped = applyCommands(started, [{ type: "tapeOut", designId: design.id }]).state;
    expect(taped.manufacturing.tapeouts).toHaveLength(1);

    const edited = applyCommands(taped, [
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
    ]).state;

    expect(edited.manufacturing.tapeouts).toHaveLength(0);
    expect(edited.manufacturing.validations).toHaveLength(0);
    expect(edited.manufacturing.products).toHaveLength(1);
  });

  it("migrates a version 4 save by creating the starting fab contract", () => {
    const state = createNewGame({ seed: 55 });
    const raw = JSON.parse(serializeSave(state)) as Record<string, unknown>;
    raw.version = 4;
    delete raw.manufacturing;

    const migrated = deserializeSave(JSON.stringify(raw));
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.manufacturing.fabs).toHaveLength(1);
    expect(migrated.manufacturing.fabs[0]?.nodeId).toBe(getActiveDesign(migrated).nodeId);
    expect(getTuning().manufacturing.foundry.contract.capacityPerWeek).toBe(
      migrated.manufacturing.fabs[0]?.capacityPerWeek,
    );
  });
});