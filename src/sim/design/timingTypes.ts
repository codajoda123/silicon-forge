import type { TimingPathLegKind } from "../../data/schemas";
import type { Contributor } from "../explain/why";

export interface TimingOptions {
  voltageV?: number;
  pipelineStages?: number;
}

export interface TimingPathStage {
  uid: string;
  typeId: string;
  name: string;
  logicDepth: number;
  logicDelayPs: number;
}

export interface TimingPathLeg {
  kind: TimingPathLegKind;
  fromUid: string;
  toUid: string;
  linkId: string | null;
  lengthMm: number;
  detour: number;
  delayPs: number;
  pipelined: boolean;
  countedDelayPs: number;
}

export interface TimingPathResult {
  id: string;
  templateId: string;
  name: string;
  stages: readonly TimingPathStage[];
  legs: readonly TimingPathLeg[];
  logicDelayPs: number;
  wireDelayPs: number;
  pipelinedWirePs: number;
  pathDelayPs: number;
  pipelineStages: number;
  latchOverheadPs: number;
  stageDelayPs: number;
  latencyCycles: number;
}

export type ClockSourceKind = "clock-generator" | "io-pads" | "die-center";

export interface ClockSource {
  kind: ClockSourceKind;
  uid: string | null;
  distanceMm: number;
}

export interface TimingResult {
  paths: readonly TimingPathResult[];
  limitingPath: TimingPathResult | null;
  fMaxMHz: number;
  limitingStageDelayPs: number;
  skewPenaltyPs: number;
  effectiveCyclePs: number;
  voltageFactor: number;
  pipelineStages: number;
  latchOverheadPs: number;
  clockSource: ClockSource;
  why: readonly Contributor[];
  blockShares: Readonly<Record<string, number>>;
}
