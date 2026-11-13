import type { GameData } from "../../data/load";
import type { TimingClass, Tuning } from "../../data/schemas";
import { analyzeCongestion, type CongestionResult } from "./congestion";
import { linkGeometries } from "./geometry";
import { generateLinks } from "./links";
import { analyzeThermal, type ThermalResult } from "./thermal";
import { analyzeTiming, type TimingResult } from "./timing";
import type { ChipDesign } from "./types";
import { analyzePower, type PowerResult } from "../perf/power";
import { coolingConductanceMultiplier } from "../isa/params";

export interface PhysicalOptions {
  voltageV?: number;
  pipelineStages?: number;
  cooling?: string;
}

export interface WireMetric {
  linkId: string;
  fromUid: string;
  toUid: string;
  fromTypeId: string;
  toTypeId: string;
  timing: TimingClass;
  widthBits: number;
  lengthMm: number;
  detour: number;
  delayPs: number;
  pipelined: boolean;
}

export interface PhysicalAnalysis {
  timing: TimingResult;
  wires: readonly WireMetric[];
  congestion: CongestionResult;
  power: PowerResult;
  thermal: ThermalResult;
  sustainedClockMHz: number;
  thermalLimited: boolean;
  warnings: readonly string[];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * M3 orchestration: timing and congestion are position-only; power depends on
 * the sustained clock; thermal feedback derates that clock toward the package
 * limit until the loop is stable.
 */
export function analyzePhysical(
  design: ChipDesign,
  data: GameData,
  tuning: Tuning,
  options: PhysicalOptions = {},
): PhysicalAnalysis {
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new Error(`Design ${design.id} references unknown node "${design.nodeId}"`);
  }
  const voltageV = options.voltageV ?? node.vddNominal;
  const links = generateLinks(design, data);
  const congestion = analyzeCongestion(design, links, data, tuning);
  const timing = analyzeTiming(design, links, congestion, data, tuning, {
    voltageV,
    pipelineStages: options.pipelineStages,
  });

  const detourByLinkId = new Map(
    congestion.linkDetours.map((entry) => [entry.linkId, entry.detour]),
  );
  const pipelined = new Set(design.pipelinedLinks);
  const wires: WireMetric[] = linkGeometries(design, links, node).map((geometry) => {
    const detour = detourByLinkId.get(geometry.link.id) ?? 1;
    return {
      linkId: geometry.link.id,
      fromUid: geometry.link.fromUid,
      toUid: geometry.link.toUid,
      fromTypeId: geometry.link.fromTypeId,
      toTypeId: geometry.link.toTypeId,
      timing: geometry.link.timing,
      widthBits: geometry.link.widthBits,
      lengthMm: geometry.lengthMm,
      detour,
      delayPs: geometry.lengthMm * node.wireDelayPsPerMm * detour,
      pipelined: pipelined.has(geometry.link.id),
    };
  });

  let sustainedClockMHz = timing.fMaxMHz;
  let power = analyzePower(design, data, tuning, {
    clockMHz: sustainedClockMHz,
    voltageV,
  });
  const thermalOptions = {
    verticalConductanceScale: coolingConductanceMultiplier(
      options.cooling ?? tuning.isa.defaultCooling,
      tuning,
    ),
  };
  let thermal = analyzeThermal(design, power, data, tuning, thermalOptions);

  if (
    timing.limitingPath !== null &&
    thermal.hotspotC > thermal.maxJunctionTempC
  ) {
    for (let iteration = 0; iteration < tuning.physical.thermalDerateIterations; iteration += 1) {
      const riseC = thermal.hotspotC - thermal.ambientC;
      const allowedRiseC = thermal.maxJunctionTempC - thermal.ambientC;
      const fraction =
        riseC > 0
          ? clamp(
              allowedRiseC / riseC,
              tuning.physical.minimumClockFraction,
              1,
            )
          : 1;
      const nextClock = timing.fMaxMHz * fraction;
      if (nextClock >= sustainedClockMHz) {
        break;
      }
      sustainedClockMHz = nextClock;
      power = analyzePower(design, data, tuning, {
        clockMHz: sustainedClockMHz,
        voltageV,
      });
      thermal = analyzeThermal(design, power, data, tuning, thermalOptions);
      if (thermal.hotspotC <= thermal.maxJunctionTempC) {
        break;
      }
    }
  }

  const warnings: string[] = [];
  if (timing.limitingPath === null) {
    warnings.push("No complete timing path is present; add the blocks for a real logic path.");
  }
  if (thermal.overLimit) {
    warnings.push(
      `Hotspot ${thermal.hotspotC.toFixed(1)} °C exceeds the ${thermal.packageName} limit of ${String(thermal.maxJunctionTempC)} °C even after clock derate.`,
    );
  }
  if (!thermal.converged) {
    warnings.push("Thermal solver reached its iteration cap without converging.");
  }
  if (congestion.overflowTiles > 0) {
    warnings.push(
      `${String(congestion.overflowTiles)} tile(s) exceed routing capacity; wires detour up to ${(
        (congestion.maxOverflowRatio * tuning.congestion.detourPerOverflowRatio) *
        100
      ).toFixed(0)}%.`,
    );
  }

  return {
    timing,
    wires,
    congestion,
    power,
    thermal,
    sustainedClockMHz,
    thermalLimited:
      timing.limitingPath !== null && sustainedClockMHz < timing.fMaxMHz,
    warnings,
  };
}
