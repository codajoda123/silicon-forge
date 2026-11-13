import { stepManufacturing } from "../fab/step";
import { applyCommands, type Command } from "./commands";
import { appendGameEvent, type GameEvent } from "./events";
import type { GameState } from "./state";
import { dateFromWeek } from "./time";

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * Advance the world by exactly one week.
 *
 * Pure and deterministic: the same state and commands always produce the
 * same next state. Commands are applied before time advances, so an event
 * caused by a command belongs to the week it was issued in.
 *
 * M0 has no random subsystem yet, so the seeded RNG is carried in
 * `GameState.rng` and consumed by subsystems from M2 onward.
 */
export function step(state: GameState, commands: readonly Command[] = []): StepResult {
  const applied = applyCommands(state, commands);
  const previousDate = dateFromWeek(applied.state.settings.startYear, applied.state.week);

  let next: GameState = { ...applied.state, week: applied.state.week + 1 };
  const currentDate = dateFromWeek(next.settings.startYear, next.week);

  const events = [...applied.events];
  if (currentDate.year !== previousDate.year) {
    const recorded = appendGameEvent(next, "yearChanged", `It is now ${currentDate.year}.`);
    next = recorded.state;
    events.push(recorded.event);
  }

  // Manufacturing runs after the calendar advances so lead times and weekly
  // capacity are evaluated against the week the player is entering.
  const manufactured = stepManufacturing(next);
  next = manufactured.state;
  events.push(...manufactured.events);

  return { state: next, events };
}
