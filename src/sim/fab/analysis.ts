import { getGameData, getTuning } from "../../data/gameData";
import type { GameData } from "../../data/load";
import type { ChipPackage, ProcessNode, Tuning } from "../../data/schemas";
import { dieAreaBreakdown, pinUsage } from "../design/area";
import { analyzePhysical } from "../design/physical";
import type { ChipDesign, PinUsage } from "../design/types";
import { buildContributors, type Contributor } from "../explain/why";
import { suggestSkus } from "./skus";
import { testStrategyFor, type TestStrategyInfo } from "./test";
import type { FabContract, Sku } from "./types";
import { expectedBugs, remainingBugRange, type BugRange } from "./validation";
import { defectDensity, dieYield, diesPerWafer, weeksSinceNodeIntro } from "./yield";

export interface ManufacturingAnalysisOptions {
  week?: number;
  startYear?: number;
  fab?: FabContract;
  coverage?: number;
}

export interface ManufacturingAnalysis {
  node: ProcessNode;
  packageInfo: ChipPackage;
  dieAreaMm2: number;
  waferDiameterMm: number;
  dieFrequencyMHz: number;
  powerW: number;
  weeksSinceNodeIntro: number;
  d0PerCm2: number;
  clusteringAlpha: number;
  dpw: number;
  yieldFraction: number;
  goodDiesPerWafer: number;
  waferCost: number;
  packageCostPerUnit: number;
  coolingCostPerUnit: number;
  testCostPerDie: number;
  costPerGoodDie: number;
  pins: PinUsage;
  testStrategy: TestStrategyInfo;
  expectedBugs: number;
  bugRange: BugRange;
  suggestedSkus: Sku[];
  yieldWhy: Contributor[];
  costWhy: Contributor[];
}

/**
 * Section 11 estimate used by the Manufacturing screen and by lot starts.
 * All displayed numbers and their "Why?" contributors come from this function.
 */
export function analyzeManufacturing(
  design: ChipDesign,
  data: GameData = getGameData(),
  tuning: Tuning = getTuning(),
  options: ManufacturingAnalysisOptions = {},
): ManufacturingAnalysis {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design references unknown node "${design.nodeId}"`);
  }
  const packageInfo = data.packageById[design.packageId];
  if (packageInfo === undefined) {
    throw new Error(`Design references unknown package "${design.packageId}"`);
  }
  const week = options.week ?? 0;
  const startYear = options.startYear ?? tuning.time.defaultStartYear;
  const area = dieAreaBreakdown(design, data, tuning);
  const physical = analyzePhysical(design, data, tuning, {
    voltageV: design.settings.vdd,
    pipelineStages: design.settings.pipelineStages,
    cooling: design.settings.cooling,
  });
  const dieFrequencyMHz = Math.max(
    tuning.manufacturing.waferDefect.minimumFrequencyMHz,
    Math.min(design.settings.targetClockMHz, physical.sustainedClockMHz),
  );
  const weeks = weeksSinceNodeIntro(startYear, week, node);
  const d0 = defectDensity(node, weeks, options.fab?.skillFactor ?? 1);
  const alpha = tuning.manufacturing.waferDefect.clusteringAlpha;
  const yieldFraction = dieYield(area.totalAreaMm2, d0, alpha);
  const dpw = diesPerWafer(node.waferDiameterMm, area.totalAreaMm2);
  const foundry = options.fab;
  const waferCostMultiplier =
    foundry?.waferCostMultiplier ?? tuning.manufacturing.foundry.contract.waferCostMultiplier;
  const waferCost = node.waferCost * waferCostMultiplier;
  const coolingCost =
    tuning.manufacturing.coolingCostPerUnit[design.settings.cooling] ?? 0;
  const packageCostPerUnit = packageInfo.costPerUnit + coolingCost;
  const testStrategy = testStrategyFor(design.settings.testStrategy, tuning);
  const testCostPerDie = testStrategy.costPerDie;
  const costPerGoodDie =
    dpw > 0
      ? (waferCost / dpw + packageCostPerUnit + testCostPerDie) / yieldFraction
      : 0;

  const bugs = expectedBugs(design, data, tuning);
  const bugRange = remainingBugRange(bugs, options.coverage ?? 0, tuning);

  const yieldWhy = buildContributors(
    [
      {
        label: "Defect density",
        value: d0,
        detail: `${d0.toFixed(2)} defects/cm² at week ${String(week)} of node life`,
      },
      {
        label: "Die area",
        value: area.totalAreaMm2 / 100,
        detail: `${area.totalAreaMm2.toFixed(2)} mm² including pad ring and scribe`,
      },
      {
        label: "Defect clustering",
        value: 1 / alpha,
        detail: `negative-binomial alpha ${alpha.toFixed(1)}`,
      },
    ],
    { limit: 3 },
  );

  const costWhy = buildContributors(
    [
      {
        label: "Wafer cost per good die",
        value: dpw > 0 ? waferCost / dpw / yieldFraction : 0,
        detail: `${waferCost.toFixed(0)} per wafer ÷ ${String(dpw)} DPW ÷ yield`,
      },
      {
        label: "Package and cooling",
        value: packageCostPerUnit / yieldFraction,
        detail: `${packageInfo.name} ${packageCostPerUnit.toFixed(2)} per unit`,
      },
      {
        label: "Test",
        value: testCostPerDie / yieldFraction,
        detail: `${testStrategy.label} ${testCostPerDie.toFixed(2)} per tested die`,
      },
    ],
    { limit: 3 },
  );

  return {
    node,
    packageInfo,
    dieAreaMm2: area.totalAreaMm2,
    waferDiameterMm: node.waferDiameterMm,
    dieFrequencyMHz,
    powerW: physical.power.totalW,
    weeksSinceNodeIntro: weeks,
    d0PerCm2: d0,
    clusteringAlpha: alpha,
    dpw,
    yieldFraction,
    goodDiesPerWafer: dpw * yieldFraction,
    waferCost,
    packageCostPerUnit,
    coolingCostPerUnit: coolingCost,
    testCostPerDie,
    costPerGoodDie,
    pins: pinUsage(design, data, tuning),
    testStrategy,
    expectedBugs: bugs,
    bugRange,
    suggestedSkus: suggestSkus(design, data, tuning, dieFrequencyMHz),
    yieldWhy,
    costWhy,
  };
}