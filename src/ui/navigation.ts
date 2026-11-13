import type { ScreenId } from "../store/uiStore";

export interface ScreenDef {
  id: ScreenId;
  label: string;
  shortcut: string | null;
}

/** Screen order and keyboard shortcuts (Section 15.1: 1-9 switch screens). */
export const SCREENS: readonly ScreenDef[] = [
  { id: "dashboard", label: "Dashboard", shortcut: "1" },
  { id: "chipDesigner", label: "Chip Designer", shortcut: "2" },
  { id: "architectureLab", label: "Architecture Lab", shortcut: "3" },
  { id: "validation", label: "Validation", shortcut: "4" },
  { id: "manufacturing", label: "Manufacturing", shortcut: "5" },
  { id: "research", label: "Research", shortcut: "6" },
  { id: "market", label: "Market & Sales", shortcut: "7" },
  { id: "marketing", label: "Marketing", shortcut: "8" },
  { id: "competitors", label: "Competitors", shortcut: "9" },
  { id: "finance", label: "Finance", shortcut: null },
  { id: "workloadLab", label: "Workload Lab", shortcut: null },
  { id: "settings", label: "New Game / Settings", shortcut: null },
];
