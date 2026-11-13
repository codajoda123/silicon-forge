import { create } from "zustand";

import { getTuning } from "../data/gameData";
import { applyCommands, type Command } from "../sim/core/commands";
import { deserializeSave } from "../sim/core/save";
import {
  createNewGame,
  getActiveDesign,
  type GameState,
} from "../sim/core/state";
import { step } from "../sim/core/step";
import type { DesignCommand } from "../sim/design/commands";
import { invalidateDesignApproval } from "../sim/fab/commands";
import {
  EMPTY_DESIGN_HISTORY,
  recordDesignEdit,
  redoDesignEdit,
  undoDesignEdit,
} from "../sim/design/history";
import type { ChipDesign } from "../sim/design/types";
import type { WorkloadProfile } from "../data/schemas";
import { downloadSave } from "./fileIO";
import { readBrowserSave, writeBrowserSave } from "./persistence";
import { useUiStore } from "./uiStore";

const tuning = getTuning();

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface NewGameRequest {
  companyName: string;
  startYear: number;
  seed: number;
}

interface GameStore {
  state: GameState;
  hydrated: boolean;
  designPast: readonly ChipDesign[];
  designFuture: readonly ChipDesign[];
  tick: () => void;
  renameCompany: (name: string) => void;
  editDesign: (command: DesignCommand) => boolean;
  applyWorkloadCommand: (
    command: Extract<Command, { type: "addWorkload" | "updateWorkload" | "deleteWorkload" }>,
  ) => boolean;
  applyGameCommand: (command: Command) => boolean;
  addWorkload: (workload: WorkloadProfile) => boolean;
  updateWorkload: (workload: WorkloadProfile) => boolean;
  deleteWorkload: (workloadId: string) => boolean;
  undoDesign: () => boolean;
  redoDesign: () => boolean;
  startNewGame: (request: NewGameRequest) => void;
  hydrate: () => Promise<void>;
  saveToBrowser: () => Promise<void>;
  loadFromBrowser: () => Promise<void>;
  exportJson: () => void;
  importJson: (json: string) => boolean;
}

export const useGameStore = create<GameStore>()((set, get) => ({
  state: createNewGame(),
  hydrated: false,
  designPast: EMPTY_DESIGN_HISTORY.past,
  designFuture: EMPTY_DESIGN_HISTORY.future,

  tick: () => {
    set((current) => ({ state: step(current.state).state }));
  },

  renameCompany: (name) => {
    set((current) => ({
      state: applyCommands(current.state, [{ type: "setCompanyName", name }]).state,
    }));
  },

  editDesign: (command) => {
    const state = get().state;
    const design = getActiveDesign(state);
    const result = applyCommands(state, [
      { type: "editDesign", designId: design.id, command },
    ]);
    const failure = result.failures[0];
    if (failure !== undefined) {
      useUiStore.getState().setStatus(failure);
      return false;
    }

    const nextDesign = result.state.designs.find((candidate) => candidate.id === design.id);
    if (nextDesign === undefined || nextDesign === design) {
      return true;
    }

    const history = recordDesignEdit(
      { past: get().designPast, future: get().designFuture },
      design,
      tuning.design.undoLimit,
    );
    set({
      state: result.state,
      designPast: history.past,
      designFuture: history.future,
    });
    return true;
  },

  applyWorkloadCommand: (command) => {
    const state = get().state;
    const result = applyCommands(state, [command]);
    const failure = result.failures[0];
    if (failure !== undefined) {
      useUiStore.getState().setStatus(failure);
      return false;
    }
    set({ state: result.state });
    return true;
  },

  applyGameCommand: (command) => {
    const state = get().state;
    const result = applyCommands(state, [command]);
    const failure = result.failures[0];
    if (failure !== undefined) {
      useUiStore.getState().setStatus(failure);
      return false;
    }
    set({ state: result.state });
    const event = result.events[0];
    if (event !== undefined) {
      useUiStore.getState().setStatus(event.message);
    }
    return true;
  },

  addWorkload: (workload) => {
    const applied = get().applyWorkloadCommand({ type: "addWorkload", workload });
    if (applied) {
      useUiStore.getState().setStatus(`Added workload "${workload.name}".`);
    }
    return applied;
  },

  updateWorkload: (workload) => {
    const applied = get().applyWorkloadCommand({ type: "updateWorkload", workload });
    if (applied) {
      useUiStore.getState().setStatus(`Updated workload "${workload.name}".`);
    }
    return applied;
  },

  deleteWorkload: (workloadId) => {
    const applied = get().applyWorkloadCommand({ type: "deleteWorkload", workloadId });
    if (applied) {
      useUiStore.getState().setStatus(`Deleted workload "${workloadId}".`);
    }
    return applied;
  },

  undoDesign: () => {
    const state = get().state;
    const current = getActiveDesign(state);
    const result = undoDesignEdit(
      { past: get().designPast, future: get().designFuture },
      current,
      tuning.design.undoLimit,
    );
    if (result === null) {
      return false;
    }
    const restored = invalidateDesignApproval(
      {
        ...state,
        designs: state.designs.map((design) =>
          design.id === result.design.id ? result.design : design,
        ),
      },
      result.design.id,
    );
    set({
      state: restored,
      designPast: result.history.past,
      designFuture: result.history.future,
    });
    useUiStore.getState().setStatus("Undid the last floorplan edit.");
    return true;
  },

  redoDesign: () => {
    const state = get().state;
    const current = getActiveDesign(state);
    const result = redoDesignEdit(
      { past: get().designPast, future: get().designFuture },
      current,
      tuning.design.undoLimit,
    );
    if (result === null) {
      return false;
    }
    const restored = invalidateDesignApproval(
      {
        ...state,
        designs: state.designs.map((design) =>
          design.id === result.design.id ? result.design : design,
        ),
      },
      result.design.id,
    );
    set({
      state: restored,
      designPast: result.history.past,
      designFuture: result.history.future,
    });
    useUiStore.getState().setStatus("Redid the last floorplan edit.");
    return true;
  },

  startNewGame: (request) => {
    try {
      const next = createNewGame(request);
      set({
        state: next,
        designPast: EMPTY_DESIGN_HISTORY.past,
        designFuture: EMPTY_DESIGN_HISTORY.future,
      });
      useUiStore.getState().setSpeed(0);
      useUiStore.getState().setStatus(`New game started in ${next.settings.startYear}.`);
      useUiStore.getState().setScreen("dashboard");
    } catch (error) {
      useUiStore.getState().setStatus(`Could not start a new game: ${describeError(error)}`);
    }
  },

  hydrate: async () => {
    if (get().hydrated) {
      return;
    }
    set({ hydrated: true });
    try {
      const loaded = await readBrowserSave();
      if (loaded !== null) {
        set({
          state: loaded,
          designPast: EMPTY_DESIGN_HISTORY.past,
          designFuture: EMPTY_DESIGN_HISTORY.future,
        });
        useUiStore.getState().setSpeed(0);
        useUiStore.getState().setStatus(`Loaded browser save from week ${loaded.week}.`);
      }
    } catch (error) {
      useUiStore.getState().setStatus(`Could not load browser save: ${describeError(error)}`);
    }
  },

  saveToBrowser: async () => {
    try {
      await writeBrowserSave(get().state);
      useUiStore.getState().setStatus(`Saved week ${get().state.week} to browser storage.`);
    } catch (error) {
      useUiStore.getState().setStatus(`Save failed: ${describeError(error)}`);
    }
  },

  loadFromBrowser: async () => {
    try {
      const loaded = await readBrowserSave();
      if (loaded === null) {
        useUiStore.getState().setStatus("No browser save found. Save first.");
        return;
      }
      set({
        state: loaded,
        designPast: EMPTY_DESIGN_HISTORY.past,
        designFuture: EMPTY_DESIGN_HISTORY.future,
      });
      useUiStore.getState().setSpeed(0);
      useUiStore.getState().setStatus(`Loaded browser save from week ${loaded.week}.`);
    } catch (error) {
      useUiStore.getState().setStatus(`Load failed: ${describeError(error)}`);
    }
  },

  exportJson: () => {
    downloadSave(get().state);
    useUiStore.getState().setStatus(`Exported save for week ${get().state.week} as JSON.`);
  },

  importJson: (json) => {
    try {
      const loaded = deserializeSave(json);
      set({
        state: loaded,
        designPast: EMPTY_DESIGN_HISTORY.past,
        designFuture: EMPTY_DESIGN_HISTORY.future,
      });
      useUiStore.getState().setSpeed(0);
      useUiStore.getState().setStatus(`Imported save from week ${loaded.week}.`);
      return true;
    } catch (error) {
      useUiStore.getState().setStatus(`Import failed: ${describeError(error)}`);
      return false;
    }
  },
}));
