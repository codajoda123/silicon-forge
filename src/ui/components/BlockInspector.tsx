import { getGameData } from "../../data/gameData";
import type { ProcessNode } from "../../data/schemas";
import { aspectRatioOptions, footprint } from "../../sim/design/blocks";
import type { DesignCommand } from "../../sim/design/commands";
import type { PlacedBlock } from "../../sim/design/types";

const data = getGameData();

export interface BlockInspectorProps {
  block: PlacedBlock | undefined;
  node: ProcessNode;
  regionPaintUid: string | null;
  onEdit: (command: DesignCommand) => boolean;
  onConfigure: (uid: string) => void;
  onPaintRegion: (uid: string) => void;
  onCancelRegionPaint: () => void;
}

export function BlockInspector({
  block,
  node,
  regionPaintUid,
  onEdit,
  onConfigure,
  onPaintRegion,
  onCancelRegionPaint,
}: BlockInspectorProps) {
  if (block === undefined) {
    return (
      <section className="panel inspector-panel">
        <h2>Selection</h2>
        <p className="muted">Select a block on the grid to move, rotate, lock or configure it.</p>
        <p className="muted">Drag a block to move it. Double-click to open its configuration.</p>
      </section>
    );
  }

  const blockType = data.blockById[block.typeId];
  if (blockType === undefined) {
    return (
      <section className="panel inspector-panel">
        <h2>Selection</h2>
        <p className="muted">This block type is missing from the data bundle.</p>
      </section>
    );
  }
  const stats = footprint(blockType, block.config, node, block.w / block.h);

  return (
    <section className="panel inspector-panel">
      <h2>Selected block</h2>
      <dl className="inspector-stats">
        <div>
          <dt>Type</dt>
          <dd>{blockType.name}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>
            {String(block.w)}×{String(block.h)} tiles
          </dd>
        </div>
        <div>
          <dt>Transistors</dt>
          <dd>{Math.round(stats.transistors).toLocaleString()}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{block.locked ? "Locked" : "Editable"}</dd>
        </div>
      </dl>

      <div className="inspector-aspects">
        <span className="field-label">Aspect</span>
        <div className="button-row">
          {aspectRatioOptions().map((option) => (
            <button
              key={option.label}
              type="button"
              className="secondary-button compact-button"
              disabled={block.locked}
              onClick={() => {
                onEdit({ type: "setBlockAspect", uid: block.uid, aspectRatio: option.ratio });
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="inspector-region">
        <span className="field-label">Auto-place region</span>
        <div className="inspector-region-row">
          <span className="mono">
            {block.region === undefined
              ? "Whole die"
              : `${String(block.region.x)},${String(block.region.y)} · ${String(block.region.w)}×${String(block.region.h)}`}
          </span>
          <span className="inspector-region-actions">
            <button
              type="button"
              className={`secondary-button compact-button${regionPaintUid === block.uid ? " is-active" : ""}`}
              onClick={() => {
                if (regionPaintUid === block.uid) {
                  onCancelRegionPaint();
                } else {
                  onPaintRegion(block.uid);
                }
              }}
            >
              {regionPaintUid === block.uid ? "Cancel paint" : "Paint region"}
            </button>
            {block.region !== undefined && (
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => {
                  onEdit({ type: "setBlockRegion", uid: block.uid, region: null });
                }}
              >
                Clear
              </button>
            )}
          </span>
        </div>
        <p className="inspector-region-hint">
          Drag a rectangle on the grid; the block must fit inside it. Auto-place and manual moves
          respect the region.
        </p>
      </div>

      <div className="button-row inspector-actions">
        <button
          type="button"
          className="secondary-button compact-button"
          disabled={block.locked}
          onClick={() => {
            onEdit({ type: "rotateBlock", uid: block.uid });
          }}
        >
          Rotate
        </button>
        <button
          type="button"
          className="secondary-button compact-button"
          onClick={() => {
            onEdit({ type: "setBlockLocked", uid: block.uid, locked: !block.locked });
          }}
        >
          {block.locked ? "Unlock" : "Lock"}
        </button>
        <button
          type="button"
          className="secondary-button compact-button"
          disabled={block.locked}
          onClick={() => {
            onConfigure(block.uid);
          }}
        >
          Configure
        </button>
        <button
          type="button"
          className="danger-button compact-button"
          disabled={block.locked}
          onClick={() => {
            onEdit({ type: "deleteBlock", uid: block.uid });
          }}
        >
          Delete
        </button>
      </div>
    </section>
  );
}
