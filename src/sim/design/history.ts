import type { ChipDesign } from "./types";

/** Undo/redo stacks hold immutable design snapshots; newest is at the end. */
export interface DesignHistory {
  past: readonly ChipDesign[];
  future: readonly ChipDesign[];
}

export const EMPTY_DESIGN_HISTORY: DesignHistory = { past: [], future: [] };

export function recordDesignEdit(
  history: DesignHistory,
  previous: ChipDesign,
  limit: number,
): DesignHistory {
  const past = [...history.past, previous];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    future: [],
  };
}

export function undoDesignEdit(
  history: DesignHistory,
  current: ChipDesign,
  limit: number,
): { history: DesignHistory; design: ChipDesign } | null {
  const previous = history.past.at(-1);
  if (previous === undefined) {
    return null;
  }
  const future = [...history.future, current];
  return {
    design: previous,
    history: {
      past: history.past.slice(0, -1),
      future: future.length > limit ? future.slice(future.length - limit) : future,
    },
  };
}

export function redoDesignEdit(
  history: DesignHistory,
  current: ChipDesign,
  limit: number,
): { history: DesignHistory; design: ChipDesign } | null {
  const next = history.future.at(-1);
  if (next === undefined) {
    return null;
  }
  const past = [...history.past, current];
  return {
    design: next,
    history: {
      past: past.length > limit ? past.slice(past.length - limit) : past,
      future: history.future.slice(0, -1),
    },
  };
}
