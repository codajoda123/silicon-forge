export type OverlayMode = "none" | "heat" | "wires" | "congestion" | "timing";

export const OVERLAY_OPTIONS: readonly { id: OverlayMode; label: string }[] = [
  { id: "none", label: "Floorplan" },
  { id: "heat", label: "Heat" },
  { id: "wires", label: "Wires" },
  { id: "congestion", label: "Congestion" },
  { id: "timing", label: "Timing" },
];

export interface CategoryStyle {
  fill: string;
  text: string;
}

export const CATEGORY_STYLES: Readonly<Record<string, CategoryStyle>> = {
  fetch: { fill: "#c08a3e", text: "#fffdf6" },
  bus: { fill: "#8a5a2b", text: "#fffdf6" },
  decode: { fill: "#b06f16", text: "#fffdf6" },
  datapath: { fill: "#356b46", text: "#fffdf6" },
  memory: { fill: "#5a6e8a", text: "#fffdf6" },
  system: { fill: "#7a4d6b", text: "#fffdf6" },
  io: { fill: "#9b2f24", text: "#fffdf6" },
  accelerator: { fill: "#6a6a2a", text: "#fffdf6" },
};

export const DEFAULT_STYLE: CategoryStyle = { fill: "#7b6b4f", text: "#fffdf6" };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mix(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  amount: number,
): string {
  const t = clamp01(amount);
  const r = Math.round(from[0] + (to[0] - from[0]) * t);
  const g = Math.round(from[1] + (to[1] - from[1]) * t);
  const b = Math.round(from[2] + (to[2] - from[2]) * t);
  return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

const HEAT_LOW: readonly [number, number, number] = [79, 127, 176];
const HEAT_MID: readonly [number, number, number] = [224, 161, 60];
const HEAT_HIGH: readonly [number, number, number] = [155, 47, 36];
const CONGESTION_LOW: readonly [number, number, number] = [216, 201, 165];
const CONGESTION_MID: readonly [number, number, number] = [224, 161, 60];
const CONGESTION_HIGH: readonly [number, number, number] = [155, 47, 36];

export function heatColor(ratio: number): string {
  const t = clamp01(ratio);
  return t < 0.5 ? mix(HEAT_LOW, HEAT_MID, t * 2) : mix(HEAT_MID, HEAT_HIGH, (t - 0.5) * 2);
}

export function congestionColor(ratio: number): string {
  const t = clamp01(ratio);
  return t < 0.5
    ? mix(CONGESTION_LOW, CONGESTION_MID, t * 2)
    : mix(CONGESTION_MID, CONGESTION_HIGH, (t - 0.5) * 2);
}
