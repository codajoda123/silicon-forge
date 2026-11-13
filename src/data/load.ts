import { z } from "zod";

import blocksJson from "./blocks.json";
import customInstructionsJson from "./customInstructions.json";
import designPresetsJson from "./designPresets.json";
import isasJson from "./isas.json";
import memoryLatencyJson from "./memoryLatency.json";
import nodesJson from "./nodes.json";
import packagesJson from "./packages.json";
import { DesignPresetSchema, type DesignPreset } from "./presetSchema";
import {
  BlockTypeSchema,
  CustomInstructionSchema,
  IsaSchema,
  MemoryLatencyPointSchema,
  PackageSchema,
  ProcessNodeSchema,
  TimingPathSchema,
  TuningSchema,
  WorkloadSchema,
  type BlockType,
  type ChipPackage,
  type CustomInstruction,
  type Isa,
  type MemoryLatencyPoint,
  type ProcessNode,
  type TimingPathTemplate,
  type Tuning,
  type WorkloadProfile,
} from "./schemas";
import tuningJson from "./tuning.json";
import timingPathsJson from "./timingPaths.json";
import workloadsJson from "./workloads.json";
import {
  validateBlocks,
  validateCustomInstructions,
  validateDesignPresets,
  validateIsas,
  validateMemoryLatency,
  validateNodes,
  validateTimingPaths,
  validateTuningReferences,
  validateWorkloads,
} from "./validation";

export interface RawGameData {
  readonly tuning: unknown;
  readonly nodes: unknown;
  readonly blocks: unknown;
  readonly packages: unknown;
  readonly isas: unknown;
  readonly customInstructions: unknown;
  readonly workloads: unknown;
  readonly memoryLatency: unknown;
  readonly timingPaths: unknown;
  readonly designPresets: unknown;
}

export interface GameData {
  readonly tuning: Tuning;
  readonly nodes: readonly ProcessNode[];
  readonly blocks: readonly BlockType[];
  readonly packages: readonly ChipPackage[];
  readonly isas: readonly Isa[];
  readonly customInstructions: readonly CustomInstruction[];
  readonly workloads: readonly WorkloadProfile[];
  readonly memoryLatency: readonly MemoryLatencyPoint[];
  readonly timingPaths: readonly TimingPathTemplate[];
  readonly designPresets: readonly DesignPreset[];
  readonly nodeById: Readonly<Record<string, ProcessNode>>;
  readonly blockById: Readonly<Record<string, BlockType>>;
  readonly packageById: Readonly<Record<string, ChipPackage>>;
  readonly isaById: Readonly<Record<string, Isa>>;
  readonly customInstructionById: Readonly<Record<string, CustomInstruction>>;
  readonly patternById: Readonly<Record<string, CustomInstruction>>;
  readonly workloadById: Readonly<Record<string, WorkloadProfile>>;
  readonly timingPathById: Readonly<Record<string, TimingPathTemplate>>;
  readonly designPresetById: Readonly<Record<string, DesignPreset>>;
}

export class DataValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `Silicon Forge data failed validation (${String(issues.length)} issue(s)):\n${issues
        .map((issue) => `  - ${issue}`)
        .join("\n")}`,
    );
    this.name = "DataValidationError";
    this.issues = issues;
  }
}

const ArrayOfNodes = z.array(ProcessNodeSchema);
const ArrayOfBlocks = z.array(BlockTypeSchema);
const ArrayOfPackages = z.array(PackageSchema);
const ArrayOfIsas = z.array(IsaSchema);
const ArrayOfCustomInstructions = z.array(CustomInstructionSchema);
const ArrayOfWorkloads = z.array(WorkloadSchema);
const ArrayOfMemoryLatency = z.array(MemoryLatencyPointSchema);
const ArrayOfTimingPaths = z.array(TimingPathSchema);
const ArrayOfDesignPresets = z.array(DesignPresetSchema);

export const BUNDLED_RAW_GAME_DATA: RawGameData = {
  tuning: tuningJson,
  nodes: nodesJson,
  blocks: blocksJson,
  packages: packagesJson,
  isas: isasJson,
  customInstructions: customInstructionsJson,
  workloads: workloadsJson,
  memoryLatency: memoryLatencyJson,
  timingPaths: timingPathsJson,
  designPresets: designPresetsJson,
};

function parseFile<T>(
  file: string,
  schema: z.ZodType<T>,
  value: unknown,
  issues: string[],
): T | undefined {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  for (const issue of result.error.issues) {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "<root>";
    issues.push(`${file}: ${path}: ${issue.message}`);
  }
  return undefined;
}

function checkUniqueIds<T extends { id: string }>(
  file: string,
  records: readonly T[],
  issues: string[],
): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      issues.push(`${file}: duplicate id "${record.id}"`);
    }
    seen.add(record.id);
  }
}

function indexById<T extends { id: string }>(records: readonly T[]): Readonly<Record<string, T>> {
  const index: Record<string, T> = {};
  for (const record of records) {
    index[record.id] = record;
  }
  return index;
}

function indexBy<T>(records: readonly T[], key: (record: T) => string): Readonly<Record<string, T>> {
  const index: Record<string, T> = {};
  for (const record of records) {
    index[key(record)] = record;
  }
  return index;
}

/** Validate raw records and build the immutable game data bundle. */
export function buildGameData(raw: RawGameData): GameData {
  const issues: string[] = [];

  const tuning = parseFile("tuning.json", TuningSchema, raw.tuning, issues);
  const nodes = parseFile("nodes.json", ArrayOfNodes, raw.nodes, issues);
  const blocks = parseFile("blocks.json", ArrayOfBlocks, raw.blocks, issues);
  const packages = parseFile("packages.json", ArrayOfPackages, raw.packages, issues);
  const isas = parseFile("isas.json", ArrayOfIsas, raw.isas, issues);
  const customInstructions = parseFile(
    "customInstructions.json",
    ArrayOfCustomInstructions,
    raw.customInstructions,
    issues,
  );
  const workloads = parseFile("workloads.json", ArrayOfWorkloads, raw.workloads, issues);
  const memoryLatency = parseFile(
    "memoryLatency.json",
    ArrayOfMemoryLatency,
    raw.memoryLatency,
    issues,
  );
  const timingPaths = parseFile(
    "timingPaths.json",
    ArrayOfTimingPaths,
    raw.timingPaths,
    issues,
  );
  const designPresets = parseFile(
    "designPresets.json",
    ArrayOfDesignPresets,
    raw.designPresets,
    issues,
  );

  if (
    tuning === undefined ||
    nodes === undefined ||
    blocks === undefined ||
    packages === undefined ||
    isas === undefined ||
    customInstructions === undefined ||
    workloads === undefined ||
    memoryLatency === undefined ||
    timingPaths === undefined ||
    designPresets === undefined
  ) {
    throw new DataValidationError(issues);
  }

  checkUniqueIds("nodes.json", nodes, issues);
  checkUniqueIds("blocks.json", blocks, issues);
  checkUniqueIds("packages.json", packages, issues);
  checkUniqueIds("isas.json", isas, issues);
  checkUniqueIds("customInstructions.json", customInstructions, issues);
  checkUniqueIds("workloads.json", workloads, issues);
  checkUniqueIds("timingPaths.json", timingPaths, issues);
  checkUniqueIds("designPresets.json", designPresets, issues);

  for (const file of [
    ["nodes.json", nodes],
    ["blocks.json", blocks],
    ["packages.json", packages],
    ["isas.json", isas],
    ["customInstructions.json", customInstructions],
    ["workloads.json", workloads],
    ["timingPaths.json", timingPaths],
    ["designPresets.json", designPresets],
  ] as const) {
    if (file[1].length === 0) {
      issues.push(`${file[0]}: must contain at least one record`);
    }
  }

  validateNodes(nodes, issues);
  validateBlocks(blocks, issues);
  validateIsas(isas, tuning, issues);
  validateCustomInstructions(customInstructions, issues);

  const patternIds = new Set(customInstructions.map((instruction) => instruction.patternId));
  validateWorkloads(workloads, patternIds, issues);
  validateMemoryLatency(memoryLatency, issues);
  validateTimingPaths(timingPaths, blocks, issues);
  validateDesignPresets(designPresets, nodes, packages, blocks, tuning, issues);
  validateTuningReferences(tuning, workloads, issues);

  if (issues.length > 0) {
    throw new DataValidationError(issues);
  }

  return {
    tuning,
    nodes,
    blocks,
    packages,
    isas,
    customInstructions,
    workloads,
    memoryLatency,
    timingPaths,
    designPresets,
    nodeById: indexById(nodes),
    blockById: indexById(blocks),
    packageById: indexById(packages),
    isaById: indexById(isas),
    customInstructionById: indexById(customInstructions),
    patternById: indexBy(customInstructions, (instruction) => instruction.patternId),
    workloadById: indexById(workloads),
    timingPathById: indexById(timingPaths),
    designPresetById: indexById(designPresets),
  };
}

/** Validate the bundled JSON files. Throws DataValidationError with every issue. */
export function loadGameData(): GameData {
  return buildGameData(BUNDLED_RAW_GAME_DATA);
}
