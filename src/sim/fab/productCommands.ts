import { getGameData, getTuning } from "../../data/gameData";
import { analyzeManufacturing } from "./analysis";
import type { GameState } from "../core/state";
import type { ManufacturingCommand, ManufacturingCommandResult } from "./commandTypes";
import { ensureProduct, finished, unchanged } from "./commandHelpers";
import { hasReleasedTapeOut } from "./state";
import { validateSkus } from "./skus";

export type ProductCommand = Extract<
  ManufacturingCommand,
  { type: "suggestProductStack" | "setProductSkus" }
>;

/** Section 11.4: auto-suggest or replace the editable product stack. */
export function applyProductCommand(
  state: GameState,
  command: ProductCommand,
): ManufacturingCommandResult {
  const data = getGameData();
  const tuning = getTuning();
  const design = state.designs.find((candidate) => candidate.id === command.designId);
  if (design === undefined) {
    return unchanged(state, `Design "${command.designId}" does not exist.`);
  }

  if (command.type === "setProductSkus") {
    const error = validateSkus(command.skus, data);
    if (error !== null) {
      return unchanged(state, error);
    }
    const next = ensureProduct(
      state,
      design.id,
      command.skus,
      hasReleasedTapeOut(state.manufacturing, design.id) ? state.week : null,
      true,
    );
    return finished(
      next,
      "productStackUpdated",
      `Updated the ${design.name} product stack (${String(command.skus.length)} SKUs).`,
    );
  }

  const analysis = analyzeManufacturing(design, data, tuning, {
    week: state.week,
    startYear: state.settings.startYear,
  });
  const next = ensureProduct(
    state,
    design.id,
    analysis.suggestedSkus,
    hasReleasedTapeOut(state.manufacturing, design.id) ? state.week : null,
    true,
  );
  return finished(
    next,
    "productStackUpdated",
    `Suggested ${String(analysis.suggestedSkus.length)} SKUs for ${design.name}.`,
  );
}