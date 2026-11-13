import { useMemo, useState } from "react";

import { getGameData, getTuning } from "../../../data/gameData";
import type { ChipDesign } from "../../../sim/design/types";
import { buildInstructionEstimates } from "../../../sim/isa/instructionCount";
import { formatBytes, formatCount, formatInteger, formatPercent } from "../../format";
import { OpcodeBudgetBar } from "./OpcodeBudgetBar";

const data = getGameData();
const tuning = getTuning();

export interface InstructionBreakdownPanelProps {
  design: ChipDesign;
  /** Hide the opcode bar when the parent already shows it. */
  showOpcode?: boolean;
}

/**
 * Section 9.4 step 1 made visible: one row per workload and an op-class detail
 * table. Every number here comes from `buildInstructionEstimates`, the same pure
 * function M6 will use for CPI.
 */
export function InstructionBreakdownPanel({
  design,
  showOpcode = true,
}: InstructionBreakdownPanelProps) {
  const estimates = useMemo(
    () => buildInstructionEstimates(design, data, tuning),
    [design],
  );
  const [workloadId, setWorkloadId] = useState(estimates.breakdowns[0]?.workloadId ?? "");
  const selected =
    estimates.breakdowns.find((breakdown) => breakdown.workloadId === workloadId) ??
    estimates.breakdowns[0];
  const archetype = data.isaById[design.isa.archetypeId];

  if (selected === undefined) {
    return (
      <section className="panel">
        <h2>Instruction breakdown</h2>
        <p className="muted">No workloads are loaded.</p>
      </section>
    );
  }

  return (
    <section className="panel instruction-panel">
      <h2>Instruction breakdown</h2>
      <p className="instruction-hint">
        {archetype?.name ?? design.isa.archetypeId} · {String(design.isa.wordBits)}-bit datapath ·{" "}
        {String(design.isa.registers)} registers · {formatInteger(design.isa.addressBits)}-bit
        addresses · {design.isa.fixedLength ? "fixed" : "variable"} length. Counts are per
        workload work unit ({selected.workUnit}); compiler support for new instructions is{" "}
        {formatPercent(tuning.isa.customCompilerSupport, 0)} until the M8 compiler team exists.
      </p>

      {showOpcode && <OpcodeBudgetBar budget={estimates.opcode} />}

      <div className="instruction-table-wrap">
        <table className="instruction-table">
          <thead>
            <tr>
              <th>Workload</th>
              <th>Ops / unit</th>
              <th>Base</th>
              <th>Width</th>
              <th>Missing HW</th>
              <th>Spills</th>
              <th>Addr</th>
              <th>Custom</th>
              <th>Total instr</th>
              <th>Bytes / instr</th>
              <th>Code</th>
            </tr>
          </thead>
          <tbody>
            {estimates.breakdowns.map((breakdown) => (
              <tr
                key={breakdown.workloadId}
                className={breakdown.workloadId === selected.workloadId ? "is-selected" : ""}
                onClick={() => setWorkloadId(breakdown.workloadId)}
              >
                <td>
                  <button type="button" className="link-button" onClick={() => setWorkloadId(breakdown.workloadId)}>
                    {breakdown.workloadName}
                  </button>
                </td>
                <td className="mono">{formatCount(breakdown.totalOps)}</td>
                <td className="mono">{formatCount(breakdown.baseInstructions)}</td>
                <td className="mono">{breakdown.widthExtra > 0 ? `+${formatCount(breakdown.widthExtra)}` : "—"}</td>
                <td className="mono">
                  {breakdown.missingHardwareExtra > 0
                    ? `+${formatCount(breakdown.missingHardwareExtra)}`
                    : "—"}
                </td>
                <td className="mono">{breakdown.spillExtra > 0 ? `+${formatCount(breakdown.spillExtra)}` : "—"}</td>
                <td className="mono">{breakdown.addressExtra > 0 ? `+${formatCount(breakdown.addressExtra)}` : "—"}</td>
                <td className="mono">{breakdown.customRemoved > 0 ? `−${formatCount(breakdown.customRemoved)}` : "—"}</td>
                <td className="mono strong">{formatCount(breakdown.totalInstructions)}</td>
                <td className="mono">{breakdown.bytesPerInstr.toFixed(2)}</td>
                <td className="mono">{formatBytes(breakdown.codeBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Op-class detail · {selected.workloadName}</h3>
      <div className="instruction-table-wrap">
        <table className="instruction-table instruction-table-detail">
          <thead>
            <tr>
              <th>Op class</th>
              <th>Ops</th>
              <th>Instr / op</th>
              <th>Width passes</th>
              <th>Base</th>
              <th>Width extra</th>
              <th>Missing HW</th>
              <th>Spills</th>
              <th>Addr</th>
              <th>Instructions</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {selected.rows.map((row) => (
              <tr key={row.opClass}>
                <td className="mono">{row.opClass}</td>
                <td className="mono">{formatCount(row.ops)}</td>
                <td className="mono">{row.opsToInstr.toFixed(2)}</td>
                <td className="mono">{String(row.widthPasses)}</td>
                <td className="mono">{formatCount(row.baseInstructions)}</td>
                <td className="mono">{formatCount(row.widthExtra)}</td>
                <td className="mono">{formatCount(row.missingHardwareExtra)}</td>
                <td className="mono">{formatCount(row.spillExtra)}</td>
                <td className="mono">{formatCount(row.addressExtra)}</td>
                <td className="mono strong">{formatCount(row.instructions)}</td>
                <td className="mono">{formatPercent(row.share, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected.customEffects.length > 0 && (
        <>
          <h3>Custom instructions in this workload</h3>
          <ul className="plan-list instruction-effects">
            {selected.customEffects.map((effect) => (
              <li key={effect.id}>
                <span className="strong">{effect.name}</span> · pattern{" "}
                <span className="mono">{effect.patternId}</span> ·{" "}
                {formatPercent(effect.patternShare, 0)} of ops · removes{" "}
                {formatCount(effect.removedOps)} instructions after compiler support
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="instruction-note">
        Width extra is `ceil(operand bits / datapath width) − 1` for arithmetic, logic and
        memory ops. Missing-HW is a software routine for an extension the ISA does not have.
        Spills appear when the register file cannot hold the workload's live values; Addr is
        the bank-switching traffic when the address space cannot cover the workload footprint.
        Custom removal follows Section 8.3 with k and compiler support. CPI, memory stalls and
        FPS are M6.
      </p>
    </section>
  );
}
