import { getGameData, getTuning } from "../../../data/gameData";
import type { GameState } from "../../../sim/core/state";
import { getPlayerCompany } from "../../../sim/core/state";
import type { ManufacturingCommand } from "../../../sim/fab/commands";
import type { ChipDesign } from "../../../sim/design/types";
import { formatInteger, formatMoney } from "../../format";

const data = getGameData();
const tuning = getTuning();

export interface FabContractsPanelProps {
  state: GameState;
  design: ChipDesign;
  onCommand: (command: ManufacturingCommand) => boolean;
}

/** Section 5.3/11.1: rented capacity plus a guaranteed reserved contract. */
export function FabContractsPanel({ state, design, onCommand }: FabContractsPanelProps) {
  const node = data.nodeById[design.nodeId];
  const cash = getPlayerCompany(state).cash;
  const contract = tuning.manufacturing.foundry.contract;
  const reserved = tuning.manufacturing.foundry.reserved;
  const alreadyContract = state.manufacturing.fabs.some(
    (fab) => fab.nodeId === design.nodeId && fab.kind === "contract",
  );
  const alreadyReserved = state.manufacturing.fabs.some(
    (fab) => fab.nodeId === design.nodeId && fab.kind === "reserved",
  );
  const canAfford = cash >= reserved.upfrontCost;

  return (
    <section className="panel fab-contracts-panel">
      <div className="panel-heading-row">
        <h2>Foundry contracts</h2>
        <span className="muted">cash {formatMoney(cash)}</span>
      </div>

      <ul className="fab-list">
        {state.manufacturing.fabs.map((fab) => (
          <li key={fab.id} className="fab-card">
            <div className="fab-card-head">
              <strong>{fab.name}</strong>
              <span className={`status-pill status-${fab.kind}`}>
                {fab.kind === "reserved" ? "reserved" : "rented"}
              </span>
            </div>
            <dl className="fab-meta">
              <div>
                <dt>Capacity</dt>
                <dd>{formatInteger(fab.capacityPerWeek)} wafers/week</dd>
              </div>
              <div>
                <dt>Lead time</dt>
                <dd>{String(fab.leadTimeWeeks)} weeks</dd>
              </div>
              <div>
                <dt>Wafer multiplier</dt>
                <dd>×{fab.waferCostMultiplier.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Lifetime wafers</dt>
                <dd>{formatInteger(fab.cumulativeWafers)}</dd>
              </div>
            </dl>
            <p className="fab-note">
              Signed week {String(fab.signedWeek)}
              {fab.upfrontCost > 0 ? ` · ${formatMoney(fab.upfrontCost)} upfront` : " · no deposit"}
              {fab.takeOrPay ? " · take-or-pay on reserved wafers" : ""}
            </p>
          </li>
        ))}
      </ul>

      <div className="fab-contract-action">
        <div>
          <h3>Reserved capacity · {node?.name ?? design.nodeId}</h3>
          <p className="muted">
            {formatMoney(reserved.upfrontCost)} deposit, {formatInteger(reserved.capacityPerWeek)}{" "}
            wafers/week, {String(reserved.leadTimeWeeks)}-week lead time and ×
            {reserved.waferCostMultiplier.toFixed(2)} wafer cost. Unused capacity is still paid
            through take-or-pay.
          </p>
        </div>
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            disabled={alreadyContract}
            onClick={() => {
              onCommand({ type: "signFabContract", nodeId: design.nodeId, kind: "contract" });
            }}
          >
            {alreadyContract
              ? "Rented capacity available"
              : `Rent capacity · ×${contract.waferCostMultiplier.toFixed(2)}`}
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={alreadyReserved || !canAfford}
            onClick={() => {
              onCommand({ type: "signFabContract", nodeId: design.nodeId, kind: "reserved" });
            }}
          >
            {alreadyReserved
              ? "Reserved for this node"
              : canAfford
                ? `Reserve · ${formatMoney(reserved.upfrontCost)}`
                : `Need ${formatMoney(reserved.upfrontCost)}`}
          </button>
        </div>
      </div>

      <p className="hint-line">
        Rented capacity can be bumped when the partner is busy; the reserved contract guarantees
        wafers at a lower multiplier but charges for unused slots.
      </p>
    </section>
  );
}