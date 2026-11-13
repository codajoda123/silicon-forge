import { z } from "zod";

import { getGameData, getTuning } from "../../data/gameData";
import type { WorkloadProfile } from "../../data/schemas";
import { normalizeDesignSettings, normalizeIsaConfig } from "../isa/params";
import { SaveError } from "./saveErrors";
import type { GameState } from "./state";

export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function validateCustomWorkloads(workloads: readonly WorkloadProfile[]): void {
  const data = getGameData();
  const ids = new Set<string>();
  for (const workload of workloads) {
    if (data.workloadById[workload.id] !== undefined) {
      throw new SaveError(
        `Save file is corrupt: workload "${workload.id}" shadows a built-in profile`,
      );
    }
    if (ids.has(workload.id)) {
      throw new SaveError(`Save file is corrupt: duplicate workload id "${workload.id}"`);
    }
    ids.add(workload.id);
    const knownPatterns = new Set(
      Object.keys(data.patternById).map((patternId) => patternId),
    );
    for (const patternId of Object.keys(workload.patterns)) {
      if (!knownPatterns.has(patternId)) {
        throw new SaveError(
          `Save file is corrupt: workload "${workload.id}" references unknown pattern "${patternId}"`,
        );
      }
    }
  }
}

export function validateManufacturingReferences(state: GameState): void {
  const data = getGameData();
  const manufacturing = state.manufacturing;
  const designIds = new Set(state.designs.map((design) => design.id));
  const fabIds = new Set<string>();
  const productIds = new Set<string>();
  const skuIdsByProduct = new Map<string, Set<string>>();
  const lotIds = new Set<string>();
  const inventoryIds = new Set<string>();
  const validationDesigns = new Set<string>();
  const tapeOutDesigns = new Set<string>();

  for (const fab of manufacturing.fabs) {
    if (fabIds.has(fab.id)) {
      throw new SaveError(`Save file is corrupt: duplicate fab id "${fab.id}"`);
    }
    fabIds.add(fab.id);
    if (data.nodeById[fab.nodeId] === undefined) {
      throw new SaveError(
        `Save file is corrupt: fab "${fab.id}" references unknown process node "${fab.nodeId}"`,
      );
    }
  }

  for (const product of manufacturing.products) {
    if (productIds.has(product.id)) {
      throw new SaveError(`Save file is corrupt: duplicate product id "${product.id}"`);
    }
    productIds.add(product.id);
    if (!designIds.has(product.designId)) {
      throw new SaveError(
        `Save file is corrupt: product "${product.id}" references unknown design "${product.designId}"`,
      );
    }
    const skuIds = new Set<string>();
    for (const sku of product.skus) {
      if (skuIds.has(sku.id)) {
        throw new SaveError(
          `Save file is corrupt: product "${product.id}" repeats SKU id "${sku.id}"`,
        );
      }
      skuIds.add(sku.id);
      for (const typeId of [...sku.requiredBlocks, ...sku.disabledBlocks]) {
        if (data.blockById[typeId] === undefined) {
          throw new SaveError(
            `Save file is corrupt: SKU "${sku.id}" references unknown block type "${typeId}"`,
          );
        }
      }
      if (sku.requiredBlocks.some((typeId) => sku.disabledBlocks.includes(typeId))) {
        throw new SaveError(
          `Save file is corrupt: SKU "${sku.id}" both requires and disables a block`,
        );
      }
    }
    skuIdsByProduct.set(product.id, skuIds);
  }

  for (const lot of manufacturing.lots) {
    if (lotIds.has(lot.id)) {
      throw new SaveError(`Save file is corrupt: duplicate lot id "${lot.id}"`);
    }
    lotIds.add(lot.id);
    if (!designIds.has(lot.designId)) {
      throw new SaveError(
        `Save file is corrupt: lot "${lot.id}" references unknown design "${lot.designId}"`,
      );
    }
    if (!fabIds.has(lot.fabId)) {
      throw new SaveError(
        `Save file is corrupt: lot "${lot.id}" references unknown fab "${lot.fabId}"`,
      );
    }
    const skus = skuIdsByProduct.get(lot.productId);
    if (skus === undefined) {
      throw new SaveError(
        `Save file is corrupt: lot "${lot.id}" references unknown product "${lot.productId}"`,
      );
    }
    for (const skuId of Object.keys(lot.result.counts)) {
      if (!skus.has(skuId)) {
        throw new SaveError(
          `Save file is corrupt: lot "${lot.id}" has counts for unknown SKU "${skuId}"`,
        );
      }
    }
  }

  for (const item of manufacturing.inventory) {
    if (inventoryIds.has(item.id)) {
      throw new SaveError(`Save file is corrupt: duplicate inventory id "${item.id}"`);
    }
    inventoryIds.add(item.id);
    if (!designIds.has(item.designId)) {
      throw new SaveError(
        `Save file is corrupt: inventory "${item.id}" references unknown design "${item.designId}"`,
      );
    }
    const skus = skuIdsByProduct.get(item.productId);
    if (skus === undefined || !skus.has(item.skuId)) {
      throw new SaveError(
        `Save file is corrupt: inventory "${item.id}" references an unknown product/SKU`,
      );
    }
  }

  for (const record of manufacturing.validations) {
    if (validationDesigns.has(record.designId)) {
      throw new SaveError(
        `Save file is corrupt: duplicate validation record for "${record.designId}"`,
      );
    }
    validationDesigns.add(record.designId);
    if (!designIds.has(record.designId)) {
      throw new SaveError(
        `Save file is corrupt: validation references unknown design "${record.designId}"`,
      );
    }
    if (record.foundBugs > record.actualBugs) {
      throw new SaveError(
        `Save file is corrupt: validation for "${record.designId}" found more bugs than exist`,
      );
    }
  }

  for (const record of manufacturing.tapeouts) {
    if (tapeOutDesigns.has(record.designId)) {
      throw new SaveError(
        `Save file is corrupt: duplicate tape-out record for "${record.designId}"`,
      );
    }
    tapeOutDesigns.add(record.designId);
    if (!designIds.has(record.designId)) {
      throw new SaveError(
        `Save file is corrupt: tape-out references unknown design "${record.designId}"`,
      );
    }
  }
}

export function validateDesignReferences(state: GameState): void {
  const data = getGameData();
  const tuning = getTuning();
  const designIds = new Set<string>();

  for (const design of state.designs) {
    if (designIds.has(design.id)) {
      throw new SaveError(`Save file is corrupt: duplicate design id "${design.id}"`);
    }
    designIds.add(design.id);

    const node = data.nodeById[design.nodeId];
    if (node === undefined) {
      throw new SaveError(`Save file is corrupt: unknown process node "${design.nodeId}"`);
    }
    if (data.packageById[design.packageId] === undefined) {
      throw new SaveError(`Save file is corrupt: unknown package "${design.packageId}"`);
    }
    if (data.isaById[design.isa.archetypeId] === undefined) {
      throw new SaveError(
        `Save file is corrupt: unknown ISA archetype "${design.isa.archetypeId}"`,
      );
    }
    const isa = normalizeIsaConfig(design.isa, data, tuning);
    if (isa.error !== null) {
      throw new SaveError(`Save file is corrupt: ${isa.error}`);
    }
    const settings = normalizeDesignSettings(design.settings, node, tuning);
    if (settings.error !== null) {
      throw new SaveError(`Save file is corrupt: ${settings.error}`);
    }
    for (const id of design.customInstructions) {
      if (data.customInstructionById[id] === undefined) {
        throw new SaveError(`Save file is corrupt: unknown custom instruction "${id}"`);
      }
    }
    if (new Set(design.customInstructions).size !== design.customInstructions.length) {
      throw new SaveError("Save file is corrupt: duplicate custom instruction id");
    }
    for (const block of design.blocks) {
      if (data.blockById[block.typeId] === undefined) {
        throw new SaveError(`Save file is corrupt: unknown block type "${block.typeId}"`);
      }
    }
  }

  if (!designIds.has(state.activeDesignId)) {
    throw new SaveError(
      `Save file is corrupt: active design "${state.activeDesignId}" does not exist`,
    );
  }
}
