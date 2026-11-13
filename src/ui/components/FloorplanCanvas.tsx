import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { getGameData, getTuning } from "../../data/gameData";
import type { ConfigValue, ProcessNode } from "../../data/schemas";
import type { PhysicalAnalysis } from "../../sim/design/physical";
import {
  blockConfigDefaults,
  defaultAspectRatio,
  footprint,
} from "../../sim/design/blocks";
import { findBlockAt, validatePlacement } from "../../sim/design/floorplan";
import type { BlockRegion, ChipDesign, DesignLink } from "../../sim/design/types";
import { drawFloorplan } from "./canvas/draw";
import type { OverlayMode } from "./canvas/colors";

const data = getGameData();
const tuning = getTuning();

const PAD_RING_TILES = 0.7;
const MAX_CANVAS_W = 760;
const MAX_CANVAS_H = 560;
const MIN_TILE_PX = 10;

interface DragState {
  uid: string;
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
  valid: boolean;
}

export interface FloorplanCanvasProps {
  design: ChipDesign;
  node: ProcessNode;
  links: readonly DesignLink[];
  analysis: PhysicalAnalysis;
  overlay: OverlayMode;
  selectedUid: string | null;
  pendingTypeId: string | null;
  pendingConfig: Readonly<Record<string, ConfigValue>> | null;
  pendingAspectRatio: number | null;
  regionPaintUid: string | null;
  onSelect: (uid: string | null) => void;
  onPlace: (x: number, y: number) => void;
  onMove: (uid: string, x: number, y: number) => void;
  onConfigure: (uid: string) => void;
  onRegionPainted: (uid: string, region: BlockRegion) => void;
}

interface TilePoint {
  x: number;
  y: number;
}

export function FloorplanCanvas({
  design,
  node,
  links,
  analysis,
  overlay,
  selectedUid,
  pendingTypeId,
  pendingConfig,
  pendingAspectRatio,
  regionPaintUid,
  onSelect,
  onPlace,
  onMove,
  onConfigure,
  onRegionPainted,
}: FloorplanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<TilePoint | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [regionStart, setRegionStart] = useState<TilePoint | null>(null);
  const [regionEnd, setRegionEnd] = useState<TilePoint | null>(null);

  const outerTiles = PAD_RING_TILES * 2;
  const tilePx = Math.max(
    MIN_TILE_PX,
    Math.floor(
      Math.min(
        MAX_CANVAS_W / (design.dieW + outerTiles),
        MAX_CANVAS_H / (design.dieH + outerTiles),
      ),
    ),
  );
  const padPx = Math.max(4, Math.round(PAD_RING_TILES * tilePx));
  const coreX = padPx;
  const coreY = padPx;
  const coreW = design.dieW * tilePx;
  const coreH = design.dieH * tilePx;
  const canvasW = coreW + padPx * 2;
  const canvasH = coreH + padPx * 2;
  const dpr = typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);

  const pendingType = pendingTypeId === null ? undefined : data.blockById[pendingTypeId];
  const pendingFootprint =
    pendingType === undefined
      ? null
      : footprint(
          pendingType,
          pendingConfig ?? blockConfigDefaults(pendingType),
          node,
          pendingAspectRatio ?? defaultAspectRatio(),
        );

  const regionDrag: BlockRegion | null =
    regionStart === null || regionEnd === null
      ? null
      : {
          x: Math.min(regionStart.x, regionEnd.x),
          y: Math.min(regionStart.y, regionEnd.y),
          w: Math.abs(regionStart.x - regionEnd.x) + 1,
          h: Math.abs(regionStart.y - regionEnd.y) + 1,
        };

  useEffect(() => {
    setRegionStart(null);
    setRegionEnd(null);
  }, [regionPaintUid]);

  const hoverPlacement =
    hover === null || pendingType === undefined || pendingFootprint === null
      ? null
      : {
          x: hover.x,
          y: hover.y,
          w: pendingFootprint.w,
          h: pendingFootprint.h,
        };
  const hoverValid =
    hoverPlacement === null || pendingType === undefined
      ? false
      : validatePlacement(design, hoverPlacement, pendingType.edgeOnly === true) === null;

  const padCount =
    design.blocks.filter((block) => block.typeId === "io-pads").length === 0
      ? tuning.design.powerGroundPins
      : Math.min(
          64,
          design.blocks
            .filter((block) => block.typeId === "io-pads")
            .reduce((sum, block) => {
              const raw =
                (typeof block.config.dataPins === "number" ? block.config.dataPins : 0) +
                (typeof block.config.addressPins === "number" ? block.config.addressPins : 0) +
                (typeof block.config.controlPins === "number" ? block.config.controlPins : 0);
              return sum + raw;
            }, tuning.design.powerGroundPins),
        );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas === null || canvas === undefined || ctx === null || ctx === undefined) {
      return;
    }
    drawFloorplan({
      ctx,
      design,
      links,
      analysis,
      overlay,
      selectedUid,
      drag,
      regionDrag,
      hoverPlacement,
      hoverValid,
      dpr,
      canvasW,
      canvasH,
      coreX,
      coreY,
      coreW,
      coreH,
      tilePx,
      padPx,
      padCount,
    });
  }, [
    analysis,
    canvasH,
    canvasW,
    coreH,
    coreW,
    coreX,
    coreY,
    design,
    drag,
    dpr,
    hoverPlacement,
    regionDrag,
    hoverValid,
    links,
    overlay,
    padCount,
    selectedUid,
    tilePx,
  ]);

  function tileFromEvent(event: ReactPointerEvent<HTMLCanvasElement>): TilePoint | null {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const px = ((event.clientX - rect.left) / rect.width) * canvasW;
    const py = ((event.clientY - rect.top) / rect.height) * canvasH;
    const x = Math.floor((px - coreX) / tilePx);
    const y = Math.floor((py - coreY) / tilePx);
    if (x < 0 || y < 0 || x >= design.dieW || y >= design.dieH) {
      return null;
    }
    return { x, y };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (event.button !== 0) {
      return;
    }
    const tile = tileFromEvent(event);
    if (tile === null) {
      onSelect(null);
      return;
    }

    if (regionPaintUid !== null) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setRegionStart(tile);
      setRegionEnd(tile);
      return;
    }

    if (pendingTypeId !== null) {
      onPlace(tile.x, tile.y);
      return;
    }

    const block = findBlockAt(design, tile.x, tile.y);
    if (block === undefined) {
      onSelect(null);
      return;
    }
    onSelect(block.uid);
    if (block.locked) {
      setDrag(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      uid: block.uid,
      offsetX: tile.x - block.x,
      offsetY: tile.y - block.y,
      x: block.x,
      y: block.y,
      valid: true,
    });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const tile = tileFromEvent(event);
    setHover(tile);
    if (regionPaintUid !== null) {
      if (tile !== null) {
        setRegionEnd(tile);
      }
      return;
    }
    if (drag === null || tile === null) {
      return;
    }
    const block = design.blocks.find((candidate) => candidate.uid === drag.uid);
    if (block === undefined) {
      return;
    }
    const x = tile.x - drag.offsetX;
    const y = tile.y - drag.offsetY;
    const blockType = data.blockById[block.typeId];
    const valid =
      validatePlacement(
        design,
        { x, y, w: block.w, h: block.h },
        blockType?.edgeOnly === true,
        block.uid,
        block.region,
      ) === null;
    setDrag({ ...drag, x, y, valid });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (regionPaintUid !== null) {
      if (regionDrag !== null) {
        onRegionPainted(regionPaintUid, regionDrag);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setRegionStart(null);
      setRegionEnd(null);
      return;
    }
    if (drag === null) {
      return;
    }
    const block = design.blocks.find((candidate) => candidate.uid === drag.uid);
    if (block !== undefined && drag.valid && (drag.x !== block.x || drag.y !== block.y)) {
      onMove(drag.uid, drag.x, drag.y);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDrag(null);
  }

  function handleDoubleClick(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (regionPaintUid !== null) {
      return;
    }
    const tile = tileFromEvent(event);
    if (tile === null) {
      return;
    }
    const block = findBlockAt(design, tile.x, tile.y);
    if (block !== undefined) {
      onSelect(block.uid);
      if (!block.locked) {
        onConfigure(block.uid);
      }
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className={`floorplan-canvas${pendingTypeId !== null ? " is-placing" : ""}${regionPaintUid !== null ? " is-painting" : ""}`}
      width={Math.round(canvasW * dpr)}
      height={Math.round(canvasH * dpr)}
      aria-label={`Floorplan grid, ${String(design.dieW)} by ${String(design.dieH)} tiles`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        setHover(null);
      }}
      onDoubleClick={handleDoubleClick}
    />
  );
}
