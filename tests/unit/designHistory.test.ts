import { describe, expect, it } from "vitest";

import {
  EMPTY_DESIGN_HISTORY,
  recordDesignEdit,
  redoDesignEdit,
  undoDesignEdit,
} from "../../src/sim/design/history";
import type { ChipDesign } from "../../src/sim/design/types";
import { emptyDesign, tuning } from "../design/helpers";

function named(design: ChipDesign, name: string): ChipDesign {
  return { ...design, name };
}

describe("design undo/redo history", () => {
  it("keeps only the tuned number of undo steps", () => {
    let history = EMPTY_DESIGN_HISTORY;
    let current = named(emptyDesign(), "edit-0");

    for (let index = 1; index <= 25; index += 1) {
      const previous = current;
      current = named(current, `edit-${String(index)}`);
      history = recordDesignEdit(history, previous, tuning.design.undoLimit);
    }

    expect(history.past).toHaveLength(tuning.design.undoLimit);
    expect(history.past[0]?.name).toBe("edit-5");
    expect(history.past.at(-1)?.name).toBe("edit-24");

    for (let index = 0; index < tuning.design.undoLimit; index += 1) {
      const result = undoDesignEdit(history, current, tuning.design.undoLimit);
      expect(result).not.toBeNull();
      if (result === null) {
        return;
      }
      current = result.design;
      history = result.history;
    }

    expect(current.name).toBe("edit-5");
    expect(undoDesignEdit(history, current, tuning.design.undoLimit)).toBeNull();
  });

  it("redoes in order and a new edit clears the redo stack", () => {
    let history = EMPTY_DESIGN_HISTORY;
    let current = named(emptyDesign(), "edit-0");
    for (let index = 1; index <= 3; index += 1) {
      const previous = current;
      current = named(current, `edit-${String(index)}`);
      history = recordDesignEdit(history, previous, tuning.design.undoLimit);
    }

    const firstUndo = undoDesignEdit(history, current, tuning.design.undoLimit);
    expect(firstUndo?.design.name).toBe("edit-2");
    if (firstUndo === null) {
      return;
    }
    history = firstUndo.history;
    current = firstUndo.design;

    const secondUndo = undoDesignEdit(history, current, tuning.design.undoLimit);
    expect(secondUndo?.design.name).toBe("edit-1");
    if (secondUndo === null) {
      return;
    }
    history = secondUndo.history;
    current = secondUndo.design;

    const firstRedo = redoDesignEdit(history, current, tuning.design.undoLimit);
    expect(firstRedo?.design.name).toBe("edit-2");
    if (firstRedo === null) {
      return;
    }
    history = firstRedo.history;
    current = firstRedo.design;

    const secondRedo = redoDesignEdit(history, current, tuning.design.undoLimit);
    expect(secondRedo?.design.name).toBe("edit-3");
    if (secondRedo === null) {
      return;
    }

    const undoAgain = undoDesignEdit(secondRedo.history, secondRedo.design, tuning.design.undoLimit);
    expect(undoAgain).not.toBeNull();
    if (undoAgain === null) {
      return;
    }
    const afterNewEdit = recordDesignEdit(
      undoAgain.history,
      undoAgain.design,
      tuning.design.undoLimit,
    );
    expect(afterNewEdit.future).toHaveLength(0);
  });
});
