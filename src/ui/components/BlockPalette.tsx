import type { BlockType, ProcessNode } from "../../data/schemas";
import {
  blockConfigDefaults,
  defaultAspectRatio,
  footprint,
} from "../../sim/design/blocks";

export interface BlockPaletteProps {
  blocks: readonly BlockType[];
  node: ProcessNode;
  pendingTypeId: string | null;
  onChoose: (blockTypeId: string | null) => void;
  onConfigurePending: () => void;
}

export function BlockPalette({
  blocks,
  node,
  pendingTypeId,
  onChoose,
  onConfigurePending,
}: BlockPaletteProps) {
  return (
    <section className="panel palette-panel">
      <h2>Block palette</h2>
      <p className="palette-hint">
        Click a block, then click the grid to place it. Edge-only blocks must touch the die edge.
      </p>
      <div className="palette-list">
        {blocks.map((block) => {
          const stats = footprint(
            block,
            blockConfigDefaults(block),
            node,
            defaultAspectRatio(),
          );
          const active = pendingTypeId === block.id;
          return (
            <button
              key={block.id}
              type="button"
              className={`palette-item${active ? " is-active" : ""}`}
              title={block.description}
              onClick={() => {
                onChoose(active ? null : block.id);
              }}
            >
              <span className="palette-name">{block.name}</span>
              <span className="palette-meta">
                {String(stats.w)}×{String(stats.h)} · {Math.round(stats.transistors).toLocaleString()} tr
                {block.edgeOnly === true ? " · edge" : ""}
              </span>
            </button>
          );
        })}
      </div>
      {pendingTypeId !== null && (
        <div className="button-row palette-pending-actions">
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={onConfigurePending}
          >
            Configure…
          </button>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => onChoose(null)}
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
