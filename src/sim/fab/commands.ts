import type { GameState } from "../core/state";
import { applyApprovalCommand } from "./approvalCommands";
import type { ManufacturingCommand, ManufacturingCommandResult } from "./commandTypes";
import { applyContractCommand } from "./contractCommands";
import { applyProductCommand } from "./productCommands";
import { applyWaferCommand } from "./waferCommands";

export type { ManufacturingCommand, ManufacturingCommandResult } from "./commandTypes";
export { invalidateDesignApproval } from "./approval";

/** Section 11 command surface, split by responsibility to keep files small. */
export function applyManufacturingCommand(
  state: GameState,
  command: ManufacturingCommand,
): ManufacturingCommandResult {
  switch (command.type) {
    case "signFabContract":
      return applyContractCommand(state, command);
    case "suggestProductStack":
    case "setProductSkus":
      return applyProductCommand(state, command);
    case "startWaferLot":
      return applyWaferCommand(state, command);
    case "startValidation":
    case "tapeOut":
    case "respinDesign":
    case "acceptErratum":
      return applyApprovalCommand(state, command);
  }
}