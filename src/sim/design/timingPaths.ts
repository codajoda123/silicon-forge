import type { GameData } from "../../data/load";
import type { BlockType, TimingPathLegKind, Tuning } from "../../data/schemas";
import { blockStats } from "./blocks";
import type { CongestionResult } from "./congestion";
import {
  blockCenterMm,
  blockCenterTile,
  linkBoundingBox,
  manhattanDistanceMm,
  type LinkGeometry,
  type TileRect,
} from "./geometry";
import type { TimingPathLeg, TimingPathResult, TimingPathStage } from "./timingTypes";
import type { ChipDesign, DesignLink, PlacedBlock } from "./types";

export interface Candidate {
  block: PlacedBlock;
  type: BlockType;
  logicDepth: number;
  logicDelayPs: number;
}

export interface PathBuilder {
  tuning: Tuning;
  node: GameData["nodes"][number];
  pipelineStages: number;
  latchOverheadPs: number;
  congestion: CongestionResult;
  criticalLinkByPair: ReadonlyMap<string, DesignLink>;
  linkGeometryById: ReadonlyMap<string, LinkGeometry>;
  detourByLinkId: ReadonlyMap<string, number>;
  pipelinedLinkIds: ReadonlySet<string>;
}

function averageOverflowRatio(
  congestion: CongestionResult,
  bbox: TileRect,
): number {
  let sum = 0;
  for (let y = bbox.y0; y <= bbox.y1; y += 1) {
    for (let x = bbox.x0; x <= bbox.x1; x += 1) {
      sum += congestion.overflowRatio[y * congestion.dieW + x] ?? 0;
    }
  }
  return sum / (bbox.w * bbox.h);
}

/** Resolve every placed instance that can fill a template stage. */
export function stageCandidates(
  stage: { blockTypes: readonly string[] },
  design: ChipDesign,
  data: GameData,
  node: GameData["nodes"][number],
  voltageFactor: number,
): Candidate[] {
  const wanted = new Set(stage.blockTypes);
  const candidates: Candidate[] = [];
  for (const block of design.blocks) {
    if (!wanted.has(block.typeId)) {
      continue;
    }
    const type = data.blockById[block.typeId];
    if (type === undefined) {
      throw new Error(`Design ${design.id} references unknown block type "${block.typeId}"`);
    }
    const stats = blockStats(type, block.config, node);
    candidates.push({
      block,
      type,
      logicDepth: stats.logicDepth,
      logicDelayPs: stats.logicDepth * node.gateDelayPs * voltageFactor,
    });
  }
  return candidates;
}

function makePathLeg(
  builder: PathBuilder,
  from: Candidate,
  to: Candidate,
  kind: TimingPathLegKind,
): TimingPathLeg | null {
  if (kind === "link") {
    const link = builder.criticalLinkByPair.get(`${from.block.uid}|${to.block.uid}`);
    if (link === undefined) {
      return null;
    }
    const geometry = builder.linkGeometryById.get(link.id);
    if (geometry === undefined) {
      throw new Error(`Missing geometry for link ${link.id}`);
    }
    const detour = builder.detourByLinkId.get(link.id) ?? 1;
    const delayPs = geometry.lengthMm * builder.node.wireDelayPsPerMm * detour;
    const pipelined = builder.pipelinedLinkIds.has(link.id);
    return {
      kind,
      fromUid: from.block.uid,
      toUid: to.block.uid,
      linkId: link.id,
      lengthMm: geometry.lengthMm,
      detour,
      delayPs,
      pipelined,
      countedDelayPs: pipelined ? 0 : delayPs,
    };
  }

  const fromMm = blockCenterMm(from.block, builder.node);
  const toMm = blockCenterMm(to.block, builder.node);
  const bbox = linkBoundingBox(blockCenterTile(from.block), blockCenterTile(to.block));
  const detour =
    1 +
    builder.tuning.congestion.detourPerOverflowRatio *
      averageOverflowRatio(builder.congestion, bbox);
  const lengthMm = manhattanDistanceMm(fromMm, toMm);
  return {
    kind,
    fromUid: from.block.uid,
    toUid: to.block.uid,
    linkId: null,
    lengthMm,
    detour,
    delayPs: lengthMm * builder.node.wireDelayPsPerMm * detour,
    pipelined: false,
    countedDelayPs: lengthMm * builder.node.wireDelayPsPerMm * detour,
  };
}

function finishPath(
  builder: PathBuilder,
  template: { id: string; name: string },
  chosen: readonly Candidate[],
  pathLegs: readonly TimingPathLeg[],
): TimingPathResult {
  const legs = [...pathLegs];
  const stages: TimingPathStage[] = chosen.map((candidate) => ({
    uid: candidate.block.uid,
    typeId: candidate.type.id,
    name: candidate.type.name,
    logicDepth: candidate.logicDepth,
    logicDelayPs: candidate.logicDelayPs,
  }));
  const logicDelayPs = stages.reduce((sum, stage) => sum + stage.logicDelayPs, 0);
  const wireDelayPs = legs.reduce((sum, leg) => sum + leg.countedDelayPs, 0);
  const pipelinedWirePs = legs.reduce(
    (sum, leg) => sum + (leg.pipelined ? leg.delayPs : 0),
    0,
  );
  const pathDelayPs = logicDelayPs + wireDelayPs;
  const stageDelayPs = pathDelayPs / builder.pipelineStages + builder.latchOverheadPs;
  const pipelinedCount = legs.filter((leg) => leg.pipelined).length;

  return {
    id: `${template.id}:${chosen.map((candidate) => candidate.block.uid).join(">")}`,
    templateId: template.id,
    name: template.name,
    stages,
    legs,
    logicDelayPs,
    wireDelayPs,
    pipelinedWirePs,
    pathDelayPs,
    pipelineStages: builder.pipelineStages,
    latchOverheadPs: builder.latchOverheadPs,
    stageDelayPs,
    latencyCycles: builder.pipelineStages + pipelinedCount,
  };
}

/** Enumerate stage combinations depth-first, stopping at the tuning cap. */
export function enumerateTemplate(
  builder: PathBuilder,
  template: GameData["timingPaths"][number],
  candidates: readonly Candidate[][],
  paths: TimingPathResult[],
): void {
  const maxPaths = builder.tuning.timing.maxPathInstances;

  const visit = (
    stageIndex: number,
    chosen: Candidate[],
    legs: TimingPathLeg[],
  ): void => {
    if (paths.length >= maxPaths) {
      return;
    }
    if (stageIndex === candidates.length) {
      paths.push(finishPath(builder, template, chosen, legs));
      return;
    }

    const options = candidates[stageIndex];
    if (options === undefined) {
      return;
    }
    for (const candidate of options) {
      const previous = chosen.at(-1);
      let leg: TimingPathLeg | null = null;
      if (previous !== undefined) {
        const kind = template.legs[stageIndex - 1];
        if (kind === undefined) {
          continue;
        }
        leg = makePathLeg(builder, previous, candidate, kind);
        if (leg === null) {
          continue;
        }
      }
      chosen.push(candidate);
      if (leg !== null) {
        legs.push(leg);
      }
      visit(stageIndex + 1, chosen, legs);
      if (leg !== null) {
        legs.pop();
      }
      chosen.pop();
      if (paths.length >= maxPaths) {
        return;
      }
    }
  };

  visit(0, [], []);
}
