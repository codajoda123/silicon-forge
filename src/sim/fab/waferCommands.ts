import { getGameData, getTuning } from "../../data/gameData";
import { rngSetFromSnapshot } from "../core/rng";
import type { GameState } from "../core/state";
import { analyzeManufacturing } from "./analysis";
import type { ManufacturingCommand, ManufacturingCommandResult } from "./commandTypes";
import { canAfford, finished, spendCash, unchanged, withManufacturing } from "./commandHelpers";
import { productForDesign } from "./state";
import type { WaferLot } from "./types";
import { buildLotResult, lotFabricationWeeks, lotWaferCost } from "./wafer";

/** Section 11.8: pay for a wafer start, freeze its bins and wait the lead time. */
export function applyWaferCommand(
  state: GameState,
  command: Extract<ManufacturingCommand, { type: "startWaferLot" }>,
): ManufacturingCommandResult {
  const data = getGameData();
  const tuning = getTuning();
  const design = state.designs.find((candidate) => candidate.id === command.designId);
  if (design === undefined) {
    return unchanged(state, `Design "${command.designId}" does not exist.`);
  }
  const product = productForDesign(state.manufacturing, design.id);
  if (product === undefined || product.skus.length === 0) {
    return unchanged(state, "Create a product stack before starting wafers.");
  }
  const released = state.manufacturing.tapeouts.find(
    (record) => record.designId === design.id && record.status === "released",
  );
  if (released === undefined) {
    return unchanged(state, "Tape out and release the design before starting wafers.");
  }
  const fab = state.manufacturing.fabs.find((candidate) => candidate.id === command.fabId);
  if (fab === undefined) {
    return unchanged(state, `Fab contract "${command.fabId}" does not exist.`);
  }
  if (fab.nodeId !== design.nodeId) {
    return unchanged(state, "That contract is for a different process node.");
  }
  if (
    !Number.isInteger(command.wafers) ||
    command.wafers < tuning.manufacturing.foundry.minWaferLot ||
    command.wafers > tuning.manufacturing.foundry.maxWaferLot
  ) {
    return unchanged(
      state,
      `Wafer lot must be a whole number from ${String(tuning.manufacturing.foundry.minWaferLot)} to ${String(tuning.manufacturing.foundry.maxWaferLot)}.`,
    );
  }
  const alreadyStarted = state.manufacturing.lots
    .filter((lot) => lot.fabId === fab.id && lot.startedWeek === state.week)
    .reduce((sum, lot) => sum + lot.wafers, 0);
  const available = fab.capacityPerWeek - alreadyStarted;
  if (command.wafers > available) {
    return unchanged(
      state,
      `Only ${String(Math.max(0, available))} wafers of capacity remain on ${fab.name} this week.`,
    );
  }
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    return unchanged(state, `Design references unknown node "${design.nodeId}".`);
  }
  const waferCost = lotWaferCost(fab, node.waferCost, command.wafers);
  if (!canAfford(state, waferCost)) {
    return unchanged(
      state,
      `The wafer start costs ${waferCost.toFixed(0)} cash and the company cannot cover it.`,
    );
  }

  const analysis = analyzeManufacturing(design, data, tuning, {
    week: state.week,
    startYear: state.settings.startYear,
    fab,
  });
  const rngSet = rngSetFromSnapshot(state.rng);
  const built = buildLotResult(
    design,
    product,
    analysis,
    command.wafers,
    data,
    tuning,
    rngSet.stream("manufacturing"),
  );
  const lotId = `lot-${String(state.manufacturing.nextLotSeq)}`;
  const fabricationWeeks = lotFabricationWeeks(fab, node.cycleWeeks);
  const totalWeeks =
    fabricationWeeks + tuning.manufacturing.foundry.testAndPackageWeeks;
  const lot: WaferLot = {
    id: lotId,
    designId: design.id,
    fabId: fab.id,
    productId: product.id,
    wafers: command.wafers,
    startedWeek: state.week,
    waferReadyWeek: state.week + fabricationWeeks,
    finishWeek: state.week + totalWeeks,
    status: "inFab",
    result: built.result,
  };
  let next = spendCash(state, waferCost);
  next = withManufacturing(
    { ...next, rng: rngSet.snapshot() },
    {
      ...next.manufacturing,
      fabs: state.manufacturing.fabs.map((candidate) =>
        candidate.id === fab.id
          ? {
              ...candidate,
              cumulativeWafers: candidate.cumulativeWafers + command.wafers,
            }
          : candidate,
      ),
      lots: [...state.manufacturing.lots, lot],
      nextLotSeq: state.manufacturing.nextLotSeq + 1,
    },
  );
  return finished(
    next,
    "waferLotStarted",
    `Started ${String(command.wafers)} wafers of ${design.name} at ${fab.name} for ${waferCost.toFixed(0)} cash; expected back in ${String(totalWeeks)} weeks.`,
  );
}