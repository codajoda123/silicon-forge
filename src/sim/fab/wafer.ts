import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import type { Rng } from "../core/rng";
import type { ChipDesign } from "../design/types";
import type { ManufacturingAnalysis } from "./analysis";
import { runBinning, scaleBinningCounts, SCRAP_BIN } from "./binning";
import type { FabContract, LotResult, Product } from "./types";

export interface LotBuildResult {
  result: LotResult;
}

/**
 * Freeze one lot's binning result at wafer start. Later design edits cannot
 * change material already in the fab, and the lead time stays deterministic.
 */
export function buildLotResult(
  design: ChipDesign,
  product: Product,
  analysis: ManufacturingAnalysis,
  wafers: number,
  data: GameData,
  tuning: Tuning,
  rng: Rng,
): LotBuildResult {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design references unknown node "${design.nodeId}"`);
  }
  if (product.skus.length === 0) {
    throw new Error(`Product "${product.id}" has no SKU stack`);
  }
  const sample = runBinning(rng, {
    design,
    data,
    tuning,
    skus: product.skus,
    d0PerCm2: analysis.d0PerCm2,
    designFrequencyMHz: analysis.dieFrequencyMHz,
    sigmaFreq: node.sigmaFreq,
    powerAtDesignW: analysis.powerW,
    escapeRate: analysis.testStrategy.escapeRate,
  });
  const totalDies = wafers * analysis.dpw;
  const scaled = scaleBinningCounts(
    { ...sample.counts, [SCRAP_BIN]: sample.scrapCount },
    sample.sampleDies,
    totalDies,
  );
  const counts: Record<string, number> = {};
  let goodDies = 0;
  for (const sku of product.skus) {
    const quantity = scaled[sku.id] ?? 0;
    counts[sku.id] = quantity;
    goodDies += quantity;
  }
  const scrapDies = scaled[SCRAP_BIN] ?? Math.max(0, totalDies - goodDies);
  const escapedDies = Math.round(
    (sample.escapedDiesSample / Math.max(1, sample.sampleDies)) * totalDies,
  );

  return {
    result: {
      productId: product.id,
      sampleDies: sample.sampleDies,
      dpw: analysis.dpw,
      totalDies,
      goodDies,
      scrapDies,
      counts,
      shares: sample.shares,
      yieldFraction: sample.yieldFraction,
      d0: analysis.d0PerCm2,
      dieAreaMm2: analysis.dieAreaMm2,
      escapedDies,
      costPerGoodDie: analysis.costPerGoodDie,
    },
  };
}

export function lotWaferCost(
  fab: FabContract,
  nodeWaferCost: number,
  wafers: number,
): number {
  return fab.waferCostMultiplier * nodeWaferCost * wafers;
}

/**
 * Section 11.8: process cycle time is a floor on fabrication. A contract's
 * queue lead time can be longer when the partner is busy, never shorter than
 * the node's own 8-14 week flow.
 */
export function lotFabricationWeeks(fab: FabContract, nodeCycleWeeks: number): number {
  return Math.max(fab.leadTimeWeeks, nodeCycleWeeks);
}