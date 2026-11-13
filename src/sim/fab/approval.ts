import type { GameState } from "../core/state";
import { resetDesignApproval } from "./state";

/** Drop validation and tape-out records when a design is edited. */
export function invalidateDesignApproval(state: GameState, designId: string): GameState {
  const manufacturing = resetDesignApproval(state.manufacturing, designId);
  return manufacturing === state.manufacturing ? state : { ...state, manufacturing };
}