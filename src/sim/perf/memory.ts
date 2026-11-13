import type { GameData } from "../../data/load";
import type { OpClass, Tuning, WorkloadProfile } from "../../data/schemas";
import type { ChipDesign } from "../design/types";
import type { CacheSummary, MemoryModelResult, MemorySummary } from "./types";

/** Linear interpolation over the Section 9.4 world memory-latency table. */
export function memoryLatencyNs(
  year: number,
  points: GameData["memoryLatency"],
): number {
  if (points.length === 0) {
    throw new Error("Memory latency data is empty");
  }
  const first = points[0];
  const last = points.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("Memory latency data is empty");
  }
  if (year <= first.year) {
    return first.latencyNs;
  }
  if (year >= last.year) {
    return last.latencyNs;
  }
  for (let index = 1; index < points.length; index += 1) {
    const upper = points[index];
    const lower = points[index - 1];
    if (upper === undefined || lower === undefined || year > upper.year) {
      continue;
    }
    const span = upper.year - lower.year;
    if (span <= 0) {
      return upper.latencyNs;
    }
    const fraction = (year - lower.year) / span;
    return lower.latencyNs + (upper.latencyNs - lower.latencyNs) * fraction;
  }
  return last.latencyNs;
}

function numberConfig(
  config: Readonly<Record<string, unknown>>,
  key: string,
): number | undefined {
  const value = config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

interface CacheBlockConfig {
  sizeKB: number;
  lineBytes: number;
  associativity: number;
}

/** The largest placed cache of one kind; multiple caches do not stack sizes. */
export function cacheConfigFor(
  design: ChipDesign,
  data: GameData,
  blockTypeId: "instruction-cache" | "data-cache",
): CacheBlockConfig | null {
  let best: CacheBlockConfig | null = null;
  for (const block of design.blocks) {
    if (block.typeId !== blockTypeId) {
      continue;
    }
    const type = data.blockById[block.typeId];
    if (type === undefined) {
      throw new Error(`Design ${design.id} references unknown block type "${block.typeId}"`);
    }
    const sizeKB = numberConfig(block.config, "sizeKB") ?? 0;
    if (sizeKB <= 0) {
      continue;
    }
    const lineBytes = numberConfig(block.config, "lineBytes") ?? 16;
    const associativity = numberConfig(block.config, "associativity") ?? 1;
    if (best === null || sizeKB > best.sizeKB) {
      best = { sizeKB, lineBytes, associativity };
    }
  }
  return best;
}

/**
 * Section 9.4 miss-rate power law. A cache at least as large as the footprint
 * still pays the compulsory misses; a smaller one follows the "√2 rule".
 */
export function missRateFor(
  sizeKB: number,
  footprintKB: number,
  associativity: number,
  tuning: Tuning,
): number {
  const memory = tuning.perf.memory;
  if (!(sizeKB > 0)) {
    return 1;
  }
  if (footprintKB <= 0) {
    return memory.compulsoryMissFloor;
  }
  if (sizeKB >= footprintKB) {
    return memory.compulsoryMissFloor;
  }
  const assocFactor = Math.max(
    0,
    1 - memory.associativityMissReduction * Math.max(0, associativity - 1),
  );
  const rate =
    memory.missRateCoefficient *
    sizeKB ** -memory.missRateExponent *
    assocFactor;
  return Math.min(1, Math.max(memory.compulsoryMissFloor, rate));
}

function cacheSummary(
  config: CacheBlockConfig | null,
  footprintKB: number,
  clockMHz: number,
  tuning: Tuning,
): CacheSummary {
  if (config === null) {
    return {
      present: false,
      sizeKB: 0,
      lineBytes: 0,
      associativity: 0,
      footprintKB,
      missRate: 1,
      accessTimeNs: 0,
      hitExtraCycles: 0,
    };
  }
  const accessTimeNs =
    (tuning.perf.memory.cacheAccessTimePsPerSqrtKB * Math.sqrt(config.sizeKB)) / 1000;
  const cycleNs = clockMHz > 0 ? 1000 / clockMHz : Infinity;
  const hitCycles = Number.isFinite(cycleNs)
    ? Math.max(1, Math.ceil(accessTimeNs / cycleNs))
    : 1;
  return {
    present: true,
    sizeKB: config.sizeKB,
    lineBytes: config.lineBytes,
    associativity: config.associativity,
    footprintKB,
    missRate: missRateFor(config.sizeKB, footprintKB, config.associativity, tuning),
    accessTimeNs,
    hitExtraCycles: Math.max(0, hitCycles - 1),
  };
}

/** Bus width comes from the placed BIU (all instances equal); ISA width is the fallback. */
export function busWidthBitsFor(design: ChipDesign, data: GameData): number {
  let width = 0;
  for (const block of design.blocks) {
    if (block.typeId !== "bus-interface") {
      continue;
    }
    if (data.blockById[block.typeId] === undefined) {
      throw new Error(`Design ${design.id} references unknown block type "${block.typeId}"`);
    }
    width = Math.max(width, numberConfig(block.config, "busWidth") ?? 0);
  }
  return width > 0 ? width : design.isa.wordBits;
}

export interface WaitCycles {
  latencyWait: number;
  busExtra: number;
  total: number;
}

/**
 * Section 9.4 wait states. The bus cycle count only matters once memory itself
 * misses the cycle: at low clocks an access fits inside one cycle, so a cache
 * cannot buy any time (the historical turning point Section 9.4 describes).
 */
export function waitCyclesFor(
  clockMHz: number,
  latencyNs: number,
  accessBytes: number,
  busBytes: number,
  multiplexed: boolean,
  tuning: Tuning,
): WaitCycles {
  if (!(clockMHz > 0)) {
    return { latencyWait: 0, busExtra: 0, total: 0 };
  }
  const cycleNs = 1000 / clockMHz;
  const latencyWait = Math.max(0, Math.ceil(latencyNs / cycleNs) - 1);
  if (latencyWait === 0) {
    return { latencyWait: 0, busExtra: 0, total: 0 };
  }
  const transferCycles = Math.max(1, Math.ceil(accessBytes / Math.max(busBytes, Number.EPSILON)));
  const busExtra =
    Math.max(0, transferCycles - 1) +
    (multiplexed ? tuning.perf.memory.multiplexedExtraBusCycles : 0);
  return { latencyWait, busExtra, total: latencyWait + busExtra };
}

/**
 * Section 9.4 step 4. Memory stalls are added exactly once here: the CPI stack
 * adds this component to the core/branch components and the FPS model never
 * adds a second latency term.
 */
export function memoryCpi(
  design: ChipDesign,
  workload: WorkloadProfile,
  bytesPerInstr: number,
  clockMHz: number,
  mix: Readonly<Partial<Record<OpClass, number>>>,
  data: GameData,
  tuning: Tuning,
): MemoryModelResult {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design ${design.id} references unknown node "${design.nodeId}"`);
  }
  const latencyNs = memoryLatencyNs(node.historicalYear, data.memoryLatency);
  const cycleNs = clockMHz > 0 ? 1000 / clockMHz : Infinity;

  const instructionCache = cacheSummary(
    cacheConfigFor(design, data, "instruction-cache"),
    workload.footprintKB.instr,
    clockMHz,
    tuning,
  );
  const dataCache = cacheSummary(
    cacheConfigFor(design, data, "data-cache"),
    workload.footprintKB.data,
    clockMHz,
    tuning,
  );

  const queueBytes = design.settings.prefetchQueueBytes;
  const bufferedInstructions =
    bytesPerInstr > 0 && queueBytes > 0 ? queueBytes / bytesPerInstr : 0;
  const prefetchHiddenShare = Math.min(
    tuning.perf.memory.maxPrefetchHiddenShare,
    bufferedInstructions * tuning.perf.memory.prefetchHiddenSharePerBufferedInstr,
  );
  const fetchesPerInstr = 1 - prefetchHiddenShare;
  const memOpsPerInstr = (mix.load ?? 0) + (mix.store ?? 0);
  const dataBytes = Math.max(1, workload.memBytesPerOp);
  const busWidthBits = busWidthBitsFor(design, data);
  const busBytes = busWidthBits / 8;
  const multiplexed = design.settings.busMultiplexed;

  const instructionWait = waitCyclesFor(
    clockMHz,
    latencyNs,
    bytesPerInstr,
    busBytes,
    multiplexed,
    tuning,
  );
  const dataWait = waitCyclesFor(
    clockMHz,
    latencyNs,
    dataBytes,
    busBytes,
    multiplexed,
    tuning,
  );

  const cpi =
    fetchesPerInstr * instructionCache.missRate * instructionWait.total +
    memOpsPerInstr * dataCache.missRate * dataWait.total +
    instructionCache.hitExtraCycles * fetchesPerInstr * (1 - instructionCache.missRate) +
    dataCache.hitExtraCycles * memOpsPerInstr * (1 - dataCache.missRate);

  const requiredBytesPerInstr =
    fetchesPerInstr * instructionCache.missRate * bytesPerInstr +
    memOpsPerInstr * dataCache.missRate * dataBytes;

  const summary: MemorySummary = {
    latencyNs,
    cycleNs,
    waitCycles: Math.max(instructionWait.total, dataWait.total),
    fetchWaitCycles: instructionWait.total,
    dataWaitCycles: dataWait.total,
    busWidthBits,
    busBytesPerCycle: busBytes,
    multiplexed,
    fetchesPerInstr,
    memOpsPerInstr,
    prefetchHiddenShare,
    instructionCache,
    dataCache,
    requiredBytesPerInstr,
    bandwidthBytesPerCycle: busBytes,
  };

  return { cpi, summary };
}
