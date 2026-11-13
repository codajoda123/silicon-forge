import { useMemo } from "react";

import { getGameData, getTuning } from "../../data/gameData";
import type { DesignCommand } from "../../sim/design/commands";
import type { PhysicalAnalysis } from "../../sim/design/physical";
import type { ChipDesign } from "../../sim/design/types";
import { buildInstructionBreakdown } from "../../sim/isa/instructionCount";
import { NumberField } from "./NumberField";
import { formatBytes, formatCount, formatInteger } from "../format";

const data = getGameData();
const tuning = getTuning();

export interface DesignSettingsPanelProps {
  design: ChipDesign;
  analysis: PhysicalAnalysis;
  onEdit: (command: DesignCommand) => boolean;
  onOpenArchitectureLab: () => void;
}

function formatMHz(value: number): string {
  if (value >= 1) {
    return `${value.toFixed(2)} MHz`;
  }
  return `${formatInteger(Math.round(value * 1000))} kHz`;
}

/**
 * Section 7.6 Phase 1 settings next to the floorplan. Controls that already have
 * a model (width, registers, Vdd, pipeline, cooling, package) update the physical
 * panel live; cache/test/redundancy values are persisted for M6/M7.
 */
export function DesignSettingsPanel({
  design,
  analysis,
  onEdit,
  onOpenArchitectureLab,
}: DesignSettingsPanelProps) {
  const node = data.nodeById[design.nodeId];
  const sampleWorkload = data.workloadById[tuning.power.referenceWorkloadId];
  const sample = useMemo(
    () =>
      sampleWorkload === undefined
        ? null
        : buildInstructionBreakdown(design, sampleWorkload, data, tuning),
    [design, sampleWorkload],
  );
  if (node === undefined) {
    return null;
  }
  const settings = design.settings;
  const update = (patch: Partial<ChipDesign["settings"]>) => {
    onEdit({ type: "setDesignSettings", settings: { ...settings, ...patch } });
  };
  const updateIsa = (patch: Partial<ChipDesign["isa"]>) => {
    onEdit({ type: "setIsa", isa: { ...design.isa, ...patch } });
  };

  const cacheBlocks = design.blocks.filter(
    (block) => block.typeId === "instruction-cache" || block.typeId === "data-cache",
  );
  const clockGenerators = design.blocks.filter((block) => block.typeId === "clock-generator");
  const targetOverFmax =
    analysis.timing.fMaxMHz > 0 && settings.targetClockMHz > analysis.timing.fMaxMHz;

  return (
    <section className="panel design-settings-panel">
      <div className="panel-heading-row">
        <h2>Design settings</h2>
        <button type="button" className="secondary-button compact-button" onClick={onOpenArchitectureLab}>
          Open Architecture Lab
        </button>
      </div>

      <div className="settings-grid">
        <label className="field field-compact">
          <span>Datapath width</span>
          <select
            value={design.isa.wordBits}
            onChange={(event) => updateIsa({ wordBits: Number(event.target.value) })}
          >
            {tuning.isa.wordBitsOptions.map((bits) => (
              <option key={bits} value={bits}>
                {bits} bits
              </option>
            ))}
          </select>
        </label>

        <label className="field field-compact">
          <span>Registers</span>
          <select
            value={design.isa.registers}
            onChange={(event) => updateIsa({ registers: Number(event.target.value) })}
          >
            {tuning.isa.registerOptions.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>

        <NumberField
          label="Target clock"
          value={settings.targetClockMHz}
          min={tuning.isa.targetClockMinMHz}
          max={tuning.isa.targetClockMaxMHz}
          step={0.1}
          suffix="MHz"
          onCommit={(value) => update({ targetClockMHz: value })}
        />

        <NumberField
          label="Supply voltage"
          value={settings.vdd}
          min={node.vddRange[0]}
          max={node.vddRange[1]}
          step={0.1}
          suffix="V"
          onCommit={(value) => update({ vdd: value })}
        />

        <label className="field field-compact">
          <span>Pipeline stages</span>
          <select
            value={settings.pipelineStages}
            onChange={(event) => update({ pipelineStages: Number(event.target.value) })}
          >
            {Array.from(
              { length: tuning.isa.pipelineStagesMax - tuning.isa.pipelineStagesMin + 1 },
              (_, index) => tuning.isa.pipelineStagesMin + index,
            ).map((stages) => (
              <option key={stages} value={stages}>
                {stages === 1 ? "1 · not pipelined" : stages}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-compact">
          <span>Control style</span>
          <select
            value={settings.control}
            onChange={(event) => update({ control: event.target.value === "hardwired" ? "hardwired" : "microcoded" })}
          >
            <option value="hardwired">Hardwired</option>
            <option value="microcoded">Microcoded</option>
          </select>
        </label>

        <label className="field field-compact">
          <span>Cooling</span>
          <select
            value={settings.cooling}
            onChange={(event) => update({ cooling: event.target.value })}
          >
            {tuning.isa.coolingOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-compact">
          <span>Package</span>
          <select
            value={design.packageId}
            onChange={(event) => onEdit({ type: "setPackage", packageId: event.target.value })}
          >
            {data.packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} · {pkg.maxPins} pins
              </option>
            ))}
          </select>
        </label>

        <label className="field field-compact">
          <span>Test strategy</span>
          <select
            value={settings.testStrategy}
            onChange={(event) => update({ testStrategy: event.target.value })}
          >
            {tuning.isa.testStrategies.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <NumberField
          label="Prefetch queue"
          value={settings.prefetchQueueBytes}
          min={tuning.isa.prefetchQueueMinBytes}
          max={tuning.isa.prefetchQueueMaxBytes}
          suffix="bytes"
          onCommit={(value) => update({ prefetchQueueBytes: value })}
        />

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={settings.busMultiplexed}
            onChange={(event) => update({ busMultiplexed: event.target.checked })}
          />
          <span>Multiplexed bus</span>
        </label>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={settings.spareRows}
            onChange={(event) => update({ spareRows: event.target.checked })}
          />
          <span>Spare rows in memory arrays</span>
        </label>
      </div>

      <div className="settings-status">
        <div>
          <span className="field-label">Target vs timing</span>
          <span className={targetOverFmax ? "settings-warning" : "settings-ok"}>
            {analysis.timing.fMaxMHz === 0
              ? "no complete timing path yet"
              : targetOverFmax
                ? `${formatMHz(settings.targetClockMHz)} target exceeds ${formatMHz(analysis.timing.fMaxMHz)} fMax`
                : `${formatMHz(settings.targetClockMHz)} target ≤ ${formatMHz(analysis.timing.fMaxMHz)} fMax`}
          </span>
          <span className="muted">
            Sustained {formatMHz(analysis.sustainedClockMHz)} after thermal derate.
          </span>
        </div>
        <div>
          <span className="field-label">
            {sampleWorkload?.name ?? "Reference workload"}
          </span>
          <span>
            {sample === null
              ? "no workload"
              : `${formatCount(sample.totalInstructions)} instructions · ${formatBytes(sample.codeBytes)} code`}
          </span>
          <span className="muted">
            {sample === null ? "" : `${sample.bytesPerInstr.toFixed(2)} bytes/instruction`}
          </span>
        </div>
        <div>
          <span className="field-label">Floorplan-owned settings</span>
          <span>
            {formatInteger(cacheBlocks.length)} cache block{cacheBlocks.length === 1 ? "" : "s"} ·{" "}
            {formatInteger(clockGenerators.length)} clock generator{clockGenerators.length === 1 ? "" : "s"}
          </span>
          <span className="muted">
            Cache size/line/associativity and the on-chip clock generator are block configs on the
            floorplan; test strategy, redundancy, prefetch and bus mode feed M6/M7 models.
          </span>
        </div>
      </div>
    </section>
  );
}
