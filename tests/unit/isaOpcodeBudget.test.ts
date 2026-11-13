import { describe, expect, it } from "vitest";

import type { ChipDesign } from "../../src/sim/design/types";
import { buildInstructionBreakdown } from "../../src/sim/isa/instructionCount";
import { computeOpcodeBudget } from "../../src/sim/isa/opcode";
import { data, emptyDesign, run, tuning } from "../design/helpers";

const ALL_IDS = data.customInstructions.map((instruction) => instruction.id);

function withCustom(ids: readonly string[]): ChipDesign {
  return run(emptyDesign(1971), { type: "setCustomInstructions", ids });
}

function calculator() {
  const workload = data.workloadById["calculator-math"];
  if (workload === undefined) {
    throw new Error("fixture workload missing");
  }
  return workload;
}

describe("opcode budget (Section 8.3)", () => {
  it("derives the budget from the archetype opcode space and tuning multiplier", () => {
    const design = emptyDesign(1971);
    const archetype = data.isaById[design.isa.archetypeId];
    if (archetype === undefined) {
      throw new Error("fixture archetype missing");
    }
    const budget = computeOpcodeBudget(design.isa, archetype.opcodeSpaceBits, [], tuning);
    expect(budget.opcodeSpaceBits).toBe(archetype.opcodeSpaceBits);
    expect(budget.budgetBits).toBe(archetype.opcodeSpaceBits * tuning.isa.opcodeSpaceMultiplier);
    expect(budget.overflowing).toBe(false);
    expect(budget.extraEncodingBytes).toBe(0);
  });

  it("fits four catalog instructions in the 1971 budget", () => {
    const design = withCustom(ALL_IDS.slice(0, 4));
    const breakdown = buildInstructionBreakdown(design, calculator(), data, tuning);
    expect(breakdown.opcode.usedBits).toBe(32);
    expect(breakdown.opcode.overflowBits).toBe(0);
    expect(breakdown.opcode.extraEncodingBytes).toBe(0);
    expect(breakdown.bytesPerInstr).toBeCloseTo(breakdown.baseBytesPerInstr, 6);
  });

  it("forces a longer encoding when the fifth instruction overflows the budget", () => {
    const fitting = withCustom(ALL_IDS.slice(0, 4));
    const overflowing = withCustom(ALL_IDS.slice(0, 5));
    const fittingBreakdown = buildInstructionBreakdown(fitting, calculator(), data, tuning);
    const overflowingBreakdown = buildInstructionBreakdown(overflowing, calculator(), data, tuning);

    expect(overflowingBreakdown.opcode.overflowing).toBe(true);
    expect(overflowingBreakdown.opcode.overflowBits).toBeGreaterThan(0);
    expect(overflowingBreakdown.opcode.extraEncodingBytes).toBeGreaterThan(0);
    expect(overflowingBreakdown.bytesPerInstr).toBeGreaterThan(
      fittingBreakdown.bytesPerInstr,
    );
    expect(overflowingBreakdown.baseBytesPerInstr).toBe(
      fittingBreakdown.baseBytesPerInstr,
    );
    expect(overflowingBreakdown.codeBytes).toBeGreaterThan(fittingBreakdown.codeBytes);
  });

  it("grows the encoding again for every full opcode space of overflow", () => {
    const fifth = buildInstructionBreakdown(withCustom(ALL_IDS.slice(0, 5)), calculator(), data, tuning);
    const sixth = buildInstructionBreakdown(withCustom(ALL_IDS.slice(0, 6)), calculator(), data, tuning);
    expect(sixth.opcode.overflowBits).toBeGreaterThan(fifth.opcode.overflowBits);
    expect(sixth.opcode.extraEncodingBytes).toBeGreaterThan(
      fifth.opcode.extraEncodingBytes,
    );
    expect(sixth.bytesPerInstr).toBeGreaterThan(fifth.bytesPerInstr);
  });

  it("drops back to the short encoding when instructions are removed", () => {
    const overflowing = withCustom(ALL_IDS.slice(0, 5));
    const trimmed = run(overflowing, {
      type: "setCustomInstructions",
      ids: ALL_IDS.slice(0, 3),
    });
    const breakdown = buildInstructionBreakdown(trimmed, calculator(), data, tuning);
    expect(breakdown.opcode.overflowing).toBe(false);
    expect(breakdown.opcode.extraEncodingBytes).toBe(0);
    expect(breakdown.bytesPerInstr).toBeCloseTo(breakdown.baseBytesPerInstr, 6);
  });
});
