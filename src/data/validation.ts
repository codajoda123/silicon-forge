import type { DesignPreset } from "./presetSchema";
import {
  OpClassSchema,
  type BlockType,
  type ChipPackage,
  type CustomInstruction,
  type Isa,
  type ProcessNode,
  type Tuning,
  type WorkloadProfile,
} from "./schemas";
import { compileFormula, type FormulaValue } from "./formula";

export { validateMemoryLatency, validateTimingPaths, validateTuningReferences } from "./timingValidation";

function defaultConfig(block: BlockType): Readonly<Record<string, FormulaValue>> {
  const values: Record<string, FormulaValue> = {};
  for (const [name, option] of Object.entries(block.configSchema)) {
    values[name] = option.default;
  }
  return values;
}

function checkFormula(
  file: string,
  recordId: string,
  field: string,
  source: string,
  variables: Readonly<Record<string, FormulaValue>>,
  allowZero: boolean,
  issues: string[],
): void {
  try {
    const value = compileFormula(source).evaluateNumber(variables);
    if (allowZero ? value < 0 : value <= 0) {
      issues.push(
        `${file}: ${recordId}.${field}: formula "${source}" evaluated to ${String(value)}, expected ${
          allowZero ? ">= 0" : "> 0"
        }`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(`${file}: ${recordId}.${field}: invalid formula "${source}": ${message}`);
  }
}

export function validateNodes(nodes: readonly ProcessNode[], issues: string[]): void {
  for (const node of nodes) {
    if (node.transistorsPerTile / node.densityTrPerMm2 <= 0) {
      issues.push(`nodes.json: ${node.id}: tile area must be positive`);
    }
  }
}

export function validateBlocks(blocks: readonly BlockType[], issues: string[]): void {
  const ids = new Set(blocks.map((block) => block.id));
  for (const block of blocks) {
    const variables = defaultConfig(block);
    checkFormula("blocks.json", block.id, "transistors", block.transistors, variables, true, issues);
    checkFormula("blocks.json", block.id, "logicDepth", block.logicDepth, variables, false, issues);

    const linkTargets = new Set<string>();
    for (const link of block.requiredLinks) {
      if (!ids.has(link.to)) {
        issues.push(`blocks.json: ${block.id}.requiredLinks: unknown target block "${link.to}"`);
      }
      if (link.to === block.id) {
        issues.push(`blocks.json: ${block.id}.requiredLinks: block must not link to itself`);
      }
      if (linkTargets.has(link.to)) {
        issues.push(`blocks.json: ${block.id}.requiredLinks: duplicate target "${link.to}"`);
      }
      linkTargets.add(link.to);
      checkFormula(
        "blocks.json",
        block.id,
        `requiredLinks[${link.to}].widthBits`,
        link.widthBits,
        variables,
        false,
        issues,
      );
    }
  }
}

export function validateIsas(
  isas: readonly Isa[],
  tuning: Tuning,
  issues: string[],
): void {
  const extensionIds = new Set(tuning.isa.extensions.map((extension) => extension.id));
  for (const isa of isas) {
    for (const opClass of OpClassSchema.options) {
      const count = isa.opsToInstr[opClass];
      if (count === undefined || count <= 0) {
        issues.push(`isas.json: ${isa.id}.opsToInstr.${opClass}: must be > 0`);
      }
      const latency = isa.pipelineLatencyPerClass[opClass];
      if (latency === undefined || latency <= 0) {
        issues.push(`isas.json: ${isa.id}.pipelineLatencyPerClass.${opClass}: must be > 0`);
      }
    }
    if (!tuning.isa.wordBitsOptions.includes(isa.defaultWordBits)) {
      issues.push(`isas.json: ${isa.id}.defaultWordBits: not in tuning.isa.wordBitsOptions`);
    }
    if (!tuning.isa.registerOptions.includes(isa.defaultRegisters)) {
      issues.push(`isas.json: ${isa.id}.defaultRegisters: not in tuning.isa.registerOptions`);
    }
    if (
      isa.defaultAddressBits < tuning.isa.addressBitsMin ||
      isa.defaultAddressBits > tuning.isa.addressBitsMax
    ) {
      issues.push(`isas.json: ${isa.id}.defaultAddressBits: outside the tuning range`);
    }
    if (
      isa.defaultAddressingModes < tuning.isa.addressingModesMin ||
      isa.defaultAddressingModes > tuning.isa.addressingModesMax
    ) {
      issues.push(`isas.json: ${isa.id}.defaultAddressingModes: outside the tuning range`);
    }
    for (const extensionId of isa.defaultExtensions) {
      if (!extensionIds.has(extensionId)) {
        issues.push(`isas.json: ${isa.id}.defaultExtensions: unknown extension "${extensionId}"`);
      }
    }
  }
}

export function validateCustomInstructions(
  customInstructions: readonly CustomInstruction[],
  issues: string[],
): void {
  const patternIds = new Set<string>();
  for (const instruction of customInstructions) {
    if (patternIds.has(instruction.patternId)) {
      issues.push(
        `customInstructions.json: duplicate patternId "${instruction.patternId}"`,
      );
    }
    patternIds.add(instruction.patternId);
  }
}

export function validateWorkloads(
  workloads: readonly WorkloadProfile[],
  patterns: ReadonlySet<string>,
  issues: string[],
): void {
  for (const workload of workloads) {
    for (const [patternId, share] of Object.entries(workload.patterns)) {
      if (share === undefined) {
        continue;
      }
      if (!patterns.has(patternId)) {
        issues.push(
          `workloads.json: ${workload.id}.patterns: unknown patternId "${patternId}"`,
        );
      }
      if (share <= 0) {
        issues.push(
          `workloads.json: ${workload.id}.patterns.${patternId}: share must be > 0`,
        );
      }
    }
    if (workload.frameCapHz !== undefined && workload.kind !== "game") {
      issues.push(
        `workloads.json: ${workload.id}.frameCapHz: only games may set a frame cap`,
      );
    }
  }
}

/**
 * Timing-path templates reference block types and, for "link" legs, must be
 * backed by a critical required link for every type combination they allow.
 */
function validatePresetConfig(
  presetId: string,
  block: BlockType,
  config: Readonly<Record<string, unknown>>,
  issues: string[],
): void {
  for (const [name, value] of Object.entries(config)) {
    const option = block.configSchema[name];
    if (option === undefined) {
      issues.push(
        `designPresets.json: ${presetId}.${block.id}: unknown config option "${name}"`,
      );
      continue;
    }
    if (option.kind === "enum") {
      if (typeof value === "boolean" || !option.values.includes(value as string | number)) {
        issues.push(
          `designPresets.json: ${presetId}.${block.id}.${name}: must be one of ${option.values.join(", ")}`,
        );
      }
    } else if (option.kind === "integer") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < option.min || value > option.max) {
        issues.push(
          `designPresets.json: ${presetId}.${block.id}.${name}: must be an integer between ${String(option.min)} and ${String(option.max)}`,
        );
      }
    } else if (typeof value !== "boolean") {
      issues.push(`designPresets.json: ${presetId}.${block.id}.${name}: must be true or false`);
    }
  }
}

/** Section 7.8 presets must reference real data, fit the die and use valid configs. */
export function validateDesignPresets(
  presets: readonly DesignPreset[],
  nodes: readonly ProcessNode[],
  packages: readonly ChipPackage[],
  blocks: readonly BlockType[],
  tuning: Tuning,
  issues: string[],
): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const packageIds = new Set(packages.map((pkg) => pkg.id));
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const aspectRatios = new Set(tuning.design.aspectRatios.map((option) => option.ratio));

  for (const preset of presets) {
    const node = nodeById.get(preset.nodeId);
    if (node === undefined) {
      issues.push(`designPresets.json: ${preset.id}: unknown node "${preset.nodeId}"`);
    }
    if (!packageIds.has(preset.packageId)) {
      issues.push(`designPresets.json: ${preset.id}: unknown package "${preset.packageId}"`);
    }
    if (
      preset.dieW < tuning.design.minDieWidth ||
      preset.dieW > tuning.design.maxDieWidth ||
      preset.dieH < tuning.design.minDieHeight ||
      preset.dieH > tuning.design.maxDieHeight
    ) {
      issues.push(`designPresets.json: ${preset.id}: die size is outside the tuning bounds`);
    }

    let tileTotal = 0;
    for (const blockSpec of preset.blocks) {
      const block = blockById.get(blockSpec.typeId);
      if (block === undefined) {
        issues.push(
          `designPresets.json: ${preset.id}: unknown block type "${blockSpec.typeId}"`,
        );
        continue;
      }
      validatePresetConfig(preset.id, block, blockSpec.config, issues);
      if (blockSpec.aspectRatio !== undefined && !aspectRatios.has(blockSpec.aspectRatio)) {
        issues.push(
          `designPresets.json: ${preset.id}.${block.id}: unknown aspect ratio ${String(blockSpec.aspectRatio)}`,
        );
      }
      if (node !== undefined) {
        const variables = { ...defaultConfig(block), ...blockSpec.config };
        try {
          const transistors = compileFormula(block.transistors).evaluateNumber(variables);
          const logicDepth = compileFormula(block.logicDepth).evaluateNumber(variables);
          if (transistors < 0 || logicDepth <= 0) {
            issues.push(
              `designPresets.json: ${preset.id}.${block.id}: formula produced invalid transistor/logic values`,
            );
          }
          tileTotal += Math.max(
            tuning.design.minBlockTiles,
            Math.ceil(transistors / node.transistorsPerTile),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          issues.push(
            `designPresets.json: ${preset.id}.${block.id}: invalid formula with preset config: ${message}`,
          );
        }
      }
    }
    if (tileTotal > preset.dieW * preset.dieH) {
      issues.push(
        `designPresets.json: ${preset.id}: blocks need ${String(tileTotal)} tiles but the die has ${String(preset.dieW * preset.dieH)}`,
      );
    }
  }
}
