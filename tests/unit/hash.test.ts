import { describe, expect, it } from "vitest";

import { canonicalJson, stateHash } from "../../src/sim/core/hash";
import { createNewGame } from "../../src/sim/core/state";
import { step } from "../../src/sim/core/step";

describe("state hash", () => {
  it("canonicalizes object key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 }),
    );
  });

  it("hashes equal states equally", () => {
    expect(stateHash(createNewGame({ seed: 5 }))).toBe(stateHash(createNewGame({ seed: 5 })));
  });

  it("hashes different states differently", () => {
    const base = createNewGame({ seed: 5 });
    const advanced = step(base).state;
    expect(stateHash(advanced)).not.toBe(stateHash(base));
  });
});
