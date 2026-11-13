import { describe, expect, it } from "vitest";

import type { Command } from "../../src/sim/core/commands";
import { stateHash } from "../../src/sim/core/hash";
import { deserializeSave, serializeSave } from "../../src/sim/core/save";
import { createNewGame, type GameState } from "../../src/sim/core/state";
import { step } from "../../src/sim/core/step";

/** Commands issued at specific elapsed weeks (keyed by state.week before the step). */
const COMMAND_SCHEDULE: Readonly<Record<number, readonly Command[]>> = {
  10: [{ type: "setCompanyName", name: "Vector Dynamics" }],
  100: [{ type: "setCompanyName", name: "Vector Microsystems" }],
  260: [{ type: "setCompanyName", name: "Vector Semiconductor" }],
  400: [{ type: "setCompanyName", name: "Vector Systems" }],
};

function run(seed: number, weeks: number, from?: GameState): GameState {
  let state = from ?? createNewGame({ seed, startYear: 1971 });
  for (let index = 0; index < weeks; index += 1) {
    const commands = COMMAND_SCHEDULE[state.week] ?? [];
    state = step(state, commands).state;
  }
  return state;
}

describe("determinism", () => {
  it("same seed + same commands give an identical state after 520 weeks", () => {
    const first = run(2026, 520);
    const second = run(2026, 520);

    expect(first.week).toBe(520);
    expect(stateHash(second)).toBe(stateHash(first));
  });

  it("save/load in the middle of a run does not change the outcome", () => {
    const uninterrupted = run(424242, 520);

    const firstHalf = run(424242, 200);
    const reloaded = deserializeSave(serializeSave(firstHalf));
    const secondHalf = run(424242, 320, reloaded);

    expect(stateHash(secondHalf)).toBe(stateHash(uninterrupted));
  });

  it("different seeds produce different runs", () => {
    expect(stateHash(run(1, 10))).not.toBe(stateHash(run(2, 10)));
  });
});
