import { useEffect, useState, type FormEvent } from "react";

import { getTuning } from "../../data/gameData";
import type { ChipPackage, ProcessNode } from "../../data/schemas";
import type { DesignCommand } from "../../sim/design/commands";
import type { ChipDesign } from "../../sim/design/types";

const tuning = getTuning();

export interface DesignToolbarProps {
  design: ChipDesign;
  nodes: readonly ProcessNode[];
  packages: readonly ChipPackage[];
  canUndo: boolean;
  canRedo: boolean;
  onEdit: (command: DesignCommand) => boolean;
  onUndo: () => boolean;
  onRedo: () => boolean;
}

export function DesignToolbar({
  design,
  nodes,
  packages,
  canUndo,
  canRedo,
  onEdit,
  onUndo,
  onRedo,
}: DesignToolbarProps) {
  const [name, setName] = useState(design.name);
  const [dieW, setDieW] = useState(String(design.dieW));
  const [dieH, setDieH] = useState(String(design.dieH));

  useEffect(() => {
    setName(design.name);
    setDieW(String(design.dieW));
    setDieH(String(design.dieH));
  }, [design.id, design.name, design.dieW, design.dieH]);

  const parsedW = Number(dieW);
  const parsedH = Number(dieH);
  const dieValid =
    Number.isInteger(parsedW) &&
    Number.isInteger(parsedH) &&
    parsedW >= tuning.design.minDieWidth &&
    parsedW <= tuning.design.maxDieWidth &&
    parsedH >= tuning.design.minDieHeight &&
    parsedH <= tuning.design.maxDieHeight;

  const rename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onEdit({ type: "renameDesign", name });
  };

  const resize = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dieValid) {
      onEdit({ type: "resizeDie", dieW: parsedW, dieH: parsedH });
    }
  };

  return (
    <div className="panel designer-toolbar">
      <div className="designer-toolbar-main">
        <form className="designer-name-form" onSubmit={rename}>
          <span className="field-label">Project</span>
          <input
            type="text"
            value={name}
            maxLength={tuning.design.nameMaxLength}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="secondary-button compact-button">
            Rename
          </button>
        </form>

        <div className="designer-history">
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Redo (Ctrl+Shift+Z / Ctrl+Y)"
          >
            Redo
          </button>
          <span className="muted mono">
            {String(design.blocks.length)} block{design.blocks.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="designer-toolbar-fields">
        <label className="field field-compact">
          <span>Process node</span>
          <select
            value={design.nodeId}
            onChange={(event) => {
              onEdit({ type: "setNode", nodeId: event.target.value });
            }}
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name} · {node.historicalYear}
              </option>
            ))}
          </select>
        </label>

        <label className="field field-compact">
          <span>Package</span>
          <select
            value={design.packageId}
            onChange={(event) => {
              onEdit({ type: "setPackage", packageId: event.target.value });
            }}
          >
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} · {pkg.maxPins} pins
              </option>
            ))}
          </select>
        </label>

        <form className="designer-die-form" onSubmit={resize}>
          <span className="field-label">Die size</span>
          <input
            type="number"
            aria-label="Die width in tiles"
            min={tuning.design.minDieWidth}
            max={tuning.design.maxDieWidth}
            step={1}
            value={dieW}
            onChange={(event) => setDieW(event.target.value)}
          />
          <span className="muted">×</span>
          <input
            type="number"
            aria-label="Die height in tiles"
            min={tuning.design.minDieHeight}
            max={tuning.design.maxDieHeight}
            step={1}
            value={dieH}
            onChange={(event) => setDieH(event.target.value)}
          />
          <button
            type="submit"
            className="secondary-button compact-button"
            disabled={!dieValid}
            title="Shrinking the die shifts edge-only blocks inward when there is room."
          >
            Apply
          </button>
        </form>
      </div>
    </div>
  );
}
