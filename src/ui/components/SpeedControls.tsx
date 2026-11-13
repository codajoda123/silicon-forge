import { SPEED_OPTIONS, useUiStore, type GameSpeed } from "../../store/uiStore";

const SPEED_LABELS: Record<GameSpeed, string> = {
  0: "Pause",
  1: "1×",
  2: "2×",
  5: "5×",
  20: "20×",
};

const SPEED_TITLES: Record<GameSpeed, string> = {
  0: "Pause (Space)",
  1: "1 week per second",
  2: "2 weeks per second",
  5: "5 weeks per second",
  20: "20 weeks per second",
};

export function SpeedControls() {
  const speed = useUiStore((state) => state.speed);
  const setSpeed = useUiStore((state) => state.setSpeed);

  return (
    <div className="speed-controls" role="group" aria-label="Simulation speed">
      {SPEED_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={option === speed ? "speed-button is-active" : "speed-button"}
          aria-pressed={option === speed}
          title={SPEED_TITLES[option]}
          onClick={() => setSpeed(option)}
        >
          {SPEED_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
