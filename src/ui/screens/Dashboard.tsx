import { useGameStore } from "../../store/gameStore";
import { useUiStore } from "../../store/uiStore";
import { dateFromWeek, formatGameDate } from "../../sim/core/time";
import { formatInteger, formatMoney } from "../format";

export function Dashboard() {
  const state = useGameStore((store) => store.state);
  const speed = useUiStore((store) => store.speed);
  const player = state.companies.find((company) => company.isPlayer);
  const date = dateFromWeek(state.settings.startYear, state.week);
  const recentEvents = [...state.log].slice(-6).reverse();

  return (
    <section className="screen">
      <header className="screen-header">
        <h1>Dashboard</h1>
        <span className="milestone-tag">M0 · skeleton</span>
      </header>

      <div className="stat-grid">
        <article className="stat-card is-accent">
          <span className="stat-label">Current date</span>
          <span className="stat-value">{formatGameDate(date)}</span>
          <span className="stat-foot">
            Week {formatInteger(state.week)} · clock {speed === 0 ? "paused" : `${speed}×`}
          </span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Company</span>
          <span className="stat-value stat-value-small">{player?.name ?? "—"}</span>
          <span className="stat-foot">Founded {state.settings.startYear}</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Cash</span>
          <span className="stat-value">{player === undefined ? "—" : formatMoney(player.cash)}</span>
          <span className="stat-foot">Sandbox starting cash · economy arrives in M9</span>
        </article>
        <article className="stat-card">
          <span className="stat-label">Seed</span>
          <span className="stat-value">{formatInteger(state.seed)}</span>
          <span className="stat-foot">Save format v{state.version} · deterministic run</span>
        </article>
      </div>

      <div className="dashboard-columns">
        <div className="panel">
          <h2>Milestone 0 checklist</h2>
          <ul className="check-list">
            <li className="is-done">Vite + React + strict TypeScript</li>
            <li className="is-done">Seeded RNG with independent named streams</li>
            <li className="is-done">Weekly step() with pause and 1/2/5/20× speeds</li>
            <li className="is-done">GameState, command pipeline and event log</li>
            <li className="is-done">Save/load: IndexedDB plus JSON export/import</li>
            <li className="is-pending">Chip design and manufacturing: M2 onward</li>
          </ul>
        </div>

        <div className="panel">
          <h2>Event log</h2>
          {recentEvents.length === 0 ? (
            <p className="muted">No events yet.</p>
          ) : (
            <ol className="event-log">
              {recentEvents.map((event) => (
                <li key={event.id}>
                  <span className="event-week">W{event.week}</span>
                  <span>{event.message}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <p className="hint-line">
        Press Space to run the clock. Save, export and import live under “New Game / Settings”.
      </p>
    </section>
  );
}
