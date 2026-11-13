import { getGameData } from "../../data/gameData";
import { useGameStore } from "../../store/gameStore";
import { getActiveDesign } from "../../sim/core/state";
import type { ManufacturingCommand } from "../../sim/fab/commands";
import { productForDesign } from "../../sim/fab/state";
import { FabContractsPanel } from "../components/fab/FabContractsPanel";
import { InventoryPanel } from "../components/fab/InventoryPanel";
import { ManufacturingStatsPanel } from "../components/fab/ManufacturingStatsPanel";
import { ProductStackPanel } from "../components/fab/ProductStackPanel";
import { WaferStartPanel } from "../components/fab/WaferStartPanel";

const data = getGameData();

/** Section 15.1 screen 5: contracts, wafer starts, binning, SKUs and inventory. */
export function Manufacturing() {
  const state = useGameStore((store) => store.state);
  const applyGameCommand = useGameStore((store) => store.applyGameCommand);
  const design = getActiveDesign(state);
  const node = data.nodeById[design.nodeId];
  const product = productForDesign(state.manufacturing, design.id);
  const fabs = state.manufacturing.fabs
    .filter((fab) => fab.nodeId === design.nodeId)
    .sort((a, b) => a.waferCostMultiplier - b.waferCostMultiplier);
  const cheapestFab = fabs[0];

  const run = (command: ManufacturingCommand): boolean => applyGameCommand(command);
  const productName = (skuId: string): string => {
    for (const candidate of state.manufacturing.products) {
      const sku = candidate.skus.find((entry) => entry.id === skuId);
      if (sku !== undefined) {
        return sku.name;
      }
    }
    return skuId;
  };

  if (node === undefined) {
    return (
      <section className="screen">
        <header className="screen-header">
          <h1>Manufacturing</h1>
          <span className="milestone-tag">M7 · fab &amp; yield</span>
        </header>
        <div className="panel">
          <p className="validation-message">
            This design references an unknown process node ({design.nodeId}).
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="screen manufacturing-screen">
      <header className="screen-header">
        <h1>Manufacturing</h1>
        <span className="milestone-tag">M7 · fab &amp; yield</span>
        <span className="muted">
          {design.name} · {node.name} · {state.settings.companyName}
        </span>
      </header>

      <ManufacturingStatsPanel state={state} design={design} fab={cheapestFab} />

      <div className="fab-columns">
        <FabContractsPanel state={state} design={design} onCommand={run} />
        <ProductStackPanel
          key={`${design.id}:${product?.id ?? "draft"}`}
          state={state}
          design={design}
          product={product}
          onCommand={run}
        />
      </div>

      <WaferStartPanel
        state={state}
        design={design}
        productName={productName}
        onCommand={run}
      />

      <InventoryPanel state={state} productName={productName} />
    </section>
  );
}