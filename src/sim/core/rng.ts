/**
 * Seeded, deterministic RNG (mulberry32) with named streams.
 *
 * Every subsystem gets its own stream, so adding a random draw in one
 * subsystem does not shift the sequence of another. The whole RNG state is
 * serializable (`RngSnapshot`) and lives inside `GameState`, which makes
 * save/load and replay deterministic.
 */

export interface RngSnapshot {
  seed: number;
  /** Current mulberry32 state per stream name. */
  streams: Record<string, number>;
}

export interface Rng {
  readonly stream: string;
  /** Uniform integer in [0, 2^32). */
  nextUint32(): number;
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [minInclusive, maxExclusive). */
  nextInt(minInclusive: number, maxExclusive: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
}

export interface RngSet {
  stream(name: string): Rng;
  snapshot(): RngSnapshot;
}

const UINT32_RANGE = 4294967296;

/** One mulberry32 step: returns the output and the next internal state. */
function mulberry32Step(state: number): readonly [output: number, nextState: number] {
  const nextState = (state + 0x6d2b79f5) >>> 0;
  let t = nextState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const output = (t ^ (t >>> 14)) >>> 0;
  return [output, nextState];
}

/** FNV-1a hash of a stream name, used to derive independent stream seeds. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Mix the master seed with a stream name into a 32-bit stream seed. */
function deriveStreamSeed(seed: number, name: string): number {
  let mixed = (seed ^ 0x9e3779b9) >>> 0;
  mixed = Math.imul(mixed ^ hashString(name), 0x85ebca6b) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer, received ${String(value)}`);
  }
}

function makeRngSet(masterSeed: number, initialStreams: Record<string, number> | null): RngSet {
  const state = new Map<string, number>();
  if (initialStreams !== null) {
    for (const [name, value] of Object.entries(initialStreams)) {
      assertInteger(value, `RNG stream "${name}" state`);
      state.set(name, value >>> 0);
    }
  }

  const stream = (name: string): Rng => {
    if (name.length === 0) {
      throw new Error("RNG stream name must not be empty");
    }
    if (!state.has(name)) {
      state.set(name, deriveStreamSeed(masterSeed, name));
    }

    const nextUint32 = (): number => {
      const current = state.get(name);
      if (current === undefined) {
        throw new Error(`RNG stream "${name}" is not initialized`);
      }
      const [output, nextState] = mulberry32Step(current);
      state.set(name, nextState);
      return output;
    };

    return {
      stream: name,
      nextUint32,
      next: () => nextUint32() / UINT32_RANGE,
      nextInt: (minInclusive, maxExclusive) => {
        assertInteger(minInclusive, "nextInt min");
        assertInteger(maxExclusive, "nextInt max");
        if (maxExclusive <= minInclusive) {
          throw new Error(
            `nextInt requires maxExclusive > minInclusive, received [${minInclusive}, ${maxExclusive})`,
          );
        }
        const span = maxExclusive - minInclusive;
        return minInclusive + Math.floor((nextUint32() / UINT32_RANGE) * span);
      },
      chance: (probability) => {
        if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
          throw new Error(`chance requires a probability in [0, 1], received ${String(probability)}`);
        }
        if (probability === 0) return false;
        if (probability === 1) return true;
        return nextUint32() / UINT32_RANGE < probability;
      },
      pick: (items) => {
        if (items.length === 0) {
          throw new Error("pick requires a non-empty list");
        }
        const index = Math.floor((nextUint32() / UINT32_RANGE) * items.length);
        const item = items[index];
        if (item === undefined) {
          throw new Error("pick produced an out-of-range index");
        }
        return item;
      },
    };
  };

  return {
    stream,
    snapshot: () => {
      const streams: Record<string, number> = {};
      for (const name of [...state.keys()].sort()) {
        const value = state.get(name);
        if (value !== undefined) {
          streams[name] = value;
        }
      }
      return { seed: masterSeed, streams };
    },
  };
}

export function createRngSet(seed: number): RngSet {
  assertInteger(seed, "RNG seed");
  return makeRngSet(seed >>> 0, null);
}

export function rngSetFromSnapshot(snapshot: RngSnapshot): RngSet {
  assertInteger(snapshot.seed, "RNG seed");
  return makeRngSet(snapshot.seed >>> 0, snapshot.streams);
}
