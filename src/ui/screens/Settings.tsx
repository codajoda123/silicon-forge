import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { getGameData, getTuning } from "../../data/gameData";
import { isStartYearAllowed } from "../../sim/core/state";
import { dateFromWeek, formatGameDate } from "../../sim/core/time";
import { useGameStore } from "../../store/gameStore";
import { useUiStore } from "../../store/uiStore";
import { formatInteger } from "../format";

const tuning = getTuning();

export function Settings() {
  const data = getGameData();
  const state = useGameStore((store) => store.state);
  const startNewGame = useGameStore((store) => store.startNewGame);
  const renameCompany = useGameStore((store) => store.renameCompany);
  const saveToBrowser = useGameStore((store) => store.saveToBrowser);
  const loadFromBrowser = useGameStore((store) => store.loadFromBrowser);
  const exportJson = useGameStore((store) => store.exportJson);
  const importJson = useGameStore((store) => store.importJson);
  const setScreen = useUiStore((store) => store.setScreen);
  const setStatus = useUiStore((store) => store.setStatus);

  const date = dateFromWeek(state.settings.startYear, state.week);
  const streamCount = Object.keys(state.rng.streams).length;

  const [name, setName] = useState(state.settings.companyName);
  const [yearText, setYearText] = useState(String(state.settings.startYear));
  const [seedText, setSeedText] = useState(String(state.seed));
  const [renameText, setRenameText] = useState(state.settings.companyName);
  const [busy, setBusy] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);

  const parsedYear = Number(yearText);
  const parsedSeed = Number(seedText);
  const nameValid = name.trim().length > 0;
  const yearValid = Number.isInteger(parsedYear) && isStartYearAllowed(parsedYear);
  const seedValid = seedText.trim().length > 0 && Number.isSafeInteger(parsedSeed);
  const canStart = nameValid && yearValid && seedValid;

  const handleStart = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canStart) {
      return;
    }
    startNewGame({ companyName: name, startYear: parsedYear, seed: parsedSeed });
  };

  const handleRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (renameText.trim().length === 0) {
      setStatus("Company name cannot be empty.");
      return;
    }
    renameCompany(renameText);
    setStatus(`Renamed company to ${renameText.trim()}.`);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveToBrowser();
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async () => {
    setBusy(true);
    try {
      await loadFromBrowser();
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }
    const text = await file.text();
    const imported = importJson(text);
    if (imported) {
      setScreen("dashboard");
    }
    event.target.value = "";
  };

  return (
    <section className="screen">
      <header className="screen-header">
        <h1>New Game / Settings</h1>
        <span className="milestone-tag">M1 · data layer</span>
      </header>

      <div className="panel">
        <h2>Current run</h2>
        <dl className="detail-grid">
          <div>
            <dt>Date</dt>
            <dd>{formatGameDate(date)}</dd>
          </div>
          <div>
            <dt>Elapsed</dt>
            <dd>{formatInteger(state.week)} weeks</dd>
          </div>
          <div>
            <dt>Seed</dt>
            <dd>{formatInteger(state.seed)}</dd>
          </div>
          <div>
            <dt>Save format</dt>
            <dd>v{state.version}</dd>
          </div>
          <div>
            <dt>RNG streams</dt>
            <dd>{formatInteger(streamCount)} initialized</dd>
          </div>
          <div>
            <dt>Browser key</dt>
            <dd className="mono">{tuning.save.storageKey}</dd>
          </div>
        </dl>
        <p className="muted">
          The browser save is loaded automatically on start (paused). Export JSON is a portable
          copy of exactly the same state.
        </p>
      </div>

      <div className="panel">
        <h2>Data layer</h2>
        <dl className="detail-grid">
          <div>
            <dt>Process nodes</dt>
            <dd>{formatInteger(data.nodes.length)}</dd>
          </div>
          <div>
            <dt>Block types</dt>
            <dd>{formatInteger(data.blocks.length)}</dd>
          </div>
          <div>
            <dt>Packages</dt>
            <dd>{formatInteger(data.packages.length)}</dd>
          </div>
          <div>
            <dt>ISA archetypes</dt>
            <dd>{formatInteger(data.isas.length)}</dd>
          </div>
          <div>
            <dt>Custom instructions</dt>
            <dd>{formatInteger(data.customInstructions.length)}</dd>
          </div>
          <div>
            <dt>Workloads</dt>
            <dd>{formatInteger(data.workloads.length)}</dd>
          </div>
        </dl>
        <p className="muted">
          Every JSON file was schema- and formula-validated before the app rendered. Formula
          strings run through the safe evaluator; no <code>eval</code> or <code>Function</code>{" "}
          is used.
        </p>
      </div>

      <div className="panel">
        <h2>Save / Load</h2>
        <div className="button-row">
          <button type="button" className="primary-button" onClick={handleSave} disabled={busy}>
            Save to browser
          </button>
          <button type="button" className="secondary-button" onClick={handleLoad} disabled={busy}>
            Load from browser
          </button>
          <button type="button" className="secondary-button" onClick={exportJson} disabled={busy}>
            Export JSON
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
          >
            Import JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden-input"
            onChange={(event) => {
              void handleImportFile(event);
            }}
          />
        </div>
      </div>

      <div className="panel">
        <h2>Start a new game</h2>
        <form className="settings-form" onSubmit={handleStart}>
          <label className="field">
            <span>Company name</span>
            <input
              type="text"
              value={name}
              maxLength={tuning.newGame.companyNameMaxLength}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Start year</span>
            <input
              type="number"
              value={yearText}
              min={tuning.newGame.earliestStartYear}
              max={tuning.newGame.latestStartYear}
              onChange={(event) => setYearText(event.target.value)}
            />
            <small>
              {tuning.newGame.earliestStartYear}–{tuning.newGame.latestStartYear}; default{" "}
              {tuning.time.defaultStartYear}
            </small>
          </label>
          <label className="field">
            <span>Random seed</span>
            <span className="field-inline">
              <input
                type="number"
                value={seedText}
                step={1}
                onChange={(event) => setSeedText(event.target.value)}
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSeedText(String(Math.floor(Math.random() * 1_000_000)))}
              >
                Randomize
              </button>
            </span>
            <small>Same seed + same commands = identical run. UI only; the sim never uses Math.random.</small>
          </label>
          <div className="form-footer">
            {!canStart && (
              <span className="validation-message">Enter a name, a valid year and an integer seed.</span>
            )}
            <button type="submit" className="primary-button" disabled={!canStart}>
              Start new game
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>Rename current company</h2>
        <form className="settings-form settings-form-inline" onSubmit={handleRename}>
          <label className="field">
            <span>Company name</span>
            <input
              type="text"
              value={renameText}
              maxLength={tuning.newGame.companyNameMaxLength}
              onChange={(event) => setRenameText(event.target.value)}
            />
          </label>
          <button type="submit" className="secondary-button">
            Rename
          </button>
        </form>
      </div>
    </section>
  );
}
