import { getGameData } from "../../data/gameData";
import type { ConfigValue, ProcessNode } from "../../data/schemas";
import type { PhysicalAnalysis } from "../../sim/design/physical";
import type { BlockRegion, ChipDesign, DesignLink } from "../../sim/design/types";
import { OVERLAY_OPTIONS, type OverlayMode } from "./canvas/colors";
import { FloorplanCanvas } from "./FloorplanCanvas";

const data = getGameData();

export interface DesignCanvasPanelProps {
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
  onOverlayChange: (overlay: OverlayMode) => void;
  onSelect: (uid: string | null) => void;
  onPlace: (x: number, y: number) => void;
  onMove: (uid: string, x: number, y: number) => void;
  onConfigure: (uid: string) => void;
  onRegionPainted: (uid: string, region: BlockRegion) => void;
}

function CanvasLegend({ overlay }: { overlay: OverlayMode }) {
  if (overlay === "heat") {
    return (
      <div className="canvas-legend">
        <span className="legend-item legend-scale-label">
          <span className="legend-scale legend-scale-heat" aria-hidden="true" />
          cool → hot
        </span>
        <span className="legend-item legend-hotspot">Hotspot tile</span>
      </div>
    );
  }
  if (overlay === "wires") {
    return (
      <div className="canvas-legend">
        <span className="legend-item legend-wire-thin">Short wire</span>
        <span className="legend-item legend-wire-thick">Long wire</span>
        <span className="legend-item legend-pipelined">Pipelined</span>
      </div>
    );
  }
  if (overlay === "congestion") {
    return (
      <div className="canvas-legend">
        <span className="legend-item legend-scale-label">
          <span className="legend-scale legend-scale-congestion" aria-hidden="true" />
          low → over capacity
        </span>
      </div>
    );
  }
  if (overlay === "timing") {
    return (
      <div className="canvas-legend">
        <span className="legend-item legend-critical">Limiting path</span>
        <span className="legend-item legend-stage">Path stage</span>
        <span className="legend-item legend-pipelined">Pipelined leg</span>
      </div>
    );
  }
  return (
    <div className="canvas-legend">
      <span className="legend-item legend-critical">Critical link</span>
      <span className="legend-item legend-normal">Normal link</span>
      <span className="legend-item legend-relaxed">Relaxed link</span>
      <span className="legend-item legend-pad">Pad ring</span>
      <span className="legend-item legend-region">Auto-place region</span>
    </div>
  );
}

export function DesignCanvasPanel({
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
  onOverlayChange,
  onSelect,
  onPlace,
  onMove,
  onConfigure,
  onRegionPainted,
}: DesignCanvasPanelProps) {
  return (
    <div className="panel canvas-panel">
      <div className="canvas-heading">
        <span>
          <strong>{design.name}</strong> · {node.name} · {String(design.dieW)}×
          {String(design.dieH)} tiles
        </span>
        <span className="mono">
          {regionPaintUid !== null
            ? "Drag a rectangle to constrain the selected block"
            : pendingTypeId === null
              ? "Drag to move · double-click to configure"
              : `Placing ${data.blockById[pendingTypeId]?.name ?? pendingTypeId} · click the grid`}
        </span>
      </div>

      <div className="canvas-overlay-bar" role="group" aria-label="Floorplan overlay">
        {OVERLAY_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`overlay-button${overlay === option.id ? " is-active" : ""}`}
            aria-pressed={overlay === option.id}
            onClick={() => {
              onOverlayChange(option.id);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      <FloorplanCanvas
        design={design}
        node={node}
        links={links}
        analysis={analysis}
        overlay={overlay}
        selectedUid={selectedUid}
        pendingTypeId={pendingTypeId}
        pendingConfig={pendingConfig}
        pendingAspectRatio={pendingAspectRatio}
        regionPaintUid={regionPaintUid}
        onSelect={onSelect}
        onPlace={onPlace}
        onMove={onMove}
        onConfigure={onConfigure}
        onRegionPainted={onRegionPainted}
      />

      <CanvasLegend overlay={overlay} />
    </div>
  );
}
