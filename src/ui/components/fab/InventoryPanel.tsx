import type { GameState } from "../../../sim/core/state";
import { formatInteger, formatMoney } from "../../format";

export interface InventoryPanelProps {
  state: GameState;
  productName: (skuId: string) => string;
}

interface InventoryRow {
  key: string;
  skuName: string;
  designName: string;
  quantity: number;
  value: number;
  lastProduced: number;
}

/** Section 11.8 finished-goods inventory, valued at the frozen lot cost. */
export function InventoryPanel({ state, productName }: InventoryPanelProps) {
  const rows = new Map<string, InventoryRow>();
  for (const item of state.manufacturing.inventory) {
    if (item.quantity <= 0) {
      continue;
    }
    const key = `${item.designId}:${item.skuId}`;
    const existing = rows.get(key);
    const designName =
      state.designs.find((design) => design.id === item.designId)?.name ?? item.designId;
    if (existing === undefined) {
      rows.set(key, {
        key,
        skuName: productName(item.skuId),
        designName,
        quantity: item.quantity,
        value: item.quantity * item.unitCost,
        lastProduced: item.producedWeek,
      });
    } else {
      existing.quantity += item.quantity;
      existing.value += item.quantity * item.unitCost;
      existing.lastProduced = Math.max(existing.lastProduced, item.producedWeek);
    }
  }
  const inventory = [...rows.values()].sort(
    (a, b) => b.value - a.value || a.key.localeCompare(b.key),
  );
  const totalUnits = inventory.reduce((sum, row) => sum + row.quantity, 0);
  const totalValue = inventory.reduce((sum, row) => sum + row.value, 0);

  return (
    <section className="panel inventory-panel">
      <div className="panel-heading-row">
        <h2>Finished-goods inventory</h2>
        <span className="muted">
          {formatInteger(totalUnits)} dies · {formatMoney(totalValue)} at cost
        </span>
      </div>
      {inventory.length === 0 ? (
        <p className="muted">
          No finished dies yet. Completed lots add each bin to inventory automatically.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Design</th>
                <th>SKU</th>
                <th>Quantity</th>
                <th>Average unit cost</th>
                <th>Inventory value</th>
                <th>Last produced</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((row) => (
                <tr key={row.key}>
                  <td>{row.designName}</td>
                  <td>{row.skuName}</td>
                  <td>{formatInteger(row.quantity)}</td>
                  <td>{formatMoney(row.quantity === 0 ? 0 : row.value / row.quantity)}</td>
                  <td>{formatMoney(row.value)}</td>
                  <td>week {String(row.lastProduced)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint-line">
        Holding cost and price erosion arrive with the M9 market. Inventory keeps the exact lot
        cost so the Finance screen can reconcile it later.
      </p>
    </section>
  );
}