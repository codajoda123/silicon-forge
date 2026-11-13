import { serializeSave } from "../sim/core/save";
import type { GameState } from "../sim/core/state";

/** Browser-only helper: download the save as a JSON file. */
export function downloadSave(state: GameState): void {
  const blob = new Blob([serializeSave(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `silicon-forge-week-${state.week}.json`;
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
