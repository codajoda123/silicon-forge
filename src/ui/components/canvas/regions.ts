import type { DrawFloorplanOptions } from "./draw";

/**
 * M4 overlay: per-block auto-place regions are dashed outlines; the rectangle
 * being painted is a translucent amber preview.
 */
export function drawRegionOverlays(options: DrawFloorplanOptions): void {
  const { ctx, design, coreX, coreY, tilePx, regionDrag } = options;

  ctx.save();
  ctx.strokeStyle = "#b06f16";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  for (const block of design.blocks) {
    const region = block.region;
    if (region === undefined) {
      continue;
    }
    ctx.strokeRect(
      coreX + region.x * tilePx + 1.5,
      coreY + region.y * tilePx + 1.5,
      region.w * tilePx - 3,
      region.h * tilePx - 3,
    );
  }
  ctx.setLineDash([]);

  if (regionDrag !== null) {
    ctx.fillStyle = "rgba(176, 111, 22, 0.16)";
    ctx.strokeStyle = "#b06f16";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.fillRect(
      coreX + regionDrag.x * tilePx + 1,
      coreY + regionDrag.y * tilePx + 1,
      regionDrag.w * tilePx - 2,
      regionDrag.h * tilePx - 2,
    );
    ctx.strokeRect(
      coreX + regionDrag.x * tilePx + 1,
      coreY + regionDrag.y * tilePx + 1,
      regionDrag.w * tilePx - 2,
      regionDrag.h * tilePx - 2,
    );
    ctx.setLineDash([]);
  }
  ctx.restore();
}
