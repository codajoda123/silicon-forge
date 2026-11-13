import type { PhysicalAnalysis } from "../../../sim/design/physical";
import type { BlockRegion, ChipDesign, DesignLink, PlacedBlock } from "../../../sim/design/types";
import { getGameData } from "../../../data/gameData";
import {
  CATEGORY_STYLES,
  DEFAULT_STYLE,
  congestionColor,
  heatColor,
  type OverlayMode,
} from "./colors";
import { drawRegionOverlays } from "./regions";

const data = getGameData();

export interface DragVisual {
  uid: string;
  x: number;
  y: number;
  valid: boolean;
}

export interface PlacementVisual {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawFloorplanOptions {
  ctx: CanvasRenderingContext2D;
  design: ChipDesign;
  links: readonly DesignLink[];
  analysis: PhysicalAnalysis;
  overlay: OverlayMode;
  selectedUid: string | null;
  drag: DragVisual | null;
  regionDrag: BlockRegion | null;
  hoverPlacement: PlacementVisual | null;
  hoverValid: boolean;
  dpr: number;
  canvasW: number;
  canvasH: number;
  coreX: number;
  coreY: number;
  coreW: number;
  coreH: number;
  tilePx: number;
  padPx: number;
  padCount: number;
}

function effectiveBlock(block: PlacedBlock, drag: DragVisual | null): PlacedBlock {
  return drag?.uid === block.uid ? { ...block, x: drag.x, y: drag.y } : block;
}

function drawPadRing(
  ctx: CanvasRenderingContext2D,
  count: number,
  coreX: number,
  coreY: number,
  coreW: number,
  coreH: number,
  padPx: number,
): void {
  const total = 2 * (coreW + coreH);
  if (count <= 0 || total <= 0) {
    return;
  }
  const padSize = Math.max(2, Math.min(8, padPx * 0.42));
  for (let index = 0; index < count; index += 1) {
    let distance = ((index + 0.5) / count) * total;
    let px: number;
    let py: number;
    if (distance < coreW) {
      px = coreX + distance;
      py = coreY - padPx / 2;
    } else if ((distance -= coreW) < coreH) {
      px = coreX + coreW + padPx / 2;
      py = coreY + distance;
    } else if ((distance -= coreH) < coreW) {
      px = coreX + coreW - distance;
      py = coreY + coreH + padPx / 2;
    } else {
      distance -= coreW;
      px = coreX - padPx / 2;
      py = coreY + coreH - distance;
    }
    ctx.fillStyle = "#8a6a2f";
    ctx.fillRect(px - padSize / 2, py - padSize / 2, padSize, padSize);
  }
}

interface Centers {
  readonly map: ReadonlyMap<string, { x: number; y: number }>;
}

function buildCenters(
  design: ChipDesign,
  drag: DragVisual | null,
  coreX: number,
  coreY: number,
  tilePx: number,
): Centers {
  const map = new Map<string, { x: number; y: number }>();
  for (const block of design.blocks) {
    const effective = effectiveBlock(block, drag);
    map.set(block.uid, {
      x: coreX + (effective.x + effective.w / 2) * tilePx,
      y: coreY + (effective.y + effective.h / 2) * tilePx,
    });
  }
  return { map };
}

function drawTileOverlay(options: DrawFloorplanOptions): void {
  const { ctx, analysis, overlay, coreX, coreY, tilePx } = options;
  if (overlay !== "heat" && overlay !== "congestion") {
    return;
  }

  const { thermal, congestion } = analysis;
  const rise = thermal.hotspotC - thermal.ambientC;
  ctx.globalAlpha = 0.58;
  for (let y = 0; y < congestion.dieH; y += 1) {
    for (let x = 0; x < congestion.dieW; x += 1) {
      const index = y * congestion.dieW + x;
      if (overlay === "heat") {
        const temperature = thermal.temperaturesC[index] ?? thermal.ambientC;
        const ratio = rise > 0 ? (temperature - thermal.ambientC) / rise : 0;
        ctx.fillStyle = heatColor(ratio);
      } else {
        const demand = congestion.demand[index] ?? 0;
        const ratio =
          congestion.capacityPerTile > 0 ? demand / congestion.capacityPerTile : 0;
        ctx.fillStyle = congestionColor(ratio);
      }
      ctx.fillRect(coreX + x * tilePx, coreY + y * tilePx, tilePx, tilePx);
    }
  }
  ctx.globalAlpha = 1;
}

function drawStandardLinks(options: DrawFloorplanOptions, centers: Centers): void {
  const { ctx, links, overlay, tilePx } = options;
  const faint = overlay === "timing";
  ctx.globalAlpha = faint ? 0.24 : overlay === "heat" || overlay === "congestion" ? 0.6 : 1;
  for (const link of links) {
    const from = centers.map.get(link.fromUid);
    const to = centers.map.get(link.toUid);
    if (from === undefined || to === undefined) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, from.y);
    ctx.lineTo(to.x, to.y);
    if (link.timing === "critical") {
      ctx.strokeStyle = "#9b2f24";
      ctx.lineWidth = Math.max(1.5, tilePx * 0.05);
      ctx.setLineDash([]);
    } else if (link.timing === "normal") {
      ctx.strokeStyle = "#5d5341";
      ctx.lineWidth = Math.max(1, tilePx * 0.035);
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "#8a7a5a";
      ctx.lineWidth = Math.max(1, tilePx * 0.03);
      ctx.setLineDash([4, 4]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
}

function drawWireLinks(options: DrawFloorplanOptions, centers: Centers): void {
  const { ctx, links, analysis, tilePx } = options;
  const wireById = new Map(analysis.wires.map((wire) => [wire.linkId, wire]));
  let maxDelay = 0;
  for (const wire of analysis.wires) {
    maxDelay = Math.max(maxDelay, wire.delayPs);
  }

  for (const link of links) {
    const from = centers.map.get(link.fromUid);
    const to = centers.map.get(link.toUid);
    const wire = wireById.get(link.id);
    if (from === undefined || to === undefined || wire === undefined) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, from.y);
    ctx.lineTo(to.x, to.y);
    const relative = maxDelay > 0 ? wire.delayPs / maxDelay : 0;
    const base = Math.max(1.2, tilePx * 0.045) * (0.6 + 1.6 * relative);
    if (wire.pipelined) {
      ctx.strokeStyle = "#b06f16";
      ctx.lineWidth = Math.max(2, base);
      ctx.setLineDash([5, 4]);
    } else if (link.timing === "critical") {
      ctx.strokeStyle = "#9b2f24";
      ctx.lineWidth = Math.max(2, base);
      ctx.setLineDash([]);
    } else if (link.timing === "normal") {
      ctx.strokeStyle = "#5d5341";
      ctx.lineWidth = base;
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "#8a7a5a";
      ctx.lineWidth = base;
      ctx.setLineDash([4, 4]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawTimingLegs(options: DrawFloorplanOptions, centers: Centers): void {
  const path = options.analysis.timing.limitingPath;
  if (path === null) {
    return;
  }
  const { ctx, tilePx } = options;
  for (const leg of path.legs) {
    const from = centers.map.get(leg.fromUid);
    const to = centers.map.get(leg.toUid);
    if (from === undefined || to === undefined) {
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = leg.pipelined ? "#b06f16" : "#9b2f24";
    ctx.lineWidth = Math.max(2.5, tilePx * 0.11);
    ctx.setLineDash(leg.pipelined ? [6, 5] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawBlocks(options: DrawFloorplanOptions): void {
  const { ctx, design, drag, selectedUid, overlay, tilePx, coreX, coreY } = options;
  const limiting = new Set(
    options.analysis.timing.limitingPath?.stages.map((stage) => stage.uid) ?? [],
  );
  const shading = overlay === "heat" || overlay === "congestion";

  for (const block of design.blocks) {
    const effective = effectiveBlock(block, drag);
    const blockType = data.blockById[block.typeId];
    const style =
      blockType === undefined
        ? DEFAULT_STYLE
        : (CATEGORY_STYLES[blockType.category] ?? DEFAULT_STYLE);
    const x = coreX + effective.x * tilePx;
    const y = coreY + effective.y * tilePx;
    const w = effective.w * tilePx;
    const h = effective.h * tilePx;

    let alpha = shading ? 0.58 : 1;
    if (overlay === "timing" && limiting.size > 0 && !limiting.has(block.uid)) {
      alpha = 0.72;
    }
    ctx.globalAlpha = drag?.uid === block.uid ? alpha * 0.8 : alpha;
    ctx.fillStyle = style.fill;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle =
      drag?.uid === block.uid ? (drag.valid ? "#356b46" : "#9b2f24") : "#2b2418";
    ctx.lineWidth = block.uid === selectedUid ? Math.max(2, tilePx * 0.08) : 1.2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (block.uid === selectedUid) {
      ctx.strokeStyle = "#e0a13c";
      ctx.lineWidth = Math.max(2, tilePx * 0.1);
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
    }

    const label = blockType?.name ?? block.typeId;
    ctx.fillStyle = style.text;
    ctx.font = `600 ${String(Math.max(8, Math.min(12, tilePx * 0.3)))}px "SFMono-Regular", Consolas, monospace`;
    ctx.textBaseline = "top";
    ctx.fillText(label, x + 4, y + 4, Math.max(1, w - 8));

    if (block.locked) {
      ctx.fillStyle = "#2b2418";
      ctx.fillRect(x + w - 12, y + 4, 8, 8);
      ctx.fillStyle = "#faf6ea";
      ctx.font = '700 7px "SFMono-Regular", Consolas, monospace';
      ctx.fillText("L", x + w - 10, y + 4);
    }
    ctx.globalAlpha = 1;
  }
}

function drawTimingOutlines(options: DrawFloorplanOptions): void {
  const path = options.analysis.timing.limitingPath;
  if (path === null || options.overlay !== "timing") {
    return;
  }
  const { ctx, design, drag, coreX, coreY, tilePx } = options;
  for (const stage of path.stages) {
    const block = design.blocks.find((candidate) => candidate.uid === stage.uid);
    if (block === undefined) {
      continue;
    }
    const effective = effectiveBlock(block, drag);
    const x = coreX + effective.x * tilePx;
    const y = coreY + effective.y * tilePx;
    const w = effective.w * tilePx;
    const h = effective.h * tilePx;
    ctx.strokeStyle = "#e0a13c";
    ctx.lineWidth = Math.max(2, tilePx * 0.09);
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
  }
}

function drawHotspot(options: DrawFloorplanOptions): void {
  if (options.overlay !== "heat") {
    return;
  }
  const { ctx, analysis, coreX, coreY, tilePx } = options;
  const tile = analysis.thermal.hotspotTile;
  ctx.strokeStyle = "#fffdf6";
  ctx.lineWidth = 2;
  ctx.strokeRect(
    coreX + tile.x * tilePx + 1,
    coreY + tile.y * tilePx + 1,
    tilePx - 2,
    tilePx - 2,
  );
}

function drawPlacementPreview(options: DrawFloorplanOptions): void {
  const { ctx, hoverPlacement, hoverValid, coreX, coreY, tilePx } = options;
  if (hoverPlacement === null) {
    return;
  }
  const x = coreX + hoverPlacement.x * tilePx + 1;
  const y = coreY + hoverPlacement.y * tilePx + 1;
  const w = hoverPlacement.w * tilePx - 2;
  const h = hoverPlacement.h * tilePx - 2;
  ctx.fillStyle = hoverValid ? "rgba(53, 107, 70, 0.28)" : "rgba(155, 47, 36, 0.24)";
  ctx.strokeStyle = hoverValid ? "#356b46" : "#9b2f24";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
}

export function drawFloorplan(options: DrawFloorplanOptions): void {
  const { ctx, design, dpr, canvasW, canvasH, coreX, coreY, coreW, coreH, tilePx, padPx } =
    options;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvasW, canvasH);

  ctx.fillStyle = "#cbbb95";
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = "#fbf7ec";
  ctx.fillRect(coreX, coreY, coreW, coreH);

  ctx.strokeStyle = "rgba(58, 50, 35, 0.16)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= design.dieW; x += 1) {
    ctx.beginPath();
    ctx.moveTo(coreX + x * tilePx + 0.5, coreY);
    ctx.lineTo(coreX + x * tilePx + 0.5, coreY + coreH);
    ctx.stroke();
  }
  for (let y = 0; y <= design.dieH; y += 1) {
    ctx.beginPath();
    ctx.moveTo(coreX, coreY + y * tilePx + 0.5);
    ctx.lineTo(coreX + coreW, coreY + y * tilePx + 0.5);
    ctx.stroke();
  }

  drawPadRing(ctx, options.padCount, coreX, coreY, coreW, coreH, padPx);
  drawTileOverlay(options);

  const centers = buildCenters(design, options.drag, coreX, coreY, tilePx);
  if (options.overlay === "wires") {
    drawWireLinks(options, centers);
  } else {
    drawStandardLinks(options, centers);
    if (options.overlay === "timing") {
      drawTimingLegs(options, centers);
    }
  }

  drawBlocks(options);
  drawRegionOverlays(options);
  drawTimingOutlines(options);
  drawHotspot(options);
  drawPlacementPreview(options);
}
