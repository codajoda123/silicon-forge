import { buildContributors, type Contributor } from "../explain/why";
import type { TimingPathResult } from "./timingTypes";

/**
 * Section 7.7: decompose the limiting cycle into ordered contributors. Stage
 * logic is divided by pipeline depth to match the stage-delay formula.
 */
export function buildTimingWhy(
  path: TimingPathResult,
  skewPenaltyPs: number,
  pipelineStages: number,
): Contributor[] {
  const inputs = [];
  for (const [index, stage] of path.stages.entries()) {
    inputs.push({
      label: `Stage ${String(index + 1)}: ${stage.name}`,
      value: stage.logicDelayPs / pipelineStages,
      detail: `${stage.logicDepth.toFixed(1)} gate delays`,
    });
  }
  for (const leg of path.legs) {
    if (leg.countedDelayPs <= 0) {
      continue;
    }
    inputs.push({
      label: `Wire: ${leg.fromUid} → ${leg.toUid}`,
      value: leg.countedDelayPs / pipelineStages,
      detail: `${leg.lengthMm.toFixed(2)} mm · detour ${leg.detour.toFixed(2)}×`,
    });
  }
  inputs.push({
    label: "Latch overhead",
    value: path.latchOverheadPs,
    detail: `${path.latchOverheadPs.toFixed(0)} ps`,
  });
  if (skewPenaltyPs > 0) {
    inputs.push({ label: "Clock skew", value: skewPenaltyPs });
  }
  return buildContributors(inputs, { limit: 6, otherLabel: "Other path delays" });
}
