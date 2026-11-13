import { describe, expect, it } from "vitest";

import { OP_CLASSES } from "../../src/data/schemas";
import type { ChipDesign } from "../../src/sim/design/types";
import {
  baseInstructionBytes,
  buildInstructionBreakdown,
  buildInstructionEstimates,
  registerSpillFraction,
} from "../../src/sim/isa/instructionCount";
import { data, emptyDesign, run, tuning } from "../design/helpers";

function designFor(year = 1971): ChipDesign {
  return emptyDesign(year);
}

function withIsa(design: ChipDesign, patch: Partial<ChipDesign["isa"]>): ChipDesign {
  return run(design, { type: "setIsa", isa: { ...design.isa, ...patch } });
}

function workload(id: string) {
  const found = data.workloadById[id];
  if (found === undefined) {
    throw new Error(`Unknown workload "${id}"`);
  }
  return found;
}

describe("instruction count breakdown (Section 9.4 step 1)", () => {
  it("changes instruction count when the archetype changes", () => {
    const ledger = workload("business-ledger");
    const accumulator = designFor(1971);
    const risc = run(accumulator, {
      type: "setIsaArchetype",
      archetypeId: "load-store-risc",
    });

    const accumulatorBreakdown = buildInstructionBreakdown(accumulator, ledger, data, tuning);
    const riscBreakdown = buildInstructionBreakdown(risc, ledger, data, tuning);

    expect(accumulatorBreakdown.totalInstructions).not.toBe(riscBreakdown.totalInstructions);
    expect(accumulatorBreakdown.baseInstructions).not.toBe(riscBreakdown.baseInstructions);
  });

  it("doubles 16-bit arithmetic on an 8-bit datapath through width passes", () => {
    const ledger = workload("business-ledger");
    const narrow = withIsa(designFor(1971), { wordBits: 8 });
    const wide = withIsa(designFor(1971), { wordBits: 16 });

    const narrowBreakdown = buildInstructionBreakdown(narrow, ledger, data, tuning);
    const wideBreakdown = buildInstructionBreakdown(wide, ledger, data, tuning);
    const narrowAlu = narrowBreakdown.rows.find((row) => row.opClass === "intAlu");
    const wideAlu = wideBreakdown.rows.find((row) => row.opClass === "intAlu");

    expect(narrowAlu).toBeDefined();
    expect(wideAlu).toBeDefined();
    if (narrowAlu === undefined || wideAlu === undefined) {
      return;
    }
    expect(narrowAlu.widthPasses).toBe(2);
    expect(wideAlu.widthPasses).toBe(1);
    expect(narrowBreakdown.widthExtra).toBeGreaterThan(0);
    expect(wideBreakdown.widthExtra).toBe(0);
    expect(narrowBreakdown.totalInstructions).toBeGreaterThan(wideBreakdown.totalInstructions);
  });

  it("changes instruction count when registers change, through spills", () => {
    const runWorkload = workload("cad-scientific");
    const few = withIsa(designFor(1971), { registers: 2 });
    const many = withIsa(designFor(1971), { registers: 32 });

    const fewBreakdown = buildInstructionBreakdown(few, runWorkload, data, tuning);
    const manyBreakdown = buildInstructionBreakdown(many, runWorkload, data, tuning);

    expect(registerSpillFraction(few.isa, runWorkload, tuning)).toBeGreaterThan(0);
    expect(registerSpillFraction(many.isa, runWorkload, tuning)).toBe(0);
    expect(fewBreakdown.spillExtra).toBeGreaterThan(0);
    expect(manyBreakdown.spillExtra).toBe(0);
    expect(fewBreakdown.totalInstructions).toBeGreaterThan(manyBreakdown.totalInstructions);
  });

  it("adds bank-switching work when the address space cannot hold the workload", () => {
    const compiler = workload("compiler-build");
    const narrow = withIsa(designFor(1971), { addressBits: 8 });
    const wide = withIsa(narrow, { addressBits: 32 });
    const narrowBreakdown = buildInstructionBreakdown(narrow, compiler, data, tuning);
    const wideBreakdown = buildInstructionBreakdown(wide, compiler, data, tuning);
    expect(narrowBreakdown.addressExtra).toBeGreaterThan(wideBreakdown.addressExtra);
    expect(narrowBreakdown.totalInstructions).toBeGreaterThan(wideBreakdown.totalInstructions);
  });

  it("keeps every breakdown component summing to the total", () => {
    const design = withIsa(designFor(1978), { wordBits: 16, registers: 8 });
    for (const item of data.workloads) {
      const breakdown = buildInstructionBreakdown(design, item, data, tuning);
      const rowTotal = breakdown.rows.reduce((sum, row) => sum + row.instructions, 0);
      const componentTotal =
        breakdown.baseInstructions +
        breakdown.widthExtra +
        breakdown.missingHardwareExtra +
        breakdown.spillExtra +
        breakdown.addressExtra;
      expect(breakdown.totalOps).toBe(
        OP_CLASSES.reduce((sum, opClass) => sum + (item.opsPerUnit[opClass] ?? 0), 0),
      );
      expect(rowTotal).toBeCloseTo(componentTotal, 6);
      expect(breakdown.totalInstructions).toBeCloseTo(
        componentTotal - breakdown.customRemoved,
        6,
      );
      expect(breakdown.totalInstructions).toBeGreaterThanOrEqual(0);
      expect(breakdown.codeBytes).toBeCloseTo(
        breakdown.totalInstructions * breakdown.bytesPerInstr,
        6,
      );
      for (const row of breakdown.rows) {
        expect(row.instructions).toBeGreaterThan(0);
      }
    }
  });

  it("penalises missing hardware and removes the penalty with an extension", () => {
    const galaxy = workload("galaxy-raiders");
    const stripped = withIsa(designFor(1971), { extensions: [] });
    const multiplied = withIsa(stripped, { extensions: ["multiply"] });

    const strippedBreakdown = buildInstructionBreakdown(stripped, galaxy, data, tuning);
    const multipliedBreakdown = buildInstructionBreakdown(multiplied, galaxy, data, tuning);
    expect(strippedBreakdown.missingHardwareExtra).toBeGreaterThan(0);
    expect(multipliedBreakdown.missingHardwareExtra).toBeLessThan(
      strippedBreakdown.missingHardwareExtra,
    );
    expect(multipliedBreakdown.totalInstructions).toBeLessThan(
      strippedBreakdown.totalInstructions,
    );
  });

  it("removes instructions only where the workload carries the custom pattern", () => {
    const calculator = workload("calculator-math");
    const galaxy = workload("galaxy-raiders");
    const design = run(designFor(1971), {
      type: "setCustomInstructions",
      ids: ["ci-multiply-accumulate"],
    });

    const calculatorBreakdown = buildInstructionBreakdown(design, calculator, data, tuning);
    const galaxyBreakdown = buildInstructionBreakdown(design, galaxy, data, tuning);
    expect(calculatorBreakdown.customRemoved).toBe(0);
    expect(calculatorBreakdown.customEffects).toHaveLength(0);
    expect(galaxyBreakdown.customRemoved).toBeGreaterThan(0);
    expect(galaxyBreakdown.customEffects[0]?.patternId).toBe("multiply-accumulate");
  });

  it("uses fixed-length bytes from the word size and variable bytes from the archetype", () => {
    const fixed32 = withIsa(designFor(1971), { fixedLength: true, wordBits: 32 });
    const fixed16 = withIsa(fixed32, { wordBits: 16 });
    const variable = withIsa(fixed16, { fixedLength: false, wordBits: 8 });
    const dense = withIsa(variable, { addressingModes: 12 });
    const sparse = withIsa(variable, { addressingModes: 1 });

    const archetype = data.isaById[fixed16.isa.archetypeId];
    if (archetype === undefined) {
      throw new Error("fixture archetype missing");
    }
    expect(baseInstructionBytes(fixed32.isa, archetype.bytesPerInstr, tuning)).toBe(4);
    expect(baseInstructionBytes(fixed16.isa, archetype.bytesPerInstr, tuning)).toBe(2);
    expect(baseInstructionBytes(dense.isa, archetype.bytesPerInstr, tuning)).toBeLessThan(
      baseInstructionBytes(sparse.isa, archetype.bytesPerInstr, tuning),
    );
  });

  it("estimates every workload and shares one opcode budget", () => {
    const design = run(designFor(1971), {
      type: "setCustomInstructions",
      ids: ["ci-bcd-add-adjust"],
    });
    const estimates = buildInstructionEstimates(design, data, tuning);
    expect(estimates.breakdowns).toHaveLength(data.workloads.length);
    expect(estimates.opcode.selectedCount).toBe(1);
    for (const breakdown of estimates.breakdowns) {
      expect(breakdown.opcode).toEqual(estimates.opcode);
      expect(breakdown.compilerSupport).toBe(tuning.isa.customCompilerSupport);
    }
  });
});
