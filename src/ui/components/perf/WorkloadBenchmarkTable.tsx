import { useMemo } from "react";

import { getGameData, getTuning } from "../../../data/gameData";
import type { WorkloadProfile } from "../../../data/schemas";
import type { ChipDesign } from "../../../sim/design/types";
import { analyzePhysical } from "../../../sim/design/physical";
import { estimatePerformanceForDesign } from "../../../sim/perf/performance";
import type { PerformanceEstimate } from "../../../sim/perf/types";

const data = getGameData();
const tuning = getTuning();

export interface WorkloadBenchmarkTableProps {
  designs: readonly ChipDesign[];
  activeDesignId: string;
  workload: WorkloadProfile;
}

export function WorkloadBenchmarkTable({
  designs,
  activeDesignId,
  workload,
}: WorkloadBenchmarkTableProps) {
  const rows = useMemo(() => {
    const result: { designId: string; name: string; perf: PerformanceEstimate }[] = [];
    for (const design of designs) {
      try {
        const analysis = analyzePhysical(design, data, tuning, {
          voltageV: design.settings.vdd,
          pipelineStages: design.settings.pipelineStages,
          cooling: design.settings.cooling,
        });
        if (analysis.timing.limitingPath === null) {
          continue;
        }
        result.push({
          designId: design.id,
          name: design.name,
          perf: estimatePerformanceForDesign(design, workload, data, tuning, analysis),
        });
      } catch {
        // An incomplete design is skipped rather than breaking the whole lab.
      }
    }
    return result;
  }, [designs, workload]);

  return (
    <div className="panel workload-benchmark-panel">
      <h2>Benchmark designs</h2>
      {rows.length === 0 ? (
        <p className="muted">
          No complete design yet. A complete register-file → ALU path is required.
        </p>
      ) : (
        <table className="benchmark-table">
          <thead>
            <tr>
              <th>Design</th>
              <th>Clock</th>
              <th>CPI</th>
              <th>MIPS</th>
              <th>{workload.kind === "game" ? "FPS" : `ms/${workload.workUnit}`}</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.designId}
                className={row.designId === activeDesignId ? "active-row" : undefined}
              >
                <td>
                  {row.name}
                  {row.designId === activeDesignId ? " ★" : ""}
                </td>
                <td>{row.perf.clockMHz.toFixed(2)} MHz</td>
                <td>{row.perf.cpi.total.toFixed(2)}</td>
                <td>{row.perf.mips.toFixed(2)}</td>
                <td>
                  {workload.kind === "game"
                    ? row.perf.fps.fps.toFixed(1)
                    : row.perf.timePerUnitMs.toFixed(3)}
                </td>
                <td>{row.perf.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">
        ★ is the active design. Ranges and the CPI stack are in the Performance panel on the Chip
        Designer screen.
      </p>
    </div>
  );
}
