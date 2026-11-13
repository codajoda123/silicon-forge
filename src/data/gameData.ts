import { loadGameData, type GameData } from "./load";
import type { Tuning } from "./schemas";

let cached: GameData | undefined;

/**
 * Validate every bundled data file once. Callers can keep using
 * getGameData()/getTuning() afterwards; validation only happens here.
 */
export function initGameData(): GameData {
  cached ??= loadGameData();
  return cached;
}

export function getGameData(): GameData {
  return cached ?? initGameData();
}

export function getTuning(): Tuning {
  return getGameData().tuning;
}

export type { GameData } from "./load";
export type { Tuning } from "./schemas";
