import { getGameData } from "../../data/gameData";
import { useGameStore } from "../../store/gameStore";
import { useUiStore } from "../../store/uiStore";
import { getActiveDesign } from "../../sim/core/state";
import type { ManufacturingCommand } from "../../sim/fab/commands";
import { tapeOutForDesign, validationForDesign } from "../../sim/fab/state";
import { ValidationPanel } from "../components/fab/ValidationPanel";

const data = getGameData();

/** Section 15.1 screen 4: coverage, tape-out and respin decisions. */
export function Validation() {
  const state = useGameStore((store) => store.state);
  const applyGameCommand = useGameStore((store) => store.applyGameCommand);
  const setScreen = useUiStore((store) => store.setScreen);
  const design = getActiveDesign(state);
  const node = data.nodeById[design.nodeId];
  const validation = validationForDesign(state.manufacturing, design.id);
  const tapeOut = tapeOutForDesign(state.manufacturing, design.id);

  const run = (command: ManufacturingCommand): boolean => applyGameCommand(command);

  return (
    <section className="screen validation-screen">
      <header className="screen-header">
        <h1>Validation &amp; Tape-Out</h1>
        <span className="milestone-tag">M7 · bugs &amp; masks</span>
        <span className="muted">
          {design.name} · {node?.name ?? design.nodeId} ·{" "}
          {design.settings.control === "microcoded" ? "microcoded control" : "hardwired control"}
        </span>
      </header>

      <ValidationPanel
        state={state}
        design={design}
        validation={validation}
        tapeOut={tapeOut}
        onCommand={run}
        onOpenManufacturing={() => {
          setScreen("manufacturing");
        }}
      />

      <section className="panel validation-notes">
        <h2>How the gamble works</h2>
        <ul className="plan-list">
          <li>Validation spends weeks, not cash, and never reveals the exact bug count.</li>
          <li>Coverage follows 1 − e^(−validated weeks × skill / scale); the tuning values drive it.</li>
          <li>Tape-out charges the mask set plus tools and engineering, even at 0% coverage.</li>
          <li>Remaining bugs split 60% cosmetic / 30% errata / 10% serious at tape-out.</li>
          <li>A microcoded design patches half of its errata before release.</li>
          <li>Serious bugs force a respin or an erratum; a respin cuts new masks and costs weeks.</li>
          <li>Editing the silicon after tape-out invalidates validation and the release record.</li>
        </ul>
      </section>
    </section>
  );
}