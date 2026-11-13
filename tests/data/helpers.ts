import type { GameData } from "../../src/data/gameData";
import type { DesignPreset } from "../../src/data/presetSchema";
import type {
  BlockType,
  ChipPackage,
  CustomInstruction,
  Isa,
  MemoryLatencyPoint,
  ProcessNode,
  TimingPathTemplate,
  Tuning,
  WorkloadProfile,
} from "../../src/data/schemas";

export interface MutableRawData {
  tuning: Tuning;
  nodes: ProcessNode[];
  blocks: BlockType[];
  packages: ChipPackage[];
  isas: Isa[];
  customInstructions: CustomInstruction[];
  workloads: WorkloadProfile[];
  memoryLatency: MemoryLatencyPoint[];
  timingPaths: TimingPathTemplate[];
  designPresets: DesignPreset[];
}

/** Deep-copy validated records so a test can corrupt one field at a time. */
export function mutableRawData(data: GameData): MutableRawData {
  return {
    tuning: structuredClone(data.tuning),
    nodes: data.nodes.map((record) => structuredClone(record)),
    blocks: data.blocks.map((record) => structuredClone(record)),
    packages: data.packages.map((record) => structuredClone(record)),
    isas: data.isas.map((record) => structuredClone(record)),
    customInstructions: data.customInstructions.map((record) => structuredClone(record)),
    workloads: data.workloads.map((record) => structuredClone(record)),
    memoryLatency: data.memoryLatency.map((record) => structuredClone(record)),
    timingPaths: data.timingPaths.map((record) => structuredClone(record)),
    designPresets: data.designPresets.map((record) => structuredClone(record)),
  };
}
