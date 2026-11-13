import { describe, expect, it } from "vitest";

import { getTuning } from "../../src/data/gameData";
import { applyCommands } from "../../src/sim/core/commands";
import { createNewGame, getPlayerCompany, SAVE_VERSION, type GameState } from "../../src/sim/core/state";
import { step } from "../../src/sim/core/step";

const tuning = getTuning();

function runWeeks(state: GameState, weeks: number): GameState {
  let current = state;
  for (let index = 0; index < weeks; index += 1) {
    current = step(current).state;
  }
  return current;
}

describe("weekly step", () => {
  it("advances the clock by exactly one week per call", () => {
    const base = createNewGame({ seed: 1 });
    const first = step(base);
    expect(first.state.week).toBe(1);
    expect(step(first.state).state.week).toBe(2);
    expect(step(base).state.week).toBe(1);
  });

  it("does not mutate the input state", () => {
    const base = createNewGame({ seed: 1 });
    const weekBefore = base.week;
    const logBefore = base.log.length;

    step(base, [{ type: "setCompanyName", name: "Changed" }]);

    expect(base.week).toBe(weekBefore);
    expect(base.log.length).toBe(logBefore);
    expect(getPlayerCompany(base).name).toBe(base.settings.companyName);
  });

  it("applies commands before advancing time", () => {
    const base = createNewGame({ seed: 1 });
    const result = step(base, [{ type: "setCompanyName", name: "  Acme Micro  " }]);

    expect(result.state.week).toBe(1);
    expect(result.state.settings.companyName).toBe("Acme Micro");
    expect(getPlayerCompany(result.state).name).toBe("Acme Micro");
    expect(result.events.map((event) => event.kind)).toContain("companyRenamed");
    expect(result.state.log.at(-1)?.message).toBe("Company renamed to Acme Micro.");
  });

  it("applies immediate commands without advancing time", () => {
    const base = createNewGame({ seed: 1 });
    const result = applyCommands(base, [{ type: "setCompanyName", name: "Paused Rename" }]);

    expect(result.state.week).toBe(base.week);
    expect(getPlayerCompany(result.state).name).toBe("Paused Rename");
  });

  it("ignores empty or whitespace-only names", () => {
    const base = createNewGame({ seed: 1 });
    const result = step(base, [{ type: "setCompanyName", name: "   " }]);

    expect(getPlayerCompany(result.state).name).toBe(base.settings.companyName);
    expect(result.state.log.some((event) => event.kind === "companyRenamed")).toBe(false);
  });

  it("logs exactly one year-change event at the calendar boundary", () => {
    const base = createNewGame({ seed: 1, startYear: 1971 });

    const after52 = runWeeks(base, 52);
    expect(after52.log.filter((event) => event.kind === "yearChanged")).toHaveLength(0);

    const after53 = runWeeks(base, 53);
    const yearEvents = after53.log.filter((event) => event.kind === "yearChanged");
    expect(yearEvents).toHaveLength(1);
    expect(yearEvents[0]?.message).toBe("It is now 1972.");
  });

  it("caps the event log at the tuned maximum", () => {
    let state = createNewGame({ seed: 1 });
    const weeks = tuning.log.maxEntries + 25;

    for (let index = 0; index < weeks; index += 1) {
      state = step(state, [{ type: "setCompanyName", name: `Company ${index}` }]).state;
    }

    expect(state.log.length).toBe(tuning.log.maxEntries);
  });

  it("creates a valid default new game from tuning", () => {
    const state = createNewGame();
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.week).toBe(0);
    expect(state.seed).toBe(tuning.newGame.defaultSeed);
    expect(state.settings.startYear).toBe(tuning.time.defaultStartYear);
    expect(state.companies).toHaveLength(1);
    expect(state.companies[0]?.isPlayer).toBe(true);
    expect(getPlayerCompany(state).cash).toBe(tuning.newGame.startingCash);
    expect(state.designs).toHaveLength(1);
    expect(state.designs[0]?.dieW).toBe(tuning.design.defaultDieWidth);
    expect(state.designs[0]?.dieH).toBe(tuning.design.defaultDieHeight);
  });

  it("rejects invalid seeds and start years", () => {
    expect(() => createNewGame({ seed: Number.NaN })).toThrow();
    expect(() => createNewGame({ startYear: 1800 })).toThrow();
    expect(() => createNewGame({ startYear: 2200 })).toThrow();
  });
});
