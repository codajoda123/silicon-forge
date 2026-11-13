import { useMemo } from "react";

import { getGameData, getTuning } from "../../../data/gameData";
import type { ChipDesign } from "../../../sim/design/types";
import { computeOpcodeBudget, resolveCustomInstructions } from "../../../sim/isa/opcode";
import { formatCount, formatPercent } from "../../format";
import { OpcodeBudgetBar } from "./OpcodeBudgetBar";

const data = getGameData();
const tuning = getTuning();

export interface CustomInstructionPanelProps {
  design: ChipDesign;
  onToggle: (id: string) => void;
}

/**
 * Section 8.3 catalog: every instruction consumes opcode space and only pays off
 * on workloads that carry its pattern. Area/power are listed now, simulated later.
 */
export function CustomInstructionPanel({ design, onToggle }: CustomInstructionPanelProps) {
  const budget = useMemo(() => {
    const archetype = data.isaById[design.isa.archetypeId];
    if (archetype === undefined) {
      throw new Error(`Design references unknown ISA archetype "${design.isa.archetypeId}"`);
    }
    const resolved = resolveCustomInstructions(design.customInstructions, data);
    if (resolved.error !== null) {
      throw new Error(resolved.error);
    }
    return computeOpcodeBudget(
      design.isa,
      archetype.opcodeSpaceBits,
      resolved.instructions,
      tuning,
    );
  }, [design]);

  return (
    <section className="panel custom-instruction-panel">
      <h2>Custom instructions</h2>
      <p className="muted">
        A custom instruction replaces a pattern of simple operations. It consumes opcode space
        even in workloads that never use it.
      </p>
      <OpcodeBudgetBar budget={budget} />

      <div className="custom-list">
        {data.customInstructions.map((instruction) => {
          const selected = design.customInstructions.includes(instruction.id);
          const workloads = data.workloads
            .filter((workload) => (workload.patterns[instruction.patternId] ?? 0) > 0)
            .slice(0, 4);
          return (
            <label
              key={instruction.id}
              className={`custom-row${selected ? " is-selected" : ""}`}
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggle(instruction.id)}
              />
              <span className="custom-main">
                <span className="custom-head">
                  <span className="strong">{instruction.name}</span>
                  <span className="mono custom-cost">
                    {String(instruction.opcodeCost)} bits · k={String(instruction.opsReplaced)} ·{" "}
                    {String(instruction.latencyCycles)} cyc
                  </span>
                </span>
                <span className="custom-description">{instruction.description}</span>
                <span className="custom-meta mono">
                  {formatCount(instruction.transistors)} tr · compiler {String(instruction.compilerEffort)} wk
                  · validation ×{instruction.validationWeight.toFixed(1)} · patent{" "}
                  {formatPercent(instruction.patentRisk, 0)}
                </span>
                {workloads.length > 0 ? (
                  <span className="custom-workloads">
                    Helps:{" "}
                    {workloads
                      .map(
                        (workload) =>
                          `${workload.name} (${formatPercent(workload.patterns[instruction.patternId] ?? 0, 0)})`,
                      )
                      .join(", ")}
                  </span>
                ) : (
                  <span className="custom-workloads muted">No Phase 1 workload uses this pattern.</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <p className="instruction-note">
        Over budget means the ISA needs an escape prefix, so every instruction gets longer.
        The breakdown table shows the resulting bytes per instruction and code size.
      </p>
    </section>
  );
}
