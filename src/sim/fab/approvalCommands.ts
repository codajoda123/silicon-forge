import { getGameData, getTuning } from "../../data/gameData";
import { rngSetFromSnapshot } from "../core/rng";
import type { GameState } from "../core/state";
import { analyzeManufacturing } from "./analysis";
import type { ManufacturingCommand, ManufacturingCommandResult } from "./commandTypes";
import {
  canAfford,
  ensureProduct,
  finished,
  spendCash,
  unchanged,
  withManufacturing,
} from "./commandHelpers";
import {
  assignSeverities,
  expectedBugs,
  patchErrata,
  sampleActualBugs,
  tapeOutCost,
} from "./validation";

export type ApprovalCommand = Extract<
  ManufacturingCommand,
  { type: "startValidation" | "tapeOut" | "respinDesign" | "acceptErratum" }
>;

/** Section 7.9: validation, tape-out, respin and erratum decisions. */
export function applyApprovalCommand(
  state: GameState,
  command: ApprovalCommand,
): ManufacturingCommandResult {
  const data = getGameData();
  const tuning = getTuning();
  const design = state.designs.find((candidate) => candidate.id === command.designId);
  if (design === undefined) {
    return unchanged(state, `Design "${command.designId}" does not exist.`);
  }

  switch (command.type) {
    case "startValidation": {
      const existing = state.manufacturing.validations.find(
        (record) => record.designId === design.id,
      );
      if (existing !== undefined && existing.startedWeek !== null) {
        return unchanged(state, "Validation is already running for this design.");
      }
      const expected = expectedBugs(design, data, tuning);
      const rngSet = rngSetFromSnapshot(state.rng);
      const actualBugs = sampleActualBugs(rngSet.stream("manufacturing"), expected);
      const next = withManufacturing(
        { ...state, rng: rngSet.snapshot() },
        {
          ...state.manufacturing,
          validations: [
            ...state.manufacturing.validations.filter(
              (record) => record.designId !== design.id,
            ),
            {
              designId: design.id,
              actualBugs,
              foundBugs: 0,
              validatedWeeks: 0,
              startedWeek: state.week,
              lastFoundWeek: null,
              coverage: 0,
            },
          ],
        },
      );
      return finished(
        next,
        "validationStarted",
        `Started validating ${design.name}: estimated ${expected.toFixed(1)} bugs before the hidden Poisson draw.`,
      );
    }

    case "tapeOut": {
      if (state.manufacturing.tapeouts.some((record) => record.designId === design.id)) {
        return unchanged(state, "This design already has a tape-out record.");
      }
      const pinCheck = analyzeManufacturing(design, data, tuning, {
        week: state.week,
        startYear: state.settings.startYear,
      });
      if (pinCheck.pins.overflow > 0) {
        return unchanged(
          state,
          `Pin overflow: ${String(pinCheck.pins.overflow)} pins over the ${String(pinCheck.pins.capacity)}-pin limit. Multiplex the bus, shrink it, or choose a larger package before tape-out.`,
        );
      }
      const costs = tapeOutCost(data, design, tuning);
      if (!canAfford(state, costs.totalCost)) {
        return unchanged(
          state,
          `Tape-out needs ${String(costs.totalCost)} cash for masks, tools and engineering.`,
        );
      }

      const rngSet = rngSetFromSnapshot(state.rng);
      const rng = rngSet.stream("manufacturing");
      const expected = expectedBugs(design, data, tuning);
      const validation =
        state.manufacturing.validations.find((record) => record.designId === design.id) ??
        {
          designId: design.id,
          actualBugs: sampleActualBugs(rng, expected),
          foundBugs: 0,
          validatedWeeks: 0,
          startedWeek: null,
          lastFoundWeek: null,
          coverage: 0,
        };
      const remaining = Math.max(0, validation.actualBugs - validation.foundBugs);
      const rawSeverities = assignSeverities(remaining, rng, tuning);
      const patched = patchErrata(rawSeverities, tuning, design.settings.control === "microcoded");
      const remainingAfterPatch =
        patched.severities.cosmetic + patched.severities.errata + patched.severities.serious;
      const status =
        patched.severities.serious > 0 ? "awaitingErratumDecision" : "released";

      let next = spendCash(state, costs.totalCost);
      next = withManufacturing(
        { ...next, rng: rngSet.snapshot() },
        {
          ...state.manufacturing,
          validations:
            state.manufacturing.validations.some((record) => record.designId === design.id)
              ? state.manufacturing.validations.map((record) =>
                  record.designId === design.id ? validation : record,
                )
              : [...state.manufacturing.validations, validation],
          tapeouts: [
            ...state.manufacturing.tapeouts,
            {
              designId: design.id,
              week: state.week,
              maskCost: costs.maskCost,
              toolCost: costs.toolCost,
              engineeringCost: costs.engineeringCost,
              totalCost: costs.totalCost,
              remainingBugs: remainingAfterPatch,
              severities: patched.severities,
              status,
              respinReadyWeek: null,
              erratumAccepted: false,
              respins: 0,
            },
          ],
        },
      );
      if (status === "released") {
        const analysis = analyzeManufacturing(design, data, tuning, {
          week: state.week,
          startYear: state.settings.startYear,
          coverage: validation.coverage,
        });
        next = ensureProduct(next, design.id, analysis.suggestedSkus, state.week, false);
      }
      const suffix =
        status === "released"
          ? "Released to production."
          : `${String(patched.severities.serious)} serious bug(s) need a respin or an erratum decision.`;
      return finished(
        next,
        "tapeOut",
        `Taped out ${design.name} for ${costs.totalCost.toFixed(0)} cash. ${suffix}`,
      );
    }

    case "respinDesign": {
      const node = data.nodeById[design.nodeId];
      const record = state.manufacturing.tapeouts.find(
        (candidate) => candidate.designId === design.id,
      );
      if (node === undefined || record === undefined) {
        return unchanged(state, "No tape-out is waiting for a respin.");
      }
      if (record.status !== "awaitingErratumDecision") {
        return unchanged(state, "This tape-out is not waiting for a respin decision.");
      }
      if (!canAfford(state, node.maskSetCost)) {
        return unchanged(state, `A respin needs ${String(node.maskSetCost)} cash for a new mask set.`);
      }
      const next = spendCash(state, node.maskSetCost);
      const updated = withManufacturing(next, {
        ...next.manufacturing,
        tapeouts: next.manufacturing.tapeouts.map((candidate) =>
          candidate.designId === design.id
            ? {
                ...candidate,
                status: "respinning" as const,
                respinReadyWeek: state.week + tuning.manufacturing.respinWeeks,
                respins: candidate.respins + 1,
              }
            : candidate,
        ),
      });
      return finished(
        updated,
        "respinStarted",
        `Started a respin for ${design.name}: new masks cost ${String(node.maskSetCost)} and take ${String(tuning.manufacturing.respinWeeks)} weeks.`,
      );
    }

    case "acceptErratum": {
      const record = state.manufacturing.tapeouts.find(
        (candidate) => candidate.designId === design.id,
      );
      if (record === undefined || record.status !== "awaitingErratumDecision") {
        return unchanged(state, "No erratum decision is pending.");
      }
      const analysis = analyzeManufacturing(design, data, tuning, {
        week: state.week,
        startYear: state.settings.startYear,
      });
      let next = withManufacturing(state, {
        ...state.manufacturing,
        tapeouts: state.manufacturing.tapeouts.map((candidate) =>
          candidate.designId === design.id
            ? {
                ...candidate,
                status: "released" as const,
                erratumAccepted: true,
              }
            : candidate,
        ),
      });
      next = ensureProduct(next, design.id, analysis.suggestedSkus, state.week, false);
      return finished(
        next,
        "erratumAccepted",
        `Shipped ${design.name} with an erratum; reputation damage is recorded for M9.`,
      );
    }
  }
}