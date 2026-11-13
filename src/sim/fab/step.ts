import { getTuning } from "../../data/gameData";
import { appendGameEvent, type GameEvent } from "../core/events";
import { rngSetFromSnapshot } from "../core/rng";
import type { GameState } from "../core/state";
import type { InventoryItem, ManufacturingState } from "./types";
import { advanceValidation } from "./validation";

export interface ManufacturingStepResult {
  state: GameState;
  events: GameEvent[];
}

function replaceManufacturing(
  state: GameState,
  manufacturing: ManufacturingState,
): GameState {
  return { ...state, manufacturing };
}

/** Weekly manufacturing tick: validation finds bugs, lots advance, respins finish. */
export function stepManufacturing(state: GameState): ManufacturingStepResult {
  const tuning = getTuning();
  let next = state;
  const events: GameEvent[] = [];
  const rngSet = rngSetFromSnapshot(next.rng);
  let rngUsed = false;

  const validationConfig = tuning.manufacturing.validation;
  const validations = next.manufacturing.validations.map((record) => {
    if (
      record.startedWeek === null ||
      record.coverage >= validationConfig.fullCoverageThreshold
    ) {
      return record;
    }
    const before = record.foundBugs;
    const updated = advanceValidation(
      record,
      next.week,
      rngSet.stream("manufacturing"),
      tuning,
    );
    rngUsed = true;
    if (updated.foundBugs > before) {
      const design = next.designs.find((candidate) => candidate.id === record.designId);
      const found = updated.foundBugs - before;
      const recorded = appendGameEvent(
        next,
        "bugFound",
        `Validation found ${String(found)} bug${found === 1 ? "" : "s"} in ${design?.name ?? record.designId}; coverage ${(updated.coverage * 100).toFixed(0)}%.`,
      );
      next = recorded.state;
      events.push(recorded.event);
    }
    return updated;
  });
  if (rngUsed) {
    next = { ...next, rng: rngSet.snapshot() };
  }
  if (validations.some((record, index) => record !== next.manufacturing.validations[index])) {
    next = replaceManufacturing(next, { ...next.manufacturing, validations });
  }

  let inventoryAdded: InventoryItem[] = [];
  const lots = next.manufacturing.lots.map((lot) => {
    if (lot.status === "completed") {
      return lot;
    }
    if (next.week >= lot.finishWeek) {
      const items: InventoryItem[] = [];
      for (const [skuId, quantity] of Object.entries(lot.result.counts)) {
        if (quantity <= 0) {
          continue;
        }
        items.push({
          id: `inv-${lot.id}-${skuId}`,
          productId: lot.productId,
          designId: lot.designId,
          skuId,
          quantity,
          unitCost: lot.result.costPerGoodDie,
          producedWeek: lot.finishWeek,
        });
      }
      inventoryAdded = [...inventoryAdded, ...items];
      const design = next.designs.find((candidate) => candidate.id === lot.designId);
      const recorded = appendGameEvent(
        next,
        "waferLotCompleted",
        `Lot ${lot.id} completed: ${String(lot.result.goodDies)} good dies, ${String(lot.result.scrapDies)} scrap for ${design?.name ?? lot.designId}.`,
      );
      next = recorded.state;
      events.push(recorded.event);
      return { ...lot, status: "completed" as const };
    }
    if (next.week >= lot.waferReadyWeek && lot.status === "inFab") {
      const recorded = appendGameEvent(
        next,
        "waferLotProgress",
        `Lot ${lot.id} finished wafer fabrication and entered test and packaging.`,
      );
      next = recorded.state;
      events.push(recorded.event);
      return { ...lot, status: "testing" as const };
    }
    return lot;
  });

  const tapeouts = next.manufacturing.tapeouts.map((record) => {
    if (
      record.status !== "respinning" ||
      record.respinReadyWeek === null ||
      next.week < record.respinReadyWeek
    ) {
      return record;
    }
    const design = next.designs.find((candidate) => candidate.id === record.designId);
    const severities = { ...record.severities, serious: 0 };
    const recorded = appendGameEvent(
      next,
      "respinCompleted",
      `Respin for ${design?.name ?? record.designId} returned clean; design released to production.`,
    );
    next = recorded.state;
    events.push(recorded.event);
    next = replaceManufacturing(next, {
      ...next.manufacturing,
      products: next.manufacturing.products.map((product) =>
        product.designId === record.designId && product.launchedWeek === null
          ? { ...product, launchedWeek: next.week }
          : product,
      ),
    });
    return {
      ...record,
      status: "released" as const,
      severities,
      remainingBugs: severities.cosmetic + severities.errata,
      respinReadyWeek: null,
    };
  });

  if (
    lots.some((lot, index) => lot !== next.manufacturing.lots[index]) ||
    tapeouts.some((record, index) => record !== next.manufacturing.tapeouts[index]) ||
    inventoryAdded.length > 0
  ) {
    next = replaceManufacturing(next, {
      ...next.manufacturing,
      lots,
      tapeouts,
      inventory: [...next.manufacturing.inventory, ...inventoryAdded],
    });
  }

  return { state: next, events };
}