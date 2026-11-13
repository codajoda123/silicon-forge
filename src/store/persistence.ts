import { get, set } from "idb-keyval";

import { getTuning } from "../data/gameData";
import { deserializeSave, serializeSave } from "../sim/core/save";
import type { GameState } from "../sim/core/state";

const tuning = getTuning();

/** Persist the save as a JSON string so reloads go through the same validator. */
export async function writeBrowserSave(state: GameState): Promise<void> {
  await set(tuning.save.storageKey, serializeSave(state));
}

/** Returns null when there is no save yet. Throws SaveError on corrupt data. */
export async function readBrowserSave(): Promise<GameState | null> {
  const raw = await get<string>(tuning.save.storageKey);
  if (typeof raw !== "string") {
    return null;
  }
  return deserializeSave(raw);
}
