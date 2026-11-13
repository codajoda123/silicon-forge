import { useState } from "react";

import { getGameData, getTuning } from "../../data/gameData";
import { autoPlace } from "../../sim/design/autoplace";
import {
  AUTO_PLACE_MODES,
  type AutoPlaceMode,
  type AutoPlaceReport,
} from "../../sim/design/autoplaceTypes";
import type { DesignCommand } from "../../sim/design/commands";
import type { ChipDesign } from "../../sim/design/types";

const data = getGameData();
const tuning = getTuning();

const MODE_LABELS: Readonly<Record<AutoPlaceMode, string>> = {
  performance: "Performance",
  thermal: "Power / thermal",
  area: "Area / cost",
};

export interface AutoPlacePanelProps {
  design: ChipDesign;
  onApply: (command: DesignCommand, report: AutoPlaceReport) => boolean;
  onStatus: (message: string) => void;
}

/**
 * Section 7.8 controls: mode, seed, the deterministic annealing run and its
 * top-three-reasons report. Applying the result is one undoable design edit.
 */
export function AutoPlacePanel({ design, onApply, onStatus }: AutoPlacePanelProps) {
  const [mode, setMode] = useState<AutoPlaceMode>("performance");
  const [presetId, setPresetId] = useState("custom");
  const [seedText, setSeedText] = useState(String(tuning.autoplace.defaultSeed));
  const [report, setReport] = useState<AutoPlaceReport | null>(null);
  const parsedSeed = Number(seedText);
  const seedValid = seedText.trim().length > 0 && Number.isInteger(parsedSeed);
  const lockedCount = design.blocks.filter((block) => block.locked).length;
  const regionCount = design.blocks.filter((block) => block.region !== undefined).length;
  const iterations = tuning.autoplace.baseIterations * tuning.autoplace.defaultEdaLevel;
  const preset = presetId === "custom" ? undefined : data.designPresetById[presetId];
  const isPreset = preset !== undefined;
  const canRun = seedValid && (isPreset || design.blocks.length > 0);

  const run = () => {
    if (!seedValid) {
      onStatus("Auto-place seed must be a whole number.");
      return;
    }
    if (presetId !== "custom" && preset === undefined) {
      onStatus(`Unknown design preset "${presetId}".`);
      return;
    }
    if (!isPreset && design.blocks.length === 0) {
      onStatus("Place some blocks before using auto-place.");
      return;
    }
    try {
      const result = autoPlace(design, data, tuning, {
        mode,
        seed: parsedSeed,
        ...(isPreset ? { presetId } : {}),
      });
      if (!result.changed) {
        setReport(result.report);
        onStatus(
          isPreset
            ? `Auto-place rebuilt ${String(result.design.blocks.length)} blocks from ${result.report.presetName ?? "the preset"} but found no layout improvement.`
            : "Auto-place found no better legal layout for this seed.",
        );
        return;
      }
      const command: DesignCommand =
        result.report.presetId === null
          ? {
              type: "setBlockPlacements",
              placements: result.design.blocks.map((block) => ({
                uid: block.uid,
                x: block.x,
                y: block.y,
                w: block.w,
                h: block.h,
                rotated: block.rotated,
              })),
            }
          : {
              type: "applyDesignContent",
              nodeId: result.design.nodeId,
              packageId: result.design.packageId,
              dieW: result.design.dieW,
              dieH: result.design.dieH,
              blocks: result.design.blocks,
              isa: result.design.isa,
              settings: result.design.settings,
              customInstructions: result.design.customInstructions,
            };
      if (onApply(command, result.report)) {
        setReport(result.report);
        onStatus(
          result.report.presetId === null
            ? `Auto-place (${MODE_LABELS[mode]}) moved ${String(result.report.movedBlocks)} block(s) for a ${result.report.improvementPct.toFixed(1)}% cost improvement.`
            : `Auto-place built ${String(result.design.blocks.length)} blocks from ${result.report.presetName ?? "the preset"} (${MODE_LABELS[mode]}, ${
                result.report.improvementPct > 0.05
                  ? `${result.report.improvementPct.toFixed(1)}% better than its starting layout`
                  : "first-fit layout was already the best found"
              }).`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onStatus(`Auto-place failed: ${message}`);
    }
  };

  return (
    <section className="panel autoplace-panel">
      <h2>Auto-place</h2>
      <p className="autoplace-hint">
        {isPreset && preset !== undefined
          ? `Rebuilds the design from a preset: ${String(preset.blocks.length)} blocks, ${preset.nodeId}, ${preset.packageId}, ${String(preset.dieW)}×${String(preset.dieH)} die. Locks and regions on the current blocks are cleared.`
          : `Simulated annealing over free block positions and rotations. Locked blocks are anchors; painted regions constrain movement. ${String(lockedCount)} locked · ${String(regionCount)} region${regionCount === 1 ? "" : "s"}.`}
      </p>

      <label className="field field-compact autoplace-preset">
        <span>Preset</span>
        <select
          value={presetId}
          onChange={(event) => {
            setPresetId(event.target.value);
          }}
        >
          <option value="custom">Custom · current blocks</option>
          {data.designPresets.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {isPreset && preset !== undefined && (
        <p className="autoplace-preset-note">{preset.description}</p>
      )}

      <div className="autoplace-controls">
        <label className="field field-compact">
          <span>Mode</span>
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as AutoPlaceMode);
            }}
          >
            {AUTO_PLACE_MODES.map((option) => (
              <option key={option} value={option}>
                {MODE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-compact autoplace-seed">
          <span>Seed</span>
          <input
            type="number"
            step={1}
            value={seedText}
            aria-label="Auto-place seed"
            onChange={(event) => {
              setSeedText(event.target.value);
            }}
          />
        </label>
      </div>

      <button
        type="button"
        className="primary-button autoplace-run"
        disabled={!canRun}
        onClick={run}
      >
        Auto-place
      </button>
      <p className="autoplace-budget">
        {String(iterations)} iterations · deterministic per seed · EDA level{" "}
        {String(tuning.autoplace.defaultEdaLevel)}
      </p>

      {report !== null && (
        <div className="autoplace-report">
          <div className="autoplace-report-head">
            <span>Last run · {MODE_LABELS[report.mode]}</span>
            <span className="mono">seed {String(report.seed)}</span>
          </div>
          {report.presetName !== null && (
            <p className="autoplace-preset-result">Preset · {report.presetName}</p>
          )}
          <dl className="estimate-list">
            <div>
              <dt>Cost</dt>
              <dd>
                {report.initialCost.toFixed(3)} → {report.finalCost.toFixed(3)}
              </dd>
            </div>
            <div>
              <dt>Improvement</dt>
              <dd>{report.improvementPct.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Moved</dt>
              <dd>
                {String(report.movedBlocks)} / {String(design.blocks.length)} blocks
              </dd>
            </div>
            <div>
              <dt>Anchors</dt>
              <dd>
                {String(report.lockedBlocks)} locked · {String(report.regionedBlocks)} region
                {report.regionedBlocks === 1 ? "" : "s"}
              </dd>
            </div>
            <div>
              <dt>Hotspot</dt>
              <dd>{report.final.hotspotC.toFixed(1)} °C</dd>
            </div>
          </dl>

          <span className="field-label">Top reasons</span>
          {report.reasons.length === 0 ? (
            <p className="muted">No cost contributors in this layout.</p>
          ) : (
            <ol className="autoplace-reasons">
              {report.reasons.map((reason) => (
                <li key={reason.label}>
                  <div className="why-head">
                    <span className="why-label">{reason.label}</span>
                    <span className="why-share">{Math.round(reason.share * 100)}%</span>
                  </div>
                  <span className="why-bar">
                    <span style={{ width: `${(reason.share * 100).toFixed(1)}%` }} />
                  </span>
                  <span className="why-detail">{reason.detail}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
