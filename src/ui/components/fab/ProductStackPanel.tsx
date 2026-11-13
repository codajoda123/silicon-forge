import { useEffect, useState } from "react";

import { getGameData, getTuning } from "../../../data/gameData";
import type { GameState } from "../../../sim/core/state";
import type { ManufacturingCommand } from "../../../sim/fab/commands";
import { analyzeManufacturing } from "../../../sim/fab/analysis";
import type { ChipDesign } from "../../../sim/design/types";
import type { Product, Sku } from "../../../sim/fab/types";
import { formatInteger, formatMoney } from "../../format";

const data = getGameData();
const tuning = getTuning();
const SUGGESTED_MARKER = "suggested";

function parseNumber(value: string): number {
  return value.trim() === "" ? 0 : Number(value);
}

function parseOptionalNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function nextSkuId(design: ChipDesign, skus: readonly Sku[]): string {
  const ids = new Set(skus.map((sku) => sku.id));
  let index = 1;
  while (ids.has(`${SUGGESTED_MARKER}-${design.id}-${String(index)}`)) {
    index += 1;
  }
  return `${SUGGESTED_MARKER}-${design.id}-${String(index)}`;
}

export interface ProductStackPanelProps {
  state: GameState;
  design: ChipDesign;
  product: Product | undefined;
  onCommand: (command: ManufacturingCommand) => boolean;
}

/**
 * Section 11.4: a player-editable binning stack. Allocation targets are shown
 * as percentages; they deliberately down-bin dies that could sell for more.
 */
export function ProductStackPanel({
  state,
  design,
  product,
  onCommand,
}: ProductStackPanelProps) {
  const [draft, setDraft] = useState<Sku[]>(() => product?.skus ?? []);
  const analysis = analyzeManufacturing(design, data, tuning, {
    week: state.week,
    startYear: state.settings.startYear,
  });
  const blockTypes = [...new Set(design.blocks.map((block) => block.typeId))].sort();

  useEffect(() => {
    setDraft(product?.skus ?? []);
  }, [product?.id, product?.skus]);

  const updateSku = (index: number, patch: Partial<Sku>) => {
    setDraft((current) =>
      current.map((sku, skuIndex) => (skuIndex === index ? { ...sku, ...patch } : sku)),
    );
  };

  const removeSku = (index: number) => {
    setDraft((current) => current.filter((_, skuIndex) => skuIndex !== index));
  };

  const addSku = () => {
    const fallback = analysis.suggestedSkus.at(-1);
    const baseFrequency =
      analysis.suggestedSkus[0]?.minFreqMHz ?? analysis.dieFrequencyMHz;
    setDraft((current) => [
      ...current,
      {
        id: nextSkuId(design, current),
        name: `Bin ${String(current.length + 1)}`,
        minFreqMHz: fallback?.minFreqMHz ?? baseFrequency,
        requiredBlocks: [],
        disabledBlocks: [],
        maxPowerW: null,
        price: fallback?.price ?? 50,
        allocationTarget: null,
      },
    ]);
  };

  if (product === undefined) {
    return (
      <section className="panel product-stack-panel">
        <div className="panel-heading-row">
          <h2>Product stack</h2>
          <span className="status-pill status-draft">not created</span>
        </div>
        <p className="lead">
          {design.name} has no SKU stack yet. Auto-suggest builds frequency tiers
          {analysis.suggestedSkus.length > 0 ? " plus a salvage bin" : ""} from the current die.
        </p>
        <div className="button-row">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              onCommand({ type: "suggestProductStack", designId: design.id });
            }}
          >
            Suggest product stack
          </button>
          <button type="button" className="secondary-button" onClick={addSku}>
            Start from scratch
          </button>
        </div>
        {draft.length > 0 && (
          <p className="hint-line">
            {String(draft.length)} draft SKU{draft.length === 1 ? "" : "s"} ready. Apply the stack
            below to create the product.
          </p>
        )}
        {draft.length > 0 && (
          <SkuDraftEditor
            designId={design.id}
            draft={draft}
            blockTypes={blockTypes}
            onAdd={addSku}
            onRemove={removeSku}
            onUpdate={updateSku}
            onApply={() => {
              onCommand({ type: "setProductSkus", designId: design.id, skus: draft });
            }}
          />
        )}
      </section>
    );
  }

  return (
    <section className="panel product-stack-panel">
      <div className="panel-heading-row">
        <h2>Product stack · {design.name}</h2>
        <span className="muted">
          {formatInteger(product.skus.length)} SKUs
          {product.launchedWeek === null
            ? " · pre-launch"
            : ` · launched week ${String(product.launchedWeek)}`}
        </span>
      </div>
      <p className="lead">
        Dies route to the highest-priced qualifying SKU unless an allocation target deliberately
        down-bins them. Allocation targets cap a bin at that share of good dies; leave blank for no
        cap.
      </p>

      <SkuDraftEditor
        designId={design.id}
        draft={draft}
        blockTypes={blockTypes}
        onAdd={addSku}
        onRemove={removeSku}
        onUpdate={updateSku}
        onApply={() => {
          onCommand({ type: "setProductSkus", designId: design.id, skus: draft });
        }}
        onSuggest={() => {
          onCommand({ type: "suggestProductStack", designId: design.id });
        }}
      />

      {analysis.suggestedSkus.length > 0 && (
        <div className="sku-suggestion">
          <span className="field-label">Auto-suggest reference</span>
          <span>
            {analysis.suggestedSkus
              .map(
                (sku) =>
                  `${sku.name} ≥ ${sku.minFreqMHz.toFixed(1)} MHz · ${formatMoney(sku.price)}`,
              )
              .join("  ·  ")}
          </span>
        </div>
      )}
    </section>
  );
}

interface SkuDraftEditorProps {
  designId: string;
  draft: readonly Sku[];
  blockTypes: readonly string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<Sku>) => void;
  onApply: () => void;
  onSuggest?: () => void;
}

function SkuDraftEditor({
  designId,
  draft,
  blockTypes,
  onAdd,
  onRemove,
  onUpdate,
  onApply,
  onSuggest,
}: SkuDraftEditorProps) {
  return (
    <>
      <div className="sku-editor-list">
        {draft.map((sku, index) => (
          <fieldset key={`${designId}:${sku.id}`} className="sku-editor">
            <legend>{sku.name || sku.id}</legend>
            <div className="sku-grid">
              <label className="field field-compact">
                <span>Name</span>
                <input
                  value={sku.name}
                  onChange={(event) => onUpdate(index, { name: event.target.value })}
                />
              </label>
              <label className="field field-compact">
                <span>Min frequency (MHz)</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={sku.minFreqMHz}
                  onChange={(event) =>
                    onUpdate(index, { minFreqMHz: parseNumber(event.target.value) })
                  }
                />
              </label>
              <label className="field field-compact">
                <span>Price</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={sku.price}
                  onChange={(event) => onUpdate(index, { price: parseNumber(event.target.value) })}
                />
              </label>
              <label className="field field-compact">
                <span>Max power (W, blank = none)</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={sku.maxPowerW ?? ""}
                  onChange={(event) =>
                    onUpdate(index, { maxPowerW: parseOptionalNumber(event.target.value) })
                  }
                />
              </label>
              <label className="field field-compact">
                <span>Allocation cap (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={sku.allocationTarget === null ? "" : sku.allocationTarget * 100}
                  onChange={(event) => {
                    const value = parseOptionalNumber(event.target.value);
                    onUpdate(index, {
                      allocationTarget: value === null ? null : Math.min(1, value / 100),
                    });
                  }}
                />
              </label>
            </div>

            <div className="sku-multiselects">
              <label className="field field-compact">
                <span>Required blocks</span>
                <select
                  multiple
                  size={Math.min(5, Math.max(2, blockTypes.length))}
                  value={sku.requiredBlocks}
                  onChange={(event) => {
                    onUpdate(index, {
                      requiredBlocks: [...event.target.selectedOptions].map(
                        (option) => option.value,
                      ),
                    });
                  }}
                >
                  {blockTypes.map((typeId) => (
                    <option key={typeId} value={typeId}>
                      {data.blockById[typeId]?.name ?? typeId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field-compact">
                <span>Disabled blocks (salvage)</span>
                <select
                  multiple
                  size={Math.min(5, Math.max(2, blockTypes.length))}
                  value={sku.disabledBlocks}
                  onChange={(event) => {
                    onUpdate(index, {
                      disabledBlocks: [...event.target.selectedOptions].map(
                        (option) => option.value,
                      ),
                    });
                  }}
                >
                  {blockTypes.map((typeId) => (
                    <option key={typeId} value={typeId}>
                      {data.blockById[typeId]?.name ?? typeId}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="sku-editor-footer">
              <span className="mono">id: {sku.id}</span>
              <button type="button" className="secondary-button compact-button" onClick={() => onRemove(index)}>
                Remove
              </button>
            </div>
          </fieldset>
        ))}
      </div>

      <div className="button-row sku-actions">
        <button type="button" className="secondary-button" onClick={onAdd}>
          Add SKU
        </button>
        {onSuggest !== undefined && (
          <button type="button" className="secondary-button" onClick={onSuggest}>
            Replace with suggested stack
          </button>
        )}
        <button type="button" className="primary-button" onClick={onApply} disabled={draft.length === 0}>
          Apply stack
        </button>
      </div>
      <p className="muted sku-warning">
        Validation requires a SKU id other than "scrap"; required and disabled blocks may not
        overlap. Changes apply only when you press Apply stack.
      </p>
    </>
  );
}