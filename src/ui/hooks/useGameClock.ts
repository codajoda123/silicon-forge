import { useEffect } from "react";

import { getTuning } from "../../data/gameData";
import { useGameStore } from "../../store/gameStore";
import { useUiStore } from "../../store/uiStore";

const tuning = getTuning();

/** Drives the weekly tick while the game is unpaused. */
export function useGameClock(): void {
  const speed = useUiStore((state) => state.speed);

  useEffect(() => {
    if (speed === 0) {
      return undefined;
    }
    const intervalMs = Math.max(1, Math.round(tuning.time.baseTickMsPerWeek / speed));
    const timer = window.setInterval(() => {
      useGameStore.getState().tick();
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [speed]);
}
