import type { OpClass } from "../../data/schemas";
import type { Contributor } from "../explain/why";

export type CpiComponentKey =
  | "issue"
  | "structural"
  | "hazard"
  | "branch"
  | "memory"
  | "custom"
  | "bandwidth";

export interface CpiComponent {
  key: CpiComponentKey;
  label: string;
  /** Cycles per instruction contributed by this component. */
  cpi: number;
  detail: string;
}

export interface CpiUnitLoad {
  unitId: string;
  label: string;
  blockCount: number;
  /** Cycles per instruction this unit group can sustain. */
  cpi: number;
  classes: readonly OpClass[];
}

export interface CpiMixRow {
  key: string;
  label: string;
  share: number;
  instructions: number;
  cyclesPerInstr: number;
}

export interface CacheSummary {
  present: boolean;
  sizeKB: number;
  lineBytes: number;
  associativity: number;
  footprintKB: number;
  missRate: number;
  accessTimeNs: number;
  hitExtraCycles: number;
}

export interface MemorySummary {
  latencyNs: number;
  cycleNs: number;
  waitCycles: number;
  fetchWaitCycles: number;
  dataWaitCycles: number;
  busWidthBits: number;
  busBytesPerCycle: number;
  multiplexed: boolean;
  fetchesPerInstr: number;
  memOpsPerInstr: number;
  prefetchHiddenShare: number;
  instructionCache: CacheSummary;
  dataCache: CacheSummary;
  requiredBytesPerInstr: number;
  bandwidthBytesPerCycle: number;
}

export interface CpiStack {
  total: number;
  components: readonly CpiComponent[];
  units: readonly CpiUnitLoad[];
  mix: readonly CpiMixRow[];
  memory: MemorySummary;
  nonPipelined: boolean;
  pipelineStages: number;
  controlFactor: number;
  issueWidth: number;
  ilpAvailable: number;
  oooHide: number;
  branchAccuracy: number;
  mispredictPenalty: number;
  customInstructionCount: number;
  customShare: number;
}

export type FpsBound = "cpu" | "gpu" | "frame-cap";

export interface FpsEstimate {
  cpuFrameMs: number;
  frameMs: number;
  fps: number;
  fpsLow: number;
  fpsHigh: number;
  bound: FpsBound;
  frameCapHz: number | null;
  frameBudgetUse: number;
  systemOverheadMs: number;
}

export type Confidence = "high" | "medium" | "low";

export interface UncertaintyEstimate {
  /** Relative +/- half-width. */
  relative: number;
  low: number;
  high: number;
  confidence: Confidence;
  reasons: readonly Contributor[];
  validationCoverage: number;
  compilerMaturity: number;
  customReliance: number;
}

export interface PerformanceEstimate {
  workloadId: string;
  workloadName: string;
  workUnit: string;
  /** Clock the estimate actually runs at (target capped by fMax/thermal). */
  clockMHz: number;
  targetClockMHz: number;
  fMaxMHz: number;
  thermalLimited: boolean;
  instructions: number;
  cpi: CpiStack;
  cyclesPerUnit: number;
  timePerUnitMs: number;
  timePerUnitLowMs: number;
  timePerUnitHighMs: number;
  mips: number;
  mipsLow: number;
  mipsHigh: number;
  throughputPerSecond: number;
  fps: FpsEstimate;
  uncertainty: UncertaintyEstimate;
  confidence: Confidence;
  why: readonly Contributor[];
}

export interface PerformanceOptions {
  clockMHz: number;
  targetClockMHz?: number;
  fMaxMHz?: number;
  thermalLimited?: boolean;
}

export interface MemoryModelResult {
  /** Cache and bus wait cycles. */
  cpi: number;
  summary: MemorySummary;
}
