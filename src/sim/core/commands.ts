import { getGameData } from "../../data/gameData";
import type { WorkloadProfile } from "../../data/schemas";
import { applyDesignCommand, type DesignCommand } from "../design/commands";
import {
  applyManufacturingCommand,
  invalidateDesignApproval,
  type ManufacturingCommand,
} from "../fab/commands";
import { validateWorkloadProfile } from "../perf/workloads";
import { appendGameEvent, type GameEvent } from "./events";
import { getPlayerCompany, normalizeCompanyName, type GameState } from "./state";

/**
 * UI -> simulation command surface.
 *
 * Commands are plain serializable data. `step` batches them per week for
 * headless runs; the UI may also dispatch one immediately while paused.
 */
export type Command =
  | { type: "setCompanyName"; name: string }
  | { type: "editDesign"; designId: string; command: DesignCommand }
  | { type: "setActiveDesign"; designId: string }
  | { type: "addWorkload"; workload: WorkloadProfile }
  | { type: "updateWorkload"; workload: WorkloadProfile }
  | { type: "deleteWorkload"; workloadId: string }
  | ManufacturingCommand;

export interface CommandResult {
  state: GameState;
  event: GameEvent | null;
  failure?: string;
}

function applyCommand(state: GameState, command: Command): CommandResult {
  switch (command.type) {
    case "setCompanyName": {
      const name = normalizeCompanyName(command.name);
      if (name.length === 0) {
        return { state, event: null };
      }
      const player = getPlayerCompany(state);
      if (player.name === name) {
        return { state, event: null };
      }
      const renamed: GameState = {
        ...state,
        settings: { ...state.settings, companyName: name },
        companies: state.companies.map((company) =>
          company.isPlayer ? { ...company, name } : company,
        ),
      };
      return appendGameEvent(renamed, "companyRenamed", `Company renamed to ${name}.`);
    }

    case "editDesign": {
      const design = state.designs.find((candidate) => candidate.id === command.designId);
      if (design === undefined) {
        return { state, event: null, failure: `Design "${command.designId}" does not exist.` };
      }
      const result = applyDesignCommand(design, command.command);
      if (result.error !== null) {
        return { state, event: null, failure: result.error };
      }
      if (!result.changed) {
        return { state, event: null };
      }
      const edited: GameState = {
        ...state,
        designs: state.designs.map((candidate) =>
          candidate.id === design.id ? result.design : candidate,
        ),
      };
      // Cosmetic renames do not change the silicon, so they keep existing
      // validation evidence and tape-outs. Everything else invalidates them.
      return {
        state:
          command.command.type === "renameDesign"
            ? edited
            : invalidateDesignApproval(edited, design.id),
        event: null,
      };
    }

    case "setActiveDesign": {
      if (!state.designs.some((design) => design.id === command.designId)) {
        return {
          state,
          event: null,
          failure: `Design "${command.designId}" does not exist.`,
        };
      }
      if (state.activeDesignId === command.designId) {
        return { state, event: null };
      }
      return { state: { ...state, activeDesignId: command.designId }, event: null };
    }

    case "addWorkload": {
      const data = getGameData();
      const existingIds = new Set([
        ...data.workloads.map((workload) => workload.id),
        ...state.customWorkloads.map((workload) => workload.id),
      ]);
      const result = validateWorkloadProfile(command.workload, existingIds);
      if (result.workload === null) {
        return { state, event: null, failure: result.error ?? "Invalid workload profile." };
      }
      return {
        state: {
          ...state,
          customWorkloads: [...state.customWorkloads, result.workload],
        },
        event: null,
      };
    }

    case "updateWorkload": {
      const data = getGameData();
      const existingIds = new Set([
        ...data.workloads.map((workload) => workload.id),
        ...state.customWorkloads.map((workload) => workload.id),
      ]);
      if (!state.customWorkloads.some((workload) => workload.id === command.workload.id)) {
        return {
          state,
          event: null,
          failure: `Workload "${command.workload.id}" is not an editable profile.`,
        };
      }
      if (data.workloadById[command.workload.id] !== undefined) {
        return {
          state,
          event: null,
          failure: "Built-in workloads cannot be overwritten; duplicate the profile first.",
        };
      }
      const result = validateWorkloadProfile(
        command.workload,
        existingIds,
        command.workload.id,
      );
      if (result.workload === null) {
        return { state, event: null, failure: result.error ?? "Invalid workload profile." };
      }
      return {
        state: {
          ...state,
          customWorkloads: state.customWorkloads.map((workload) =>
            workload.id === result.workload?.id ? result.workload : workload,
          ),
        },
        event: null,
      };
    }

    case "deleteWorkload": {
      if (!state.customWorkloads.some((workload) => workload.id === command.workloadId)) {
        return {
          state,
          event: null,
          failure: `Workload "${command.workloadId}" is not an editable profile.`,
        };
      }
      return {
        state: {
          ...state,
          customWorkloads: state.customWorkloads.filter(
            (workload) => workload.id !== command.workloadId,
          ),
        },
        event: null,
      };
    }

    case "signFabContract":
    case "startWaferLot":
    case "suggestProductStack":
    case "setProductSkus":
    case "startValidation":
    case "tapeOut":
    case "respinDesign":
    case "acceptErratum":
      return applyManufacturingCommand(state, command);

    default: {
      throw new Error(`Unknown command: ${JSON.stringify(command)}`);
    }
  }
}

export interface CommandsResult {
  state: GameState;
  events: GameEvent[];
  failures: string[];
}

export function applyCommands(state: GameState, commands: readonly Command[]): CommandsResult {
  let current = state;
  const events: GameEvent[] = [];
  const failures: string[] = [];
  for (const command of commands) {
    const result = applyCommand(current, command);
    current = result.state;
    if (result.event !== null) {
      events.push(result.event);
    }
    if (result.failure !== undefined) {
      failures.push(result.failure);
    }
  }
  return { state: current, events, failures };
}
