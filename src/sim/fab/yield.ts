import type { ProcessNode } from "../../data/schemas";

/** Section 11.2: gross dies per wafer, using die area including scribe. */
export function diesPerWafer(waferDiameterMm: number, dieAreaMm2: number): number {
  if (!(waferDiameterMm > 0) || !(dieAreaMm2 > 0)) {
    throw new Error("Wafer diameter and die area must be positive");
  }
  const radius = waferDiameterMm / 2;
  const raw =
    (Math.PI * radius * radius) / dieAreaMm2 -
    (Math.PI * waferDiameterMm) / Math.sqrt(2 * dieAreaMm2);
  return Math.max(0, Math.floor(raw));
}

/** Weeks since the node entered the world, including pre-game history. */
export function weeksSinceNodeIntro(
  startYear: number,
  currentWeek: number,
  node: ProcessNode,
): number {
  return Math.max(0, (startYear - node.historicalYear) * 52 + currentWeek);
}

/**
 * Section 11.3: process maturity plus fab learning. A skill factor below 1
 * represents an own fab that has already learned; rented capacity uses 1.
 */
export function defectDensity(
  node: ProcessNode,
  weeksSinceIntro: number,
  fabSkillFactor = 1,
): number {
  if (!(fabSkillFactor > 0)) {
    throw new Error("Fab skill factor must be positive");
  }
  const maturity = Math.exp(-Math.max(0, weeksSinceIntro) / node.maturityTauWeeks);
  return node.d0Mature + (node.d0Initial - node.d0Mature) * maturity * fabSkillFactor;
}

/** Section 11.3: negative-binomial die yield. Areas are mm², D0 is per cm². */
export function dieYield(dieAreaMm2: number, d0PerCm2: number, alpha: number): number {
  if (!(dieAreaMm2 > 0) || d0PerCm2 < 0 || !(alpha > 0)) {
    throw new Error("Yield inputs must be positive (D0 may be zero)");
  }
  const areaCm2 = dieAreaMm2 / 100;
  return Math.pow(1 + (areaCm2 * d0PerCm2) / alpha, -alpha);
}

export function goodDiesPerWafer(waferDiameterMm: number, dieAreaMm2: number, yieldFraction: number): number {
  return diesPerWafer(waferDiameterMm, dieAreaMm2) * yieldFraction;
}