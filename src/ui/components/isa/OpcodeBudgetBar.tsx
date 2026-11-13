import type { OpcodeBudget } from "../../../sim/isa/types";
import { formatInteger } from "../../format";

export interface OpcodeBudgetBarProps {
  budget: OpcodeBudget;
}

/** Section 8.3: opcode-space gauge; overflow is the useful failure state. */
export function OpcodeBudgetBar({ budget }: OpcodeBudgetBarProps) {
  const ratio = budget.budgetBits > 0 ? budget.usedBits / budget.budgetBits : 0;
  const width = Math.min(100, ratio * 100);
  return (
    <div className={`opcode-budget${budget.overflowing ? " is-overflowing" : ""}`}>
      <div className="opcode-budget-head">
        <span className="field-label">Opcode budget</span>
        <span className="mono">
          {formatInteger(budget.usedBits)} / {formatInteger(budget.budgetBits)} bits
        </span>
      </div>
      <div className="opcode-budget-track" role="meter" aria-valuemin={0} aria-valuemax={budget.budgetBits} aria-valuenow={Math.min(budget.usedBits, budget.budgetBits)}>
        <div className="opcode-budget-fill" style={{ width: `${width}%` }} />
      </div>
      <p className="opcode-budget-note">
        {budget.overflowing
          ? `Over budget by ${formatInteger(budget.overflowBits)} bits → encoding grows by ${formatInteger(budget.extraEncodingBytes)} byte${budget.extraEncodingBytes === 1 ? "" : "s"} per instruction.`
          : `${formatInteger(budget.freeBits)} free bits. ${formatInteger(budget.selectedCount)} custom instruction${budget.selectedCount === 1 ? "" : "s"} selected.`}
      </p>
    </div>
  );
}
