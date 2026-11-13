import { getTuning } from "../../data/gameData";
import type { GameState } from "./state";

const tuning = getTuning();

export const GAME_EVENT_KINDS = [
  "gameStarted",
  "companyRenamed",
  "yearChanged",
  "fabContractSigned",
  "productStackUpdated",
  "waferLotStarted",
  "waferLotProgress",
  "waferLotCompleted",
  "validationStarted",
  "bugFound",
  "tapeOut",
  "respinStarted",
  "respinCompleted",
  "erratumAccepted",
] as const;

export type GameEventKind = (typeof GAME_EVENT_KINDS)[number];

export interface GameEvent {
  id: string;
  week: number;
  kind: GameEventKind;
  message: string;
}

/** Build the next event with a deterministic id from the state's event counter. */
export function nextEvent(
  source: { week: number; eventSeq: number },
  kind: GameEventKind,
  message: string,
): GameEvent {
  return { id: `evt-${source.eventSeq}`, week: source.week, kind, message };
}

export function appendEvent(
  log: readonly GameEvent[],
  event: GameEvent,
  maxEntries: number,
): GameEvent[] {
  const next = [...log, event];
  return next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
}

/**
 * Pure helper used by the command reducer and weekly tick: append one event
 * and advance the deterministic event counter.
 */
export function appendGameEvent(
  state: GameState,
  kind: GameEventKind,
  message: string,
): { state: GameState; event: GameEvent } {
  const event = nextEvent(state, kind, message);
  return {
    event,
    state: {
      ...state,
      eventSeq: state.eventSeq + 1,
      log: appendEvent(state.log, event, tuning.log.maxEntries),
    },
  };
}
