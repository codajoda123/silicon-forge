import { useEffect, useMemo, useState } from "react";

import { getGameData, getTuning } from "../../../data/gameData";
import type { WorkloadProfile } from "../../../data/schemas";
import type { PhysicalAnalysis } from "../../../sim/design/physical";
import type { ChipDesign } from "../../../sim/design/types";
import { estimatePerformanceForDesign } from "../../../sim/perf/performance";
import type { PerformanceEstimate } from "../../../sim/perf/types";
import { formatCount, formatInteger } from "../../format";
import { StatWithWhy } from "../StatWithWhy";
import { CpiStackChart } from "./CpiStackChart";

const data = getGameData();
const tuning = getTuning();

export interface PerformancePanelProps {
  design: ChipDesign;
  analysis: PhysicalAnalysis | null;
  workloads: readonly WorkloadProfile[];
  onOpenWorkloadLab?: () => void;
}

function boundLabel(bound: PerformanceEstimate["fps"]["bound"]): string {
  if (bound === "gpu") {
    return "GPU-bound";
  }
  if (bound === "frame-cap") {
    return "frame cap";
  }
  return "CPU-bound";
}

export function PerformancePanel({
  design,
  analysis,
  workloads,
  onOpenWorkloadLab,
}: PerformancePanelProps) {
  const [workloadId, setWorkloadId] = useState(
    data.workloadById["galaxy-raiders"]?.id ?? workloads[0]?.id ?? "",
  );

  useEffect(() => {
    if (!workloads.some((workload) => workload.id === workloadId)) {
      setWorkloadId(workloads[0]?.id ?? "");
    }
  }, [workloadId, workloads]);

  const workload = workloads.find((candidate) => candidate.id === workloadId);
  const result = useMemo(() => {
    if (analysis === null || workload === undefined || analysis.timing.limitingPath === null) {
      return { perf: null, error: null };
    }
    try {
      return {
        perf: estimatePerformanceForDesign(design, workload, data, tuning, analysis),
        error: null,
      };
    } catch (error) {
      return {
        perf: null,
        error: error instanceof Error ? error.message : "Performance estimate failed.",
      };
    }
  }, [analysis, design, workload]);

  if (analysis === null) {
    return (
      <section className="panel performance-panel">
        <h2>Performance</h2>
        <p className="muted">Select a valid process node to estimate performance.</p>
      </section>
    );
  }

  if (analysis.timing.limitingPath === null) {
    return (
      <section className="panel performance-panel">
        <h2>Performance</h2>
        <p className="designer-warning">
          No complete timing path. Connect a datapath (register file → ALU → register file) and
          the performance model can start.
        </p>
      </section>
    );
  }

  const perf = result.perf;
  const isGame = workload?.kind === "game";
  const confidenceLabel =
    perf === null ? "" : perf.confidence.charAt(0).toUpperCase() + perf.confidence.slice(1);
  const shownReasons =
    perf === null ? [] : perf.uncertainty.reasons.slice(0, tuning.perf.uncertainty.shownReasons);

  return (
    <section className="panel performance-panel">
      <div className="panel-heading-row">
        <h2>Performance</h2>
        {onOpenWorkloadLab !== undefined && (
          <button type="button" className="text-button" onClick={onOpenWorkloadLab}>
            Workload Lab →
          </button>
        )}
      </div>

      <label className="performance-workload-select">
        <span>Workload</span>
        <select
          value={workloadId}
          onChange={(event) => {
            setWorkloadId(event.target.value);
          }}
        >
          {workloads.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} · {candidate.kind}
            </option>
          ))}
        </select>
      </label>

      {result.error !== null && <p className="designer-warning">{result.error}</p>}

      {perf !== null && (
        <>
          <dl className="performance-grid">
            <div>
              <dt>Clock</dt>
              <dd>{perf.clockMHz.toFixed(2)} MHz</dd>
              <span className="performance-note">
                target {perf.targetClockMHz.toFixed(0)} · fMax {perf.fMaxMHz.toFixed(2)}
                {perf.thermalLimited ? " · thermal derate" : ""}
              </span>
            </div>
            <div>
              <dt>MIPS</dt>
              <dd>{perf.mips.toFixed(2)}</dd>
              <span className="performance-note">
                ±{(perf.uncertainty.relative * 100).toFixed(0)}% ·{" "}
                {perf.mipsLow.toFixed(2)}–{perf.mipsHigh.toFixed(2)}
              </span>
            </div>
            <div>
              <dt>{isGame ? "FPS" : "Throughput"}</dt>
              <dd>
                {isGame ? perf.fps.fps.toFixed(1) : `${perf.throughputPerSecond.toFixed(2)}/s`}
              </dd>
              <span className="performance-note">
                {isGame
                  ? `${perf.fps.cpuFrameMs.toFixed(2)} ms/frame · ${boundLabel(perf.fps.bound)}`
                  : `${perf.timePerUnitMs.toFixed(3)} ms/${perf.workUnit}`}
              </span>
            </div>
            <div>
              <dt>CPI</dt>
              <dd>{perf.cpi.total.toFixed(2)}</dd>
              <span className="performance-note">
                {formatCount(perf.instructions)} instructions/{perf.workUnit}
              </span>
            </div>
          </dl>

          {isGame && (
            <p className="performance-range">
              Uncertainty range: <strong>{perf.fps.fpsLow.toFixed(1)}–{perf.fps.fpsHigh.toFixed(1)} FPS</strong>
              {perf.fps.frameCapHz !== null ? ` · capped at ${String(perf.fps.frameCapHz)} Hz` : ""}
              {" · "}confidence <strong>{confidenceLabel}</strong>
            </p>
          )}

          <StatWithWhy
            label="Cycles per instruction"
            value={perf.cpi.total.toFixed(2)}
            why={perf.why}
            note={`${perf.cpi.pipelineStages}-stage ${perf.cpi.nonPipelined ? "non-pipelined" : "pipeline"} · ${perf.cpi.controlFactor.toFixed(2)}× control · ${(perf.cpi.branchAccuracy * 100).toFixed(0)}% branch accuracy`}
          />

          <h3>CPI stack</h3>
          <CpiStackChart components={perf.cpi.components} />

          <h3>Memory &amp; caches</h3>
          <dl className="performance-memory">
            <div>
              <dt>Latency</dt>
              <dd>{perf.cpi.memory.latencyNs.toFixed(0)} ns · {perf.cpi.memory.waitCycles} wait cycles</dd>
            </div>
            <div>
              <dt>I-cache</dt>
              <dd>
                {perf.cpi.memory.instructionCache.present
                  ? `${String(perf.cpi.memory.instructionCache.sizeKB)} KB · ${(perf.cpi.memory.instructionCache.missRate * 100).toFixed(1)}% miss`
                  : "none · every fetch goes to memory"}
              </dd>
            </div>
            <div>
              <dt>D-cache</dt>
              <dd>
                {perf.cpi.memory.dataCache.present
                  ? `${String(perf.cpi.memory.dataCache.sizeKB)} KB · ${(perf.cpi.memory.dataCache.missRate * 100).toFixed(1)}% miss`
                  : "none · every load/store goes to memory"}
              </dd>
            </div>
            <div>
              <dt>Prefetch</dt>
              <dd>
                {String(design.settings.prefetchQueueBytes)} B queue ·{" "}
                {(perf.cpi.memory.prefetchHiddenShare * 100).toFixed(0)}% hidden
              </dd>
            </div>
            <div>
              <dt>Bus</dt>
              <dd>
                {String(perf.cpi.memory.busWidthBits)}-bit
                {perf.cpi.memory.multiplexed ? " multiplexed" : ""} ·{" "}
                {perf.cpi.memory.busBytesPerCycle.toFixed(1)} B/cycle
              </dd>
            </div>
          </dl>

          {shownReasons.length > 0 && (
            <div className="performance-reasons">
              <h3>Why this is uncertain</h3>
              <ul>
                {shownReasons.map((reason) => (
                  <li key={reason.label}>
                    <strong>{reason.label}</strong> · {(reason.share * 100).toFixed(0)}%
                    {reason.detail !== undefined && <span> — {reason.detail}</span>}
                  </li>
                ))}
              </ul>
              <p className="muted">
                Validation coverage {(perf.uncertainty.validationCoverage * 100).toFixed(0)}% ·
                compiler maturity {(perf.uncertainty.compilerMaturity * 100).toFixed(0)}% ·
                workload variance {(workload?.variance ?? 0) * 100}%.
              </p>
            </div>
          )}

          <details className="performance-details">
            <summary>Model details</summary>
            <p>
              {formatInteger(Math.round(perf.instructions))} instructions ·{" "}
              {formatInteger(Math.round(perf.cyclesPerUnit))} cycles ·{" "}
              {perf.timePerUnitMs.toFixed(4)} ms/{perf.workUnit}. Memory stalls are included once
              in the CPI stack; the frame-time formula adds no second latency term.
            </p>
            <p>
              Issue width {perf.cpi.issueWidth.toFixed(2)} · ILP available{" "}
              {perf.cpi.ilpAvailable.toFixed(2)} · OoO hiding{" "}
              {(perf.cpi.oooHide * 100).toFixed(0)}% · custom instructions{" "}
              {perf.cpi.customInstructionCount.toFixed(0)} (
              {(perf.cpi.customShare * 100).toFixed(1)}% of work).
            </p>
          </details>
        </>
      )}
    </section>
  );
}
