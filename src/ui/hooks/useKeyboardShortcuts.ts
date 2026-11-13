import { useEffect } from "react";

import { useUiStore } from "../../store/uiStore";
import { SCREENS } from "../navigation";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Space = pause, +/- = speed, 1-9 = screens (Section 15.1). */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      const ui = useUiStore.getState();

      if (event.key === " ") {
        event.preventDefault();
        ui.togglePause();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        ui.faster();
        return;
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        ui.slower();
        return;
      }
      const screen = SCREENS.find((definition) => definition.shortcut === event.key);
      if (screen !== undefined) {
        event.preventDefault();
        ui.setScreen(screen.id);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
