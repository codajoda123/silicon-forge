import type { GameData } from "../../data/load";
import type { BlockType, ConfigValue, OpClass, ProcessNode, Tuning } from "../../data/schemas";
import { buildContributors, type Contributor } from "../explain/why";
import { blockStats } from "../design/blocks";
import type { ChipDesign } from "../design/types";

export interface PowerOptions {
  clockMHz: number;
  voltageV?: number;
  workloadId?: string;
}

export interface BlockPower {
  uid: string;
  typeId: string;
  name: string;
  transistors: number;
  activity: number;
  dynamicW: number;
  staticW: number;
  ioW: number;
  totalW: number;
}

export interface BlockPowerValues {
  transistors: number;
  activity: number;
  dynamicW: number;
  staticW: number;
  ioW: number;
  totalW: number;
}

export interface PowerResult {
  clockMHz: number;
  voltageV: number;
  workloadId: string;
  dynamicW: number;
  staticW: number;
  ioW: number;
  totalW: number;
  blocks: readonly BlockPower[];
  why: readonly Contributor[];
}

/** Workload-weighted switching activity in 0..1 for one block. */
export function blockActivity(
  activity: Partial<Record<OpClass, number>>,
  workloadShares: Readonly<Partial<Record<OpClass, number>>>,
): number {
  let total = 0;
  for (const [opClass, weight] of Object.entries(activity)) {
    if (weight === undefined) {
      continue;
    }
    total += weight * (workloadShares[opClass as OpClass] ?? 0);
  }
  return Math.min(1, Math.max(0, total));
}

/** Workload-weighted operation mix used by every block's activity model. */
export function workloadShares(
  workload: GameData["workloads"][number],
): Partial<Record<OpClass, number>> {
  const totalOps = Object.values(workload.opsPerUnit).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const shares: Partial<Record<OpClass, number>> = {};
  for (const [opClass, count] of Object.entries(workload.opsPerUnit)) {
    if (count !== undefined && totalOps > 0) {
      shares[opClass as OpClass] = count / totalOps;
    }
  }
  return shares;
}

/**
 * Section 9.2 for one block instance. Shared by the power panel and auto-place
 * so placement scoring never re-implements the formula.
 */
export function computeBlockPower(
  type: BlockType,
  config: Readonly<Record<string, ConfigValue>>,
  node: ProcessNode,
  shares: Readonly<Partial<Record<OpClass, number>>>,
  clockMHz: number,
  voltageV: number,
  tuning: Tuning,
): BlockPowerValues {
  const stats = blockStats(type, config, node);
  const activity = blockActivity(type.activity, shares);
  const frequencyHz = clockMHz * 1e6;
  const dynamicW =
    activity *
    node.capPerKTrPf *
    1e-12 *
    (stats.transistors / 1000) *
    voltageV *
    voltageV *
    frequencyHz;
  const staticW =
    node.staticPowerPerKTrW *
    (stats.transistors / 1000) *
    (voltageV / node.vddNominal) ** 2;

  let ioW = 0;
  if (type.id === "io-pads") {
    const activePads =
      (typeof config.dataPins === "number" ? config.dataPins : 0) +
      (typeof config.addressPins === "number" ? config.addressPins : 0) +
      (typeof config.controlPins === "number" ? config.controlPins : 0);
    ioW =
      activePads *
      tuning.power.ioPowerPerPadW *
      (clockMHz / tuning.power.ioReferenceClockMHz);
  }

  return {
    transistors: stats.transistors,
    activity,
    dynamicW,
    staticW,
    ioW,
    totalW: dynamicW + staticW + ioW,
  };
}

/**
 * Section 9.2: dynamic power scales with activity, capacitance, voltage² and
 * clock; static power is the NMOS idle tax. I/O power is per active pad.
 */
export function analyzePower(
  design: ChipDesign,
  data: GameData,
  tuning: Tuning,
  options: PowerOptions,
): PowerResult {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design ${design.id} references unknown node "${design.nodeId}"`);
  }
  const workloadId = options.workloadId ?? tuning.power.referenceWorkloadId;
  const workload = data.workloadById[workloadId];
  if (workload === undefined) {
    throw new Error(`Unknown workload "${workloadId}"`);
  }
  if (!Number.isFinite(options.clockMHz) || options.clockMHz < 0) {
    throw new Error(`Clock must be a non-negative number, received ${String(options.clockMHz)}`);
  }
  const voltageV = options.voltageV ?? node.vddNominal;
  const shares = workloadShares(workload);

  const blocks: BlockPower[] = [];
  let dynamicW = 0;
  let staticW = 0;
  let ioW = 0;

  for (const block of design.blocks) {
    const type = data.blockById[block.typeId];
    if (type === undefined) {
      throw new Error(`Design ${design.id} references unknown block type "${block.typeId}"`);
    }
    const values = computeBlockPower(
      type,
      block.config,
      node,
      shares,
      options.clockMHz,
      voltageV,
      tuning,
    );
    dynamicW += values.dynamicW;
    staticW += values.staticW;
    ioW += values.ioW;
    blocks.push({
      uid: block.uid,
      typeId: block.typeId,
      name: type.name,
      ...values,
    });
  }

  const totalW = dynamicW + staticW + ioW;
  const why = buildContributors(
    blocks.map((block) => ({
      label: block.name,
      value: block.totalW,
      detail: `${String(Math.round(block.transistors))} tr · activity ${block.activity.toFixed(2)}`,
    })),
    { limit: 6, otherLabel: "Other blocks" },
  );

  return {
    clockMHz: options.clockMHz,
    voltageV,
    workloadId,
    dynamicW,
    staticW,
    ioW,
    totalW,
    blocks,
    why,
  };
}
