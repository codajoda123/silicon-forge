import { describe, expect, it } from "vitest";

import { createRngSet, rngSetFromSnapshot } from "../../src/sim/core/rng";

function sequence(seed: number, stream: string, count: number): number[] {
  const rng = createRngSet(seed).stream(stream);
  return Array.from({ length: count }, () => rng.next());
}

describe("seeded RNG", () => {
  it("produces the same sequence for the same seed and stream", () => {
    expect(sequence(12345, "world", 20)).toEqual(sequence(12345, "world", 20));
  });

  it("produces different sequences for different seeds", () => {
    expect(sequence(1, "world", 20)).not.toEqual(sequence(2, "world", 20));
  });

  it("keeps streams independent", () => {
    const interleaved = createRngSet(999);
    const firstAlpha = Array.from({ length: 5 }, () => interleaved.stream("alpha").next());
    for (let index = 0; index < 10; index += 1) {
      interleaved.stream("beta").next();
    }
    const secondAlpha = Array.from({ length: 5 }, () => interleaved.stream("alpha").next());

    const untouched = createRngSet(999);
    const baseline = Array.from({ length: 10 }, () => untouched.stream("alpha").next());
    expect([...firstAlpha, ...secondAlpha]).toEqual(baseline);
  });

  it("restores an exact sequence from a snapshot", () => {
    const set = createRngSet(4242);
    const world = set.stream("world");
    world.next();
    world.next();

    const snapshot = set.snapshot();
    const expected = [world.next(), world.next(), world.next()];

    const restored = rngSetFromSnapshot(snapshot);
    const restoredRng = restored.stream("world");
    const actual = [restoredRng.next(), restoredRng.next(), restoredRng.next()];

    expect(actual).toEqual(expected);
    expect(restored.snapshot()).toEqual(set.snapshot());
  });

  it("starts with no initialized streams", () => {
    expect(createRngSet(7).snapshot().streams).toEqual({});
  });

  it("nextUint32 returns unsigned 32-bit integers", () => {
    const rng = createRngSet(3).stream("ints");
    for (let index = 0; index < 500; index += 1) {
      const value = rng.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("next stays in [0, 1)", () => {
    const rng = createRngSet(4).stream("floats");
    for (let index = 0; index < 500; index += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("nextInt respects bounds and covers every value", () => {
    const rng = createRngSet(5).stream("range");
    const seen = new Set<number>();
    for (let index = 0; index < 2000; index += 1) {
      const value = rng.nextInt(3, 7);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThan(7);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it("chance handles the boundaries and rejects invalid probabilities", () => {
    const rng = createRngSet(6).stream("chance");
    for (let index = 0; index < 100; index += 1) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
    expect(() => rng.chance(-0.1)).toThrow();
    expect(() => rng.chance(1.1)).toThrow();
    expect(() => rng.chance(Number.NaN)).toThrow();
  });

  it("pick returns a member and rejects an empty list", () => {
    const rng = createRngSet(8).stream("pick");
    const items = ["a", "b", "c"] as const;
    for (let index = 0; index < 50; index += 1) {
      expect(items).toContain(rng.pick(items));
    }
    expect(() => rng.pick([])).toThrow();
  });

  it("rejects empty stream names and bad seeds", () => {
    const set = createRngSet(9);
    expect(() => set.stream("")).toThrow();
    expect(() => createRngSet(Number.NaN)).toThrow();
    expect(() => createRngSet(1.5)).toThrow();
  });
});
