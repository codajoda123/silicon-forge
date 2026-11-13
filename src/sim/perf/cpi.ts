import type { GameData } from "../../data/load";
import {
  OP_CLASSES,
  type BlockType,
  type OpClass,
  type Tuning,
  type WorkloadProfile,
} from "../../data/schemas";
import type { ChipDesign } from "../design/types";
import type { InstructionBreakdown } from "../isa/types";
import { memoryCpi } from "./memory";
import type {
  CpiComponent,
  CpiMixRow,
  CpiStack,
  CpiUnitLoad,
} from "./types";

export interface CpiBuildOptions {
  clockMHz: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function emptyMix(): Record<OpClass, number> {
  const mix = {} as Record<OpClass, number>;
  for (const opClass of OP_CLASSES) {
    mix[opClass] = 0;
  }
  return mix;
}

interface UnitResolution {
  unitId: string;
  label: string;
  blockCount: number;
}

interface PlacedUnitCounts {
  counts: ReadonlyMap<string, number>;
  types: readonly BlockType[];
}

function countPlacedUnits(design: ChipDesign, data: GameData): PlacedUnitCounts {
  const counts = new Map<string, number>();
  for (const block of design.blocks) {
    counts.set(block.typeId, (counts.get(block.typeId) ?? 0) + 1);
  }
  return { counts, types: data.blocks };
}

function resolveUnit(
  opClass: OpClass,
  units: PlacedUnitCounts,
  tuning: Tuning,
): UnitResolution {
  const candidates = units.types.filter((type) => type.unitFor?.includes(opClass) === true);
  const fallback = units.types.filter(
    (type) => type.unitFor?.includes(tuning.perf.fallbackUnitClass) === true,
  );
  const chosen = candidates.length > 0 ? candidates : fallback;
  let blockCount = 0;
  for (const type of chosen) {
    blockCount += units.counts.get(type.id) ?? 0;
  }
  if (blockCount === 0) {
    blockCount = tuning.perf.missingUnitCount;
  }
  const primary = chosen[0];
  return {
    unitId: primary?.id ?? "generic",
    label: primary?.name ?? "Generic execution unit",
    blockCount,
  };
}

/**
 * Section 9.4 steps 1-5. The instruction count comes from the M5 breakdown; this
 * function adds the core/structural/hazard/branch/memory/custom cycles and keeps
 * every component additive so the chart and the "Why?" shares reconcile.
 */
export function buildCpiStack(
  design: ChipDesign,
  workload: WorkloadProfile,
  breakdown: InstructionBreakdown,
  data: GameData,
  tuning: Tuning,
  options: CpiBuildOptions,
): CpiStack {
  const archetype = data.isaById[design.isa.archetypeId];
  if (archetype === undefined) {
    throw new Error(`Design references unknown ISA archetype "${design.isa.archetypeId}"`);
  }
  const totalInstructions = breakdown.totalInstructions;
  const pipelineStages = design.settings.pipelineStages;
  const nonPipelined = pipelineStages <= 1;
  const controlFactor = tuning.perf.controlFactors[design.settings.control];

  let customInstructions = 0;
  let customCycleWeight = 0;
  for (const effect of breakdown.customEffects) {
    const instruction = data.customInstructionById[effect.id];
    if (instruction === undefined) {
      throw new Error(`Design references unknown custom instruction "${effect.id}"`);
    }
    const instances = effect.removedOps / Math.max(1, instruction.opsReplaced - 1);
    customInstructions += instances;
    customCycleWeight += instances * instruction.latencyCycles;
  }
  customInstructions = Math.min(customInstructions, totalInstructions);
  const customShare = totalInstructions > 0 ? customInstructions / totalInstructions : 0;
  const customAverageLatency =
    customInstructions > 0 ? customCycleWeight / customInstructions : 0;

  const rowSubtotal = breakdown.rows.reduce((sum, row) => sum + row.instructions, 0);
  const otherInstructions = Math.max(0, totalInstructions - customInstructions);
  const mixScale = rowSubtotal > 0 ? otherInstructions / rowSubtotal : 0;
  const mix = emptyMix();
  for (const row of breakdown.rows) {
    if (rowSubtotal > 0) {
      mix[row.opClass] += (row.instructions / rowSubtotal) * mixScale;
    }
  }

  const window = tuning.perf.oooWindow;
  const ilpAvailable = workload.ilpMax * (1 - Math.exp(-window / workload.ilpScale));
  const issueWidth = Math.min(
    tuning.perf.issueWidth,
    Math.max(1, ilpAvailable),
  );
  const issueCpi = 1 / issueWidth;
  const oooHide =
    window > 0 ? 1 - Math.exp(-window / tuning.perf.oooHidingScale) : 0;

  let issue = 0;
  if (nonPipelined) {
    for (const opClass of OP_CLASSES) {
      issue +=
        mix[opClass] * archetype.microcodeCyclesPerClass[opClass] * controlFactor;
    }
  } else {
    issue = issueCpi;
  }

  const units = countPlacedUnits(design, data);
  const unitById = new Map<
    string,
    { label: string; blockCount: number; cpi: number; classes: OpClass[] }
  >();
  for (const opClass of OP_CLASSES) {
    const share = mix[opClass];
    if (share <= 0) {
      continue;
    }
    const resolved = resolveUnit(opClass, units, tuning);
    const occupancy = tuning.perf.unitOccupancy[opClass] ?? 1;
    const load = (share * occupancy) / Math.max(1, resolved.blockCount);
    const existing = unitById.get(resolved.unitId);
    if (existing === undefined) {
      unitById.set(resolved.unitId, {
        label: resolved.label,
        blockCount: resolved.blockCount,
        cpi: load,
        classes: [opClass],
      });
    } else {
      existing.cpi += load;
      existing.classes.push(opClass);
    }
  }
  const unitLoads: CpiUnitLoad[] = [...unitById.entries()]
    .map(([unitId, entry]) => ({
      unitId,
      label: entry.label,
      blockCount: entry.blockCount,
      cpi: entry.cpi,
      classes: [...entry.classes],
    }))
    .sort((a, b) => b.cpi - a.cpi);
  const maxUnitCpi = unitLoads[0]?.cpi ?? 0;
  const structural = nonPipelined ? 0 : Math.max(0, maxUnitCpi - issueCpi);

  let hazard = 0;
  if (!nonPipelined) {
    const friendliness = 1 - archetype.pipelineFriendliness * 0.5;
    for (const opClass of OP_CLASSES) {
      const latency = archetype.pipelineLatencyPerClass[opClass] ?? 1;
      hazard +=
        mix[opClass] *
        workload.depProb *
        Math.max(0, latency - 1) *
        (1 - oooHide) *
        friendliness;
    }
  }

  const branchAccuracy = clamp(
    tuning.perf.branch.baseAccuracy +
      tuning.perf.branch.predictabilityScale * workload.branchPredictability,
    0,
    tuning.perf.branch.maxAccuracy,
  );
  const mispredictPenalty = nonPipelined ? 0 : pipelineStages;
  const branch = mix.branch * (1 - branchAccuracy) * mispredictPenalty;

  const custom = nonPipelined
    ? customShare * customAverageLatency
    : customShare * Math.max(0, customAverageLatency - issueCpi);

  const memory = memoryCpi(
    design,
    workload,
    breakdown.bytesPerInstr,
    options.clockMHz,
    mix,
    data,
    tuning,
  );
  const beforeBandwidth =
    issue + custom + structural + hazard + branch + memory.cpi;
  const bandwidthFloor =
    memory.summary.requiredBytesPerInstr /
    Math.max(memory.summary.bandwidthBytesPerCycle, Number.EPSILON);
  const bandwidth = Math.max(0, bandwidthFloor - beforeBandwidth);
  const total = beforeBandwidth + bandwidth;

  const components: CpiComponent[] = [
    {
      key: "issue",
      label: nonPipelined ? "Core (microcode)" : "Core (issue)",
      cpi: issue,
      detail: nonPipelined
        ? `${design.settings.control} control ×${controlFactor.toFixed(2)}`
        : `${issueWidth.toFixed(2)} instructions/cycle`,
    },
    {
      key: "structural",
      label: "Structural",
      cpi: structural,
      detail:
        unitLoads.length > 0
          ? `Busiest unit: ${unitLoads[0]?.label ?? "none"} ×${String(unitLoads[0]?.blockCount ?? 0)}`
          : "No execution unit",
    },
    {
      key: "hazard",
      label: "Hazards",
      cpi: hazard,
      detail: `Dependency probability ${(workload.depProb * 100).toFixed(0)}% · pipeline friendliness ${(archetype.pipelineFriendliness * 100).toFixed(0)}%`,
    },
    {
      key: "branch",
      label: "Branch",
      cpi: branch,
      detail: `${(branchAccuracy * 100).toFixed(0)}% predicted · ${String(mispredictPenalty)} cycle penalty`,
    },
    {
      key: "memory",
      label: "Memory",
      cpi: memory.cpi,
      detail: `${memory.summary.waitCycles} wait cycles · miss I ${(memory.summary.instructionCache.missRate * 100).toFixed(0)}% / D ${(memory.summary.dataCache.missRate * 100).toFixed(0)}%`,
    },
    {
      key: "custom",
      label: "Custom",
      cpi: custom,
      detail: `${customInstructions.toFixed(1)} custom instructions · ${customAverageLatency.toFixed(1)} cycles each`,
    },
    {
      key: "bandwidth",
      label: "Bus bandwidth",
      cpi: bandwidth,
      detail: `${memory.summary.requiredBytesPerInstr.toFixed(2)} bytes/instr on ${memory.summary.busBytesPerCycle.toFixed(2)} bytes/cycle`,
    },
  ];

  const mixRows: CpiMixRow[] = [];
  for (const opClass of OP_CLASSES) {
    if (mix[opClass] <= 0) {
      continue;
    }
    const cyclesPerInstr = nonPipelined
      ? archetype.microcodeCyclesPerClass[opClass] * controlFactor
      : archetype.pipelineLatencyPerClass[opClass];
    mixRows.push({
      key: opClass,
      label: opClass,
      share: mix[opClass],
      instructions: mix[opClass] * totalInstructions,
      cyclesPerInstr,
    });
  }
  if (customShare > 0) {
    mixRows.push({
      key: "custom",
      label: "custom instructions",
      share: customShare,
      instructions: customInstructions,
      cyclesPerInstr: customAverageLatency,
    });
  }
  mixRows.sort((a, b) => b.share - a.share);

  return {
    total,
    components,
    units: unitLoads,
    mix: mixRows,
    memory: memory.summary,
    nonPipelined,
    pipelineStages,
    controlFactor,
    issueWidth,
    ilpAvailable,
    oooHide,
    branchAccuracy,
    mispredictPenalty,
    customInstructionCount: customInstructions,
    customShare,
  };
}
