import type { ChipDesign } from "./types";

export interface DesignCommandResult {
  design: ChipDesign;
  changed: boolean;
  error: string | null;
}

export function unchangedDesign(
  design: ChipDesign,
  error: string | null = null,
): DesignCommandResult {
  return { design, changed: false, error };
}

export function changedDesign(design: ChipDesign): DesignCommandResult {
  return { design, changed: true, error: null };
}
