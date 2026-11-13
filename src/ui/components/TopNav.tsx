import { useGameStore } from "../../store/gameStore";
import { useUiStore } from "../../store/uiStore";
import { dateFromWeek, formatGameDate } from "../../sim/core/time";
import { formatInteger } from "../format";
import { SCREENS } from "../navigation";
import { SpeedControls } from "./SpeedControls";

export function TopNav() {
  const screen = useUiStore((state) => state.screen);
  const setScreen = useUiStore((state) => state.setScreen);
  const week = useGameStore((state) => state.state.week);
  const startYear = useGameStore((state) => state.state.settings.startYear);
  const date = dateFromWeek(startYear, week);

  return (
    <header className="top-nav">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          SF
        </span>
        <span className="brand-text">
          <strong>Silicon Forge</strong>
          <small>CPU design tycoon · {startYear}</small>
        </span>
      </div>

      <nav className="screen-nav" aria-label="Screens">
        {SCREENS.map((definition) => (
          <button
            key={definition.id}
            type="button"
            className={definition.id === screen ? "nav-button is-active" : "nav-button"}
            onClick={() => setScreen(definition.id)}
            title={
              definition.shortcut === null
                ? definition.label
                : `${definition.label} (${definition.shortcut})`
            }
          >
            {definition.shortcut !== null && <span className="nav-key">{definition.shortcut}</span>}
            {definition.label}
          </button>
        ))}
      </nav>

      <div className="clock">
        <div className="clock-date">{formatGameDate(date)}</div>
        <div className="clock-week">Elapsed week {formatInteger(week)}</div>
        <SpeedControls />
      </div>
    </header>
  );
}
