import { OpClassSchema, type BlockType, type MemoryLatencyPoint, type TimingPathTemplate, type Tuning, type WorkloadProfile } from "./schemas";

export function validateTimingPaths(
  paths: readonly TimingPathTemplate[],
  blocks: readonly BlockType[],
  issues: string[],
): void {
  const blockById = new Map(blocks.map((block) => [block.id, block]));

  for (const path of paths) {
    for (const stage of path.stages) {
      for (const typeId of stage.blockTypes) {
        if (!blockById.has(typeId)) {
          issues.push(
            `timingPaths.json: ${path.id}.stages: unknown block type "${typeId}"`,
          );
        }
      }
    }

    for (let index = 0; index < path.legs.length; index += 1) {
      if (path.legs[index] !== "link") {
        continue;
      }
      const fromStage = path.stages[index];
      const toStage = path.stages[index + 1];
      if (fromStage === undefined || toStage === undefined) {
        continue;
      }
      for (const fromId of fromStage.blockTypes) {
        const fromBlock = blockById.get(fromId);
        if (fromBlock === undefined) {
          continue;
        }
        for (const toId of toStage.blockTypes) {
          if (blockById.get(toId) === undefined) {
            continue;
          }
          const hasCriticalLink = fromBlock.requiredLinks.some(
            (link) => link.to === toId && link.timing === "critical",
          );
          if (!hasCriticalLink) {
            issues.push(
              `timingPaths.json: ${path.id}.legs[${String(index)}]: no critical link "${fromId}" -> "${toId}"`,
            );
          }
        }
      }
    }
  }
}

export function validateTuningReferences(
  tuning: Tuning,
  workloads: readonly WorkloadProfile[],
  issues: string[],
): void {
  if (!workloads.some((workload) => workload.id === tuning.power.referenceWorkloadId)) {
    issues.push(
      `tuning.json: power.referenceWorkloadId: unknown workload "${tuning.power.referenceWorkloadId}"`,
    );
  }

  const extensionIds = new Set<string>();
  const coveredClasses = new Set<string>();
  for (const extension of tuning.isa.extensions) {
    if (extensionIds.has(extension.id)) {
      issues.push(`tuning.json: isa.extensions: duplicate id "${extension.id}"`);
    }
    extensionIds.add(extension.id);
    for (const opClass of extension.opClasses) {
      if (coveredClasses.has(opClass)) {
        issues.push(`tuning.json: isa.extensions: ${opClass} is covered by two extensions`);
      }
      coveredClasses.add(opClass);
    }
  }

  const testIds = new Set<string>();
  for (const strategy of tuning.isa.testStrategies) {
    if (testIds.has(strategy.id)) {
      issues.push(`tuning.json: isa.testStrategies: duplicate id "${strategy.id}"`);
    }
    testIds.add(strategy.id);
  }
  if (!testIds.has(tuning.isa.defaultTestStrategy)) {
    issues.push("tuning.json: isa.defaultTestStrategy: unknown test strategy");
  }

  const coolingIds = new Set<string>();
  for (const cooling of tuning.isa.coolingOptions) {
    if (coolingIds.has(cooling.id)) {
      issues.push(`tuning.json: isa.coolingOptions: duplicate id "${cooling.id}"`);
    }
    coolingIds.add(cooling.id);
  }
  if (!coolingIds.has(tuning.isa.defaultCooling)) {
    issues.push("tuning.json: isa.defaultCooling: unknown cooling option");
  }

  if (tuning.isa.addressBitsMin > tuning.isa.addressBitsMax) {
    issues.push("tuning.json: isa.addressBitsMin must be <= addressBitsMax");
  }
  if (tuning.isa.addressingModesMin > tuning.isa.addressingModesMax) {
    issues.push("tuning.json: isa.addressingModesMin must be <= addressingModesMax");
  }
  if (tuning.isa.targetClockMinMHz > tuning.isa.targetClockMaxMHz) {
    issues.push("tuning.json: isa.targetClockMinMHz must be <= targetClockMaxMHz");
  }
  if (tuning.isa.pipelineStagesMin > tuning.isa.pipelineStagesMax) {
    issues.push("tuning.json: isa.pipelineStagesMin must be <= pipelineStagesMax");
  }
  if (tuning.isa.prefetchQueueMinBytes > tuning.isa.prefetchQueueMaxBytes) {
    issues.push("tuning.json: isa.prefetchQueueMinBytes must be <= prefetchQueueMaxBytes");
  }
  if (tuning.perf.uncertainty.highThreshold >= tuning.perf.uncertainty.mediumThreshold) {
    issues.push("tuning.json: perf.uncertainty.highThreshold must be < mediumThreshold");
  }
  for (const opClass of OpClassSchema.options) {
    if (tuning.perf.unitOccupancy[opClass] === undefined) {
      issues.push(`tuning.json: perf.unitOccupancy.${opClass}: missing occupancy`);
    }
  }
}

/** Section 9.4 memory latency must be a year-ordered, interpolatable table. */
export function validateMemoryLatency(
  points: readonly MemoryLatencyPoint[],
  issues: string[],
): void {
  if (points.length < 2) {
    issues.push("memoryLatency.json: at least two points are required");
  }
  let previousYear = -Infinity;
  for (const point of points) {
    if (point.year <= previousYear) {
      issues.push(
        `memoryLatency.json: years must be strictly increasing (${String(point.year)} after ${String(previousYear)})`,
      );
    }
    previousYear = point.year;
    if (!(point.latencyNs > 0)) {
      issues.push(`memoryLatency.json: ${String(point.year)} latency must be positive`);
    }
  }
}

