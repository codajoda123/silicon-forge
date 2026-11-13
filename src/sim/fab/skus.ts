import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import type { ChipDesign } from "../design/types";
import type { Sku } from "./types";

export interface DieQualificationInput {
  frequencyMHz: number;
  powerW: number;
  enabledBlockTypes: ReadonlySet<string>;
  disabledBlockTypes: ReadonlySet<string>;
}

export function skuQualifies(sku: Sku, die: DieQualificationInput): boolean {
  if (die.frequencyMHz < sku.minFreqMHz) {
    return false;
  }
  if (sku.maxPowerW !== null && die.powerW > sku.maxPowerW) {
    return false;
  }
  if (!sku.requiredBlocks.every((typeId) => die.enabledBlockTypes.has(typeId))) {
    return false;
  }
  return sku.disabledBlocks.every((typeId) => die.disabledBlockTypes.has(typeId));
}

function roundTo(value: number, step: number): number {
  if (!(step > 0)) {
    return value;
  }
  return Math.round(value / step) * step;
}

function uniqueBlockTypes(design: ChipDesign): string[] {
  return [...new Set(design.blocks.map((block) => block.typeId))];
}

/** Section 11.4 auto-suggest: frequency tiers plus a salvage tier when possible. */
export function suggestSkus(
  design: ChipDesign,
  data: GameData,
  tuning: Tuning,
  designFrequencyMHz: number,
): Sku[] {
  const config = tuning.manufacturing.skuAuto;
  const base = Math.max(tuning.manufacturing.waferDefect.minimumFrequencyMHz, designFrequencyMHz);
  const prefix = `sku-${design.id}`;
  const allTypes = uniqueBlockTypes(design);
  const disableable = uniqueBlockTypes(design).filter(
    (typeId) => data.blockById[typeId]?.disableable === true,
  );

  const makePrice = (frequencyMHz: number, multiplier = 1): number =>
    roundTo(
      (config.priceBase + config.pricePerMHz * frequencyMHz) * multiplier,
      config.priceRounding,
    );

  const thresholds = [
    base * config.highFrequencyFraction,
    base * config.midFrequencyFraction,
    base * config.lowFrequencyFraction,
  ];
  const names = config.names;

  const skus: Sku[] = thresholds.map((frequencyMHz, index) => ({
    id: `${prefix}-${String(index + 1)}`,
    name: names[index] ?? `Tier ${String(index + 1)}`,
    minFreqMHz: frequencyMHz,
    requiredBlocks: index === 0 ? allTypes : [],
    disabledBlocks: [],
    maxPowerW: null,
    price: makePrice(frequencyMHz),
    allocationTarget: null,
  }));

  const salvageType = disableable[0];
  if (salvageType !== undefined) {
    const frequencyMHz = base * config.salvageFrequencyFraction;
    const tierIndex = 3;
    skus.push({
      id: `${prefix}-${String(tierIndex + 1)}`,
      name: names[tierIndex] ?? "Salvage",
      minFreqMHz: frequencyMHz,
      requiredBlocks: [],
      disabledBlocks: [salvageType],
      maxPowerW: null,
      price: makePrice(frequencyMHz, config.salvagePriceMultiplier),
      allocationTarget: null,
    });
  }

  return skus;
}

/** Validate the player-editable product stack before storing it. */
export function validateSkus(skus: readonly Sku[], data: GameData): string | null {
  if (skus.length === 0) {
    return "A product stack needs at least one SKU.";
  }
  const ids = new Set<string>();
  for (const sku of skus) {
    if (sku.id.trim().length === 0) {
      return "Every SKU needs an id.";
    }
    if (sku.id === "scrap") {
      return 'SKU id "scrap" is reserved for rejected dies.';
    }
    if (ids.has(sku.id)) {
      return `Duplicate SKU id "${sku.id}".`;
    }
    ids.add(sku.id);
    if (sku.name.trim().length === 0) {
      return `SKU "${sku.id}" needs a name.`;
    }
    if (!Number.isFinite(sku.minFreqMHz) || sku.minFreqMHz < 0) {
      return `SKU "${sku.name}" has an invalid frequency requirement.`;
    }
    if (!Number.isFinite(sku.price) || sku.price < 0) {
      return `SKU "${sku.name}" has an invalid price.`;
    }
    if (sku.maxPowerW !== null && (!Number.isFinite(sku.maxPowerW) || sku.maxPowerW <= 0)) {
      return `SKU "${sku.name}" has an invalid power limit.`;
    }
    if (
      sku.allocationTarget !== null &&
      (!Number.isFinite(sku.allocationTarget) ||
        sku.allocationTarget < 0 ||
        sku.allocationTarget > 1)
    ) {
      return `SKU "${sku.name}" allocation must be between 0% and 100%.`;
    }
    if (new Set(sku.requiredBlocks).size !== sku.requiredBlocks.length) {
      return `SKU "${sku.name}" repeats a required block.`;
    }
    if (new Set(sku.disabledBlocks).size !== sku.disabledBlocks.length) {
      return `SKU "${sku.name}" repeats a disabled block.`;
    }
    for (const typeId of [...sku.requiredBlocks, ...sku.disabledBlocks]) {
      if (data.blockById[typeId] === undefined) {
        return `SKU "${sku.name}" references unknown block type "${typeId}".`;
      }
    }
    if (sku.requiredBlocks.some((typeId) => sku.disabledBlocks.includes(typeId))) {
      return `SKU "${sku.name}" both requires and disables the same block.`;
    }
  }
  return null;
}