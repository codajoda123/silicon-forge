import { create } from "zustand";

export const SPEED_OPTIONS = [0, 1, 2, 5, 20] as const;

/** 0 = paused. The other values are the design-locked speed multipliers. */
export type GameSpeed = (typeof SPEED_OPTIONS)[number];

export const SCREEN_IDS = [
  "dashboard",
  "chipDesigner",
  "architectureLab",
  "validation",
  "manufacturing",
  "research",
  "market",
  "marketing",
  "competitors",
  "finance",
  "workloadLab",
  "settings",
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

const RUN_SPEEDS = [1, 2, 5, 20] as const;

interface UiState {
  screen: ScreenId;
  speed: GameSpeed;
  lastSpeed: GameSpeed;
  status: string | null;
  setScreen: (screen: ScreenId) => void;
  setSpeed: (speed: GameSpeed) => void;
  togglePause: () => void;
  faster: () => void;
  slower: () => void;
  setStatus: (status: string | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  screen: "dashboard",
  speed: 0,
  lastSpeed: 1,
  status: "Paused. Press Space to start the weekly clock.",
  setScreen: (screen) => set({ screen }),
  setSpeed: (speed) =>
    set((current) => ({
      speed,
      lastSpeed: speed === 0 ? current.lastSpeed : speed,
    })),
  togglePause: () =>
    set((current) =>
      current.speed === 0
        ? { speed: current.lastSpeed === 0 ? 1 : current.lastSpeed }
        : { speed: 0, lastSpeed: current.speed },
    ),
  faster: () =>
    set((current) => {
      const next = RUN_SPEEDS.find((value) => value > current.speed) ?? 20;
      return { speed: next, lastSpeed: next };
    }),
  slower: () =>
    set((current) => {
      if (current.speed === 0) {
        return {};
      }
      const lower = [...RUN_SPEEDS].reverse().find((value) => value < current.speed);
      return lower === undefined ? { speed: 0 } : { speed: lower, lastSpeed: lower };
    }),
  setStatus: (status) => set({ status }),
}));
