/** Section 11: manufacturing state and its serializable records. */

export type FabKind = "contract" | "reserved";

export interface FabContract {
  id: string;
  name: string;
  kind: FabKind;
  nodeId: string;
  waferCostMultiplier: number;
  capacityPerWeek: number;
  leadTimeWeeks: number;
  upfrontCost: number;
  takeOrPay: boolean;
  signedWeek: number;
  /** 1.0 for rented capacity; own-fab learning improves this in M12. */
  skillFactor: number;
  cumulativeWafers: number;
}

/**
 * Section 11.4: one sellable variant. Required blocks must be present and
 * enabled; disabled blocks must be present but salvage-disabled.
 */
export interface Sku {
  id: string;
  name: string;
  minFreqMHz: number;
  requiredBlocks: string[];
  disabledBlocks: string[];
  maxPowerW: number | null;
  price: number;
  /** Share of sampled dies deliberately routed here; null means no cap. */
  allocationTarget: number | null;
}

export interface Product {
  id: string;
  designId: string;
  skus: Sku[];
  launchedWeek: number | null;
}

export interface LotResult {
  productId: string;
  sampleDies: number;
  dpw: number;
  totalDies: number;
  goodDies: number;
  scrapDies: number;
  counts: Record<string, number>;
  shares: Record<string, number>;
  yieldFraction: number;
  d0: number;
  dieAreaMm2: number;
  escapedDies: number;
  costPerGoodDie: number;
}

export type LotStatus = "inFab" | "testing" | "completed";

export interface WaferLot {
  id: string;
  designId: string;
  fabId: string;
  productId: string;
  wafers: number;
  startedWeek: number;
  waferReadyWeek: number;
  finishWeek: number;
  status: LotStatus;
  result: LotResult;
}

export interface InventoryItem {
  id: string;
  productId: string;
  designId: string;
  skuId: string;
  quantity: number;
  unitCost: number;
  producedWeek: number;
}

export type BugSeverity = "cosmetic" | "errata" | "serious";

export interface ValidationRecord {
  designId: string;
  /** Hidden from the player; only the range is shown. */
  actualBugs: number;
  foundBugs: number;
  validatedWeeks: number;
  startedWeek: number | null;
  lastFoundWeek: number | null;
  coverage: number;
}

export type TapeOutStatus = "released" | "awaitingErratumDecision" | "respinning";

export interface TapeOutRecord {
  designId: string;
  week: number;
  maskCost: number;
  toolCost: number;
  engineeringCost: number;
  totalCost: number;
  remainingBugs: number;
  severities: Record<BugSeverity, number>;
  status: TapeOutStatus;
  respinReadyWeek: number | null;
  erratumAccepted: boolean;
  respins: number;
}

export interface ManufacturingState {
  fabs: FabContract[];
  lots: WaferLot[];
  products: Product[];
  inventory: InventoryItem[];
  validations: ValidationRecord[];
  tapeouts: TapeOutRecord[];
  nextFabSeq: number;
  nextLotSeq: number;
}

export function emptyManufacturing(): ManufacturingState {
  return {
    fabs: [],
    lots: [],
    products: [],
    inventory: [],
    validations: [],
    tapeouts: [],
    nextFabSeq: 1,
    nextLotSeq: 1,
  };
}