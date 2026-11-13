import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import type { ChipDesign } from "../design/types";
import {
  emptyManufacturing,
  type FabContract,
  type ManufacturingState,
  type Product,
  type TapeOutRecord,
  type ValidationRecord,
} from "./types";

/** New games start with rented contract capacity for their first node. */
export function createInitialManufacturing(
  design: ChipDesign,
  data: GameData,
  tuning: Tuning,
): ManufacturingState {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design references unknown node "${design.nodeId}"`);
  }
  const spec = tuning.manufacturing.foundry.contract;
  const fab: FabContract = {
    id: "fab-1",
    name: `${spec.label} · ${node.name}`,
    kind: "contract",
    nodeId: node.id,
    waferCostMultiplier: spec.waferCostMultiplier,
    capacityPerWeek: spec.capacityPerWeek,
    leadTimeWeeks: spec.leadTimeWeeks,
    upfrontCost: spec.upfrontCost,
    takeOrPay: spec.takeOrPay,
    signedWeek: 0,
    skillFactor: 1,
    cumulativeWafers: 0,
  };
  return {
    ...emptyManufacturing(),
    fabs: [fab],
    nextFabSeq: 2,
  };
}

export function productForDesign(
  manufacturing: ManufacturingState,
  designId: string,
): Product | undefined {
  return manufacturing.products.find((product) => product.designId === designId);
}

export function validationForDesign(
  manufacturing: ManufacturingState,
  designId: string,
): ValidationRecord | undefined {
  return manufacturing.validations.find((record) => record.designId === designId);
}

export function tapeOutForDesign(
  manufacturing: ManufacturingState,
  designId: string,
): TapeOutRecord | undefined {
  return manufacturing.tapeouts.find((record) => record.designId === designId);
}

export function hasReleasedTapeOut(
  manufacturing: ManufacturingState,
  designId: string,
): boolean {
  return tapeOutForDesign(manufacturing, designId)?.status === "released";
}

/**
 * Editing a released design invalidates its validation evidence and tape-out.
 * Existing lots keep the result frozen at wafer start, so production history
 * stays consistent.
 */
export function resetDesignApproval(
  manufacturing: ManufacturingState,
  designId: string,
): ManufacturingState {
  const hasValidation = manufacturing.validations.some((record) => record.designId === designId);
  const hasTapeOut = manufacturing.tapeouts.some((record) => record.designId === designId);
  if (!hasValidation && !hasTapeOut) {
    return manufacturing;
  }
  return {
    ...manufacturing,
    validations: manufacturing.validations.filter((record) => record.designId !== designId),
    tapeouts: manufacturing.tapeouts.filter((record) => record.designId !== designId),
  };
}