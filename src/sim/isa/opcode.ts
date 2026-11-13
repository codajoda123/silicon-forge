import type { GameData } from "../../data/load";
import type { CustomInstruction, Tuning } from "../../data/schemas";
import type { IsaConfig, OpcodeBudget } from "./types";

export interface ResolvedCustomInstructions {
  instructions: readonly CustomInstruction[];
  error: string | null;
}

/** Selected custom instructions must exist and be unique; order is preserved. */
export function resolveCustomInstructions(
  ids: readonly string[],
  data: GameData,
): ResolvedCustomInstructions {
  const seen = new Set<string>();
  const instructions: CustomInstruction[] = [];
  for (const id of ids) {
    const instruction = data.customInstructionById[id];
    if (instruction === undefined) {
      return { instructions, error: `Unknown custom instruction "${id}".` };
    }
    if (seen.has(id)) {
      return { instructions, error: `Duplicate custom instruction "${id}".` };
    }
    seen.add(id);
    instructions.push(instruction);
  }
  return { instructions, error: null };
}

/**
 * Section 8.3: the archetype's opcode space is the primary page size. M5 models
 * the prefix-extended page budget as a tuning multiplier (see PROGRESS.md).
 * Every custom instruction consumes `opcodeCost` bits; overflow needs an extra
 * escape prefix, i.e. a longer encoding for every instruction in the program.
 */
export function computeOpcodeBudget(
  isa: IsaConfig,
  archetypeOpcodeSpaceBits: number,
  selected: readonly CustomInstruction[],
  tuning: Tuning,
): OpcodeBudget {
  const budgetBits = archetypeOpcodeSpaceBits * tuning.isa.opcodeSpaceMultiplier;
  const usedBits = selected.reduce((sum, instruction) => sum + instruction.opcodeCost, 0);
  const overflowBits = Math.max(0, usedBits - budgetBits);
  const extraEncodingBytes =
    overflowBits === 0
      ? 0
      : Math.ceil(overflowBits / archetypeOpcodeSpaceBits) *
        tuning.isa.extraEncodingBytesPerOverflowChunk;
  return {
    archetypeId: isa.archetypeId,
    opcodeSpaceBits: archetypeOpcodeSpaceBits,
    budgetBits,
    usedBits,
    freeBits: Math.max(0, budgetBits - usedBits),
    overflowBits,
    selectedCount: selected.length,
    extraEncodingBytes,
    overflowing: overflowBits > 0,
  };
}
