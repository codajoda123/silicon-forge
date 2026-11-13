import { getGameData, getTuning } from "../../data/gameData";
import type { GameState } from "../core/state";
import type { ManufacturingCommand, ManufacturingCommandResult } from "./commandTypes";
import { canAfford, finished, spendCash, unchanged, withManufacturing } from "./commandHelpers";

/** Section 11.1: rented capacity and the guaranteed reserved contract. */
export function applyContractCommand(
  state: GameState,
  command: Extract<ManufacturingCommand, { type: "signFabContract" }>,
): ManufacturingCommandResult {
  const data = getGameData();
  const tuning = getTuning();
  const node = data.nodeById[command.nodeId];
  if (node === undefined) {
    return unchanged(state, `Unknown process node "${command.nodeId}".`);
  }
  const spec =
    command.kind === "reserved"
      ? tuning.manufacturing.foundry.reserved
      : tuning.manufacturing.foundry.contract;
  if (!canAfford(state, spec.upfrontCost)) {
    return unchanged(
      state,
      `Reserving capacity needs ${String(spec.upfrontCost)} cash upfront.`,
    );
  }
  const fabId = `fab-${String(state.manufacturing.nextFabSeq)}`;
  let next = spendCash(state, spec.upfrontCost);
  next = withManufacturing(next, {
    ...next.manufacturing,
    fabs: [
      ...next.manufacturing.fabs,
      {
        id: fabId,
        name: `${spec.label} · ${node.name}`,
        kind: command.kind,
        nodeId: node.id,
        waferCostMultiplier: spec.waferCostMultiplier,
        capacityPerWeek: spec.capacityPerWeek,
        leadTimeWeeks: spec.leadTimeWeeks,
        upfrontCost: spec.upfrontCost,
        takeOrPay: spec.takeOrPay,
        signedWeek: state.week,
        skillFactor: 1,
        cumulativeWafers: 0,
      },
    ],
    nextFabSeq: state.manufacturing.nextFabSeq + 1,
  });
  return finished(
    next,
    "fabContractSigned",
    `Signed ${spec.label} for ${node.name}: ${String(spec.capacityPerWeek)} wafers/week, ${String(spec.leadTimeWeeks)}-week lead time.`,
  );
}