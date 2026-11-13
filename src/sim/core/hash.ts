import type { GameState } from "./state";

/**
 * Deterministic state hash for tests and future replay/debug tooling.
 * Keys are sorted recursively so object insertion order never matters.
 */
function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  const kind = typeof value;
  if (kind === "string" || kind === "boolean") return value;
  if (kind === "number") {
    if (!Number.isFinite(value as number)) {
      throw new Error("Cannot hash non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (kind === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      const item = record[key];
      if (item === undefined) {
        throw new Error(`Cannot hash undefined property "${key}"`);
      }
      sorted[key] = canonicalize(item);
    }
    return sorted;
  }
  throw new Error(`Cannot hash value of type ${kind}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function stateHash(state: GameState): string {
  return hashString(canonicalJson(state));
}
