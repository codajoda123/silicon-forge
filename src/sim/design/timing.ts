import type { GameData } from "../../data/load";
import type { Tuning } from "../../data/schemas";
import type { CongestionResult } from "./congestion";
import { linkGeometries } from "./geometry";
import { clockSourceFor } from "./timingClock";
import {
  enumerateTemplate,
  stageCandidates,
  type PathBuilder,
} from "./timingPaths";
import { buildTimingWhy } from "./timingWhy";
import type {
  TimingOptions,
  TimingPathResult,
  TimingResult,
} from "./timingTypes";
import type { ChipDesign, DesignLink } from "./types";

export type {
  ClockSource,
  ClockSourceKind,
  TimingOptions,
  TimingPathLeg,
  TimingPathResult,
  TimingPathStage,
  TimingResult,
} from "./timingTypes";

/**
 * Section 9.1: alpha-power-law voltage scaling, normalized against nominal Vdd.
 * A higher supply is faster; sub-threshold supplies are rejected.
 */
function voltageDelayFactor(
  node: GameData["nodes"][number],
  voltageV: number,
  exponent: number,
): number {
  if (voltageV <= node.vthV) {
    throw new Error(
      `Supply voltage ${String(voltageV)} V must exceed threshold ${String(node.vthV)} V`,
    );
  }
  const nominal = (node.vddNominal - node.vthV) ** exponent / node.vddNominal;
  const actual = (voltageV - node.vthV) ** exponent / voltageV;
  return nominal / actual;
}

/**
 * Section 9.1: enumerate data-defined timing paths, apply voltage and wire
 * delays, divide by pipeline depth, add latch overhead, then apply clock skew.
 */
export function analyzeTiming(
  design: ChipDesign,
  links: readonly DesignLink[],
  congestion: CongestionResult,
  data: GameData,
  tuning: Tuning,
  options: TimingOptions = {},
): TimingResult {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design ${design.id} references unknown node "${design.nodeId}"`);
  }
  const pipelineStages =
    options.pipelineStages ?? tuning.physical.defaultPipelineStages;
  if (!Number.isInteger(pipelineStages) || pipelineStages < 1) {
    throw new Error(`Pipeline stages must be a positive integer, received ${String(pipelineStages)}`);
  }

  const voltageV = options.voltageV ?? node.vddNominal;
  const voltageFactor = voltageDelayFactor(node, voltageV, tuning.physical.voltageExponent);
  const latchOverheadPs = tuning.physical.latchOverheadGateDelays * node.gateDelayPs;
  const criticalLinkByPair = new Map<string, DesignLink>();
  for (const link of links) {
    if (link.timing === "critical") {
      criticalLinkByPair.set(`${link.fromUid}|${link.toUid}`, link);
    }
  }
  const linkGeometryById = new Map(
    linkGeometries(design, links, node).map((geometry) => [geometry.link.id, geometry]),
  );
  const detourByLinkId = new Map(
    congestion.linkDetours.map((detour) => [detour.linkId, detour.detour]),
  );

  const builder: PathBuilder = {
    tuning,
    node,
    pipelineStages,
    latchOverheadPs,
    congestion,
    criticalLinkByPair,
    linkGeometryById,
    detourByLinkId,
    pipelinedLinkIds: new Set(design.pipelinedLinks),
  };

  const paths: TimingPathResult[] = [];
  for (const template of data.timingPaths) {
    const candidates = template.stages.map((stage) =>
      stageCandidates(stage, design, data, node, voltageFactor),
    );
    if (candidates.some((optionsForStage) => optionsForStage.length === 0)) {
      continue;
    }
    enumerateTemplate(builder, template, candidates, paths);
    if (paths.length >= tuning.timing.maxPathInstances) {
      break;
    }
  }

  const clockSource = clockSourceFor(design, node);
  const skewPenaltyPs = clockSource.distanceMm * tuning.timing.clockSkewPsPerMm;
  let limitingPath: TimingPathResult | null = null;
  for (const path of paths) {
    if (limitingPath === null || path.stageDelayPs > limitingPath.stageDelayPs) {
      limitingPath = path;
    }
  }

  if (limitingPath === null) {
    return {
      paths,
      limitingPath: null,
      fMaxMHz: 0,
      limitingStageDelayPs: 0,
      skewPenaltyPs,
      effectiveCyclePs: 0,
      voltageFactor,
      pipelineStages,
      latchOverheadPs,
      clockSource,
      why: [],
      blockShares: {},
    };
  }

  const effectiveCyclePs = limitingPath.stageDelayPs + skewPenaltyPs;
  const blockShares: Record<string, number> = {};
  for (const stage of limitingPath.stages) {
    blockShares[stage.uid] =
      (blockShares[stage.uid] ?? 0) + stage.logicDelayPs / pipelineStages / effectiveCyclePs;
  }

  return {
    paths,
    limitingPath,
    fMaxMHz: 1e6 / effectiveCyclePs,
    limitingStageDelayPs: limitingPath.stageDelayPs,
    skewPenaltyPs,
    effectiveCyclePs,
    voltageFactor,
    pipelineStages,
    latchOverheadPs,
    clockSource,
    why: buildTimingWhy(limitingPath, skewPenaltyPs, pipelineStages),
    blockShares,
  };
}
