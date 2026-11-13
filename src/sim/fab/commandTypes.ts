import type { GameEvent } from "../core/events";
import type { GameState } from "../core/state";
import type { FabKind, Sku } from "./types";

export type ManufacturingCommand =
  | { type: "signFabContract"; nodeId: string; kind: FabKind }
  | { type: "startWaferLot"; designId: string; fabId: string; wafers: number }
  | { type: "suggestProductStack"; designId: string }
  | { type: "setProductSkus"; designId: string; skus: readonly Sku[] }
  | { type: "startValidation"; designId: string }
  | { type: "tapeOut"; designId: string }
  | { type: "respinDesign"; designId: string }
  | { type: "acceptErratum"; designId: string };

export interface ManufacturingCommandResult {
  state: GameState;
  event: GameEvent | null;
  failure?: string;
}