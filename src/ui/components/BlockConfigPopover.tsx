import { useState, type FormEvent } from "react";

import type { BlockType, ConfigValue, ProcessNode } from "../../data/schemas";
import {
  aspectRatioOptions,
  blockConfigDefaults,
  defaultAspectRatio,
  footprint,
  normalizeBlockConfig,
} from "../../sim/design/blocks";
import type { PlacedBlock } from "../../sim/design/types";

export interface BlockConfigPopoverProps {
  /** Undefined while configuring a not-yet-placed block from the palette. */
  block: PlacedBlock | undefined;
  blockType: BlockType;
  node: ProcessNode;
  initialAspectRatio?: number;
  onClose: () => void;
  onApply: (config: Record<string, ConfigValue>, aspectRatio: number | null) => boolean;
}

export function BlockConfigPopover({
  block,
  blockType,
  node,
  initialAspectRatio,
  onClose,
  onApply,
}: BlockConfigPopoverProps) {
  const [draft, setDraft] = useState<Record<string, ConfigValue>>(() => ({
    ...(block?.config ?? blockConfigDefaults(blockType)),
  }));
  const [aspectRatio, setAspectRatio] = useState<number | null>(() => {
    if (block !== undefined) {
      return null;
    }
    return initialAspectRatio ?? defaultAspectRatio();
  });
  const previewAspect =
    aspectRatio ?? (block === undefined ? defaultAspectRatio() : block.w / block.h);
  const normalized = normalizeBlockConfig(blockType, draft);
  const preview =
    normalized.error === null
      ? footprint(blockType, normalized.config, node, previewAspect)
      : null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (normalized.error !== null) {
      return;
    }
    if (onApply(normalized.config, aspectRatio)) {
      onClose();
    }
  };

  return (
    <div className="block-popover-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="block-popover"
        role="dialog"
        aria-modal="true"
        aria-label={`Configure ${blockType.name}`}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="block-popover-header">
          <div>
            <h2>{blockType.name}</h2>
            <p className="muted mono">{block?.uid ?? "new block · not placed yet"}</p>
          </div>
          <button type="button" className="secondary-button compact-button" onClick={onClose}>
            Close
          </button>
        </header>

        <form onSubmit={submit}>
          {Object.entries(blockType.configSchema).map(([name, option]) => {
            const value = draft[name] ?? option.default;
            if (option.kind === "enum") {
              return (
                <label key={name} className="field config-field">
                  <span>{option.label}</span>
                  <select
                    value={String(value)}
                    onChange={(event) => {
                      const selected = option.values.find(
                        (candidate) => String(candidate) === event.target.value,
                      );
                      if (selected !== undefined) {
                        setDraft({ ...draft, [name]: selected });
                      }
                    }}
                  >
                    {option.values.map((candidate) => (
                      <option key={String(candidate)} value={String(candidate)}>
                        {String(candidate)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            if (option.kind === "integer") {
              return (
                <label key={name} className="field config-field">
                  <span>{option.label}</span>
                  <input
                    type="number"
                    min={option.min}
                    max={option.max}
                    step={1}
                    value={typeof value === "number" ? value : option.default}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      setDraft({
                        ...draft,
                        [name]: Number.isNaN(parsed) ? option.default : parsed,
                      });
                    }}
                  />
                  <small>
                    {option.min}–{option.max}
                  </small>
                </label>
              );
            }
            return (
              <label key={name} className="field config-field config-checkbox">
                <span>{option.label}</span>
                <input
                  type="checkbox"
                  checked={value === true}
                  onChange={(event) => {
                    setDraft({ ...draft, [name]: event.target.checked });
                  }}
                />
              </label>
            );
          })}

          <div className="config-aspects">
            <span className="field-label">Footprint shape</span>
            <div className="button-row">
              {aspectRatioOptions().map((option) => {
                const active = option.ratio === aspectRatio;
                return (
                  <button
                    key={option.label}
                    type="button"
                    className={`secondary-button compact-button${active ? " is-selected" : ""}`}
                    aria-pressed={active}
                    onClick={() => {
                      setAspectRatio(option.ratio);
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="config-preview">
            {preview === null ? (
              <span className="validation-message">{normalized.error}</span>
            ) : (
              <span className="mono">
                {Math.round(preview.transistors).toLocaleString()} transistors ·{" "}
                {String(preview.tileCount)} tile budget ·{" "}
                {String(preview.w)}×{String(preview.h)} footprint
              </span>
            )}
          </div>

          <div className="button-row form-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={normalized.error !== null}>
              Apply config
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
