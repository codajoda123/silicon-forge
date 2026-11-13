import { formatInteger } from "../format";
import { getGameData } from "../../data/gameData";
import type { DesignCommand } from "../../sim/design/commands";
import type { PhysicalAnalysis } from "../../sim/design/physical";
import type { ChipDesign } from "../../sim/design/types";
import { StatWithWhy } from "./StatWithWhy";

const data = getGameData();

const CLOCK_SOURCE_LABELS: Readonly<Record<string, string>> = {
  "clock-generator": "clock generator",
  "io-pads": "I/O pads",
  "die-center": "die centre",
};

function formatMHz(value: number): string {
  if (value >= 100) {
    return `${formatInteger(Math.round(value))} MHz`;
  }
  if (value >= 1) {
    return `${value.toFixed(1)} MHz`;
  }
  if (value > 0) {
    return `${formatInteger(Math.round(value * 1000))} kHz`;
  }
  return "0 MHz";
}

function formatWatts(value: number): string {
  return `${value.toFixed(2)} W`;
}

export interface PhysicalPanelProps {
  design: ChipDesign;
  analysis: PhysicalAnalysis;
  onEdit: (command: DesignCommand) => boolean;
}

/**
 * M3 results panel: sustained clock, power, hotspot, congestion and the wire
 * lengths behind them. The clock/power/temperature rows expose "Why?".
 */
export function PhysicalPanel({ design, analysis, onEdit }: PhysicalPanelProps) {
  const { timing, power, thermal, congestion, wires } = analysis;
  const limiting = timing.limitingPath;
  const sortedWires = [...wires].sort((a, b) => {
    if (a.timing === "critical" && b.timing !== "critical") {
      return -1;
    }
    if (b.timing === "critical" && a.timing !== "critical") {
      return 1;
    }
    return b.delayPs - a.delayPs;
  });
  const visibleWires = sortedWires.slice(0, 12);
  const clockNote = analysis.thermalLimited
    ? `Derated from ${formatMHz(timing.fMaxMHz)} by the ${thermal.packageName} thermal limit.`
    : `${timing.pipelineStages} pipeline stage${timing.pipelineStages === 1 ? "" : "s"} · ${timing.effectiveCyclePs.toFixed(0)} ps effective cycle.`;
  const skewNote = `${timing.clockSource.distanceMm.toFixed(2)} mm from ${
    CLOCK_SOURCE_LABELS[timing.clockSource.kind] ?? timing.clockSource.kind
  }.`;

  const blockName = (typeId: string): string => data.blockById[typeId]?.name ?? typeId;

  return (
    <section className="panel physical-panel">
      <h2>Physical analysis</h2>

      <div className="physical-stat-list">
        <StatWithWhy
          label="Sustained clock"
          value={formatMHz(analysis.sustainedClockMHz)}
          why={timing.why}
          note={clockNote}
        />
        <StatWithWhy
          label="Timing limit (fMax)"
          value={limiting === null ? "no path" : formatMHz(timing.fMaxMHz)}
          note={
            limiting === null
              ? undefined
              : `${limiting.name} · ${String(limiting.latencyCycles)} cycle latency`
          }
        />
        <StatWithWhy
          label="Power"
          value={formatWatts(power.totalW)}
          why={power.why}
          note={`${power.dynamicW.toFixed(2)} W dynamic · ${power.staticW.toFixed(2)} W static · ${power.ioW.toFixed(2)} W I/O`}
        />
        <StatWithWhy
          label="Hotspot"
          value={`${thermal.hotspotC.toFixed(1)} °C`}
          why={thermal.why}
          note={`${thermal.packageName} · ${thermal.ambientC.toFixed(0)} °C ambient · ${thermal.hotspotTile.x},${thermal.hotspotTile.y} tile`}
        />
        <StatWithWhy
          label="Thermal margin"
          value={`${thermal.marginC.toFixed(1)} °C`}
          note={`Limit ${String(thermal.maxJunctionTempC)} °C · average ${thermal.averageC.toFixed(1)} °C`}
        />
        <StatWithWhy
          label="Clock skew"
          value={`${timing.skewPenaltyPs.toFixed(0)} ps`}
          note={skewNote}
        />
        <StatWithWhy
          label="Congestion"
          value={`${String(congestion.overflowTiles)} tiles over`}
          why={congestion.why}
          note={`Peak ${(congestion.maxOverflowRatio * 100).toFixed(0)}% over capacity · ${congestion.capacityPerTile.toFixed(0)} tracks/tile`}
        />
      </div>

      {limiting === null ? (
        <p className="physical-empty">
          No complete timing path is present. Place a fetch, decode, execute or memory chain to
          measure fMax.
        </p>
      ) : (
        <div className="limiting-path">
          <div className="limiting-path-head">
            <span className="field-label">Limiting path</span>
            <span className="mono">{String(limiting.latencyCycles)} cycle latency</span>
          </div>
          <div className="limiting-path-name">{limiting.name}</div>
          <div className="limiting-path-stages">
            {limiting.stages.map((stage) => stage.name).join(" → ")}
          </div>
          <div className="physical-stat-note">
            {limiting.logicDelayPs.toFixed(0)} ps logic ·{" "}
            {limiting.wireDelayPs.toFixed(0)} ps wire · {limiting.stageDelayPs.toFixed(0)} ps
            stage
          </div>
        </div>
      )}

      <h3>Wire lengths &amp; pipelining</h3>
      <p className="physical-hint">
        Critical wires first, then longest. Pipelining a critical wire removes its delay from the
        clock cycle but adds one cycle of latency.
        {design.pipelinedLinks.length > 0
          ? ` ${String(design.pipelinedLinks.length)} wire${design.pipelinedLinks.length === 1 ? "" : "s"} currently pipelined.`
          : ""}
      </p>
      <div className="physical-wire-list">
        {visibleWires.length === 0 && <p className="muted">No links yet.</p>}
        {visibleWires.map((wire) => (
          <div
            className={`physical-wire${wire.pipelined ? " is-pipelined" : ""}`}
            key={wire.linkId}
          >
            <div className="physical-wire-route">
              <span className="mono">
                {blockName(wire.fromTypeId)} → {blockName(wire.toTypeId)}
              </span>
              <span className={`wire-tag wire-tag-${wire.timing}`}>{wire.timing}</span>
            </div>
            <div className="physical-wire-meta">
              {wire.lengthMm.toFixed(2)} mm · {formatInteger(Math.round(wire.delayPs))} ps ·{" "}
              {String(wire.widthBits)} bits · detour {wire.detour.toFixed(2)}×
            </div>
            {wire.timing === "critical" && (
              <button
                type="button"
                className={`secondary-button compact-button wire-toggle${wire.pipelined ? " is-on" : ""}`}
                aria-pressed={wire.pipelined}
                onClick={() => {
                  onEdit({
                    type: "setLinkPipelined",
                    linkId: wire.linkId,
                    pipelined: !wire.pipelined,
                  });
                }}
              >
                {wire.pipelined ? "Pipelined (+1 cycle)" : "Pipeline wire"}
              </button>
            )}
          </div>
        ))}
      </div>
      {wires.length > visibleWires.length && (
        <p className="physical-stat-note">
          Showing the first {String(visibleWires.length)} of {String(wires.length)} wires
          (critical first).
        </p>
      )}

      {analysis.warnings.length > 0 && (
        <ul className="designer-warnings">
          {analysis.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
