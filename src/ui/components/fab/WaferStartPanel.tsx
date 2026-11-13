import { useEffect, useState } from "react";

import { getGameData, getTuning } from "../../../data/gameData";
import type { GameState } from "../../../sim/core/state";
import { getPlayerCompany } from "../../../sim/core/state";
import { analyzeManufacturing } from "../../../sim/fab/analysis";
import type { ManufacturingCommand } from "../../../sim/fab/commands";
import { hasReleasedTapeOut, productForDesign } from "../../../sim/fab/state";
import type { FabContract } from "../../../sim/fab/types";
import { lotFabricationWeeks, lotWaferCost } from "../../../sim/fab/wafer";
import type { ChipDesign } from "../../../sim/design/types";
import { formatInteger, formatMoney, formatPercent } from "../../format";
import { NumberField } from "../NumberField";

const data = getGameData();
const tuning = getTuning();

export interface WaferStartPanelProps {
  state: GameState;
  design: ChipDesign;
  productName: (skuId: string) => string;
  onCommand: (command: ManufacturingCommand) => boolean;
}

function capacityUsedThisWeek(state: GameState, fab: FabContract): number {
  return state.manufacturing.lots
    .filter((lot) => lot.fabId === fab.id && lot.startedWeek === state.week)
    .reduce((sum, lot) => sum + lot.wafers, 0);
}

/** Section 11.8: wafer starts, weekly capacity, lead time and lot history. */
export function WaferStartPanel({
  state,
  design,
  productName,
  onCommand,
}: WaferStartPanelProps) {
  const product = productForDesign(state.manufacturing, design.id);
  const released = hasReleasedTapeOut(state.manufacturing, design.id);
  const eligibleFabs = state.manufacturing.fabs.filter((fab) => fab.nodeId === design.nodeId);
  const eligibleKey = eligibleFabs.map((fab) => fab.id).join(",");
  const [fabId, setFabId] = useState(eligibleFabs[0]?.id ?? "");
  const [wafers, setWafers] = useState(
    Math.min(10, tuning.manufacturing.foundry.maxWaferLot),
  );

  useEffect(() => {
    if (!eligibleFabs.some((fab) => fab.id === fabId)) {
      setFabId(eligibleFabs[0]?.id ?? "");
    }
  }, [eligibleKey, eligibleFabs, fabId]);

  const fab = eligibleFabs.find((candidate) => candidate.id === fabId) ?? eligibleFabs[0];
  const node = data.nodeById[design.nodeId];
  const used = fab === undefined ? 0 : capacityUsedThisWeek(state, fab);
  const available = fab === undefined ? 0 : Math.max(0, fab.capacityPerWeek - used);
  const wafersFit =
    fab !== undefined &&
    Number.isInteger(wafers) &&
    wafers >= tuning.manufacturing.foundry.minWaferLot &&
    wafers <= Math.min(tuning.manufacturing.foundry.maxWaferLot, available);
  const analysis =
    fab === undefined || node === undefined
      ? null
      : analyzeManufacturing(design, data, tuning, {
          week: state.week,
          startYear: state.settings.startYear,
          fab,
        });
  const waferCost =
    fab === undefined || node === undefined ? 0 : lotWaferCost(fab, node.waferCost, wafers);
  const fabricationWeeks =
    fab === undefined || node === undefined ? 0 : lotFabricationWeeks(fab, node.cycleWeeks);
  const totalWeeks = fabricationWeeks + tuning.manufacturing.foundry.testAndPackageWeeks;
  const cash = getPlayerCompany(state).cash;
  const expectedGood =
    analysis === null ? 0 : Math.floor(wafers * analysis.dpw * analysis.yieldFraction);
  const canStart = product !== undefined && released && fab !== undefined && wafersFit && cash >= waferCost;
  const lots = [...state.manufacturing.lots].sort((a, b) => b.startedWeek - a.startedWeek);

  return (
    <section className="panel wafer-start-panel">
      <div className="panel-heading-row">
        <h2>Wafer starts</h2>
        <span className="muted">
          {released ? "design released to production" : "tape-out required"}
        </span>
      </div>

      {!released && (
        <p className="hint-line">
          Tape out and release this design before starting wafers. Product stacks can be prepared
          in advance.
        </p>
      )}

      <div className="wafer-start-form">
        <label className="field field-compact">
          <span>Foundry contract</span>
          <select value={fabId} onChange={(event) => setFabId(event.target.value)}>
            {eligibleFabs.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name} · {String(candidate.capacityPerWeek)}/week
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label="Wafers"
          value={wafers}
          min={tuning.manufacturing.foundry.minWaferLot}
          max={tuning.manufacturing.foundry.maxWaferLot}
          onCommit={setWafers}
        />
        <div className="wafer-readout">
          <span className="field-label">Capacity this week</span>
          <span className={available <= 0 ? "settings-warning" : ""}>
            {formatInteger(available)} / {formatInteger(fab?.capacityPerWeek ?? 0)} wafers free
          </span>
          <span className="muted">Lot cost {formatMoney(waferCost)} · cash {formatMoney(cash)}</span>
        </div>
        <div className="wafer-readout">
          <span className="field-label">Expected output</span>
          <span>
            {formatInteger(expectedGood)} good dies · {formatPercent(analysis?.yieldFraction ?? 0)}
          </span>
          <span className="muted">
            {String(totalWeeks)} weeks total ({String(fabricationWeeks)} in fab +{" "}
            {String(tuning.manufacturing.foundry.testAndPackageWeeks)} test/package)
          </span>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={!canStart}
          onClick={() => {
            if (fab === undefined) {
              return;
            }
            onCommand({
              type: "startWaferLot",
              designId: design.id,
              fabId: fab.id,
              wafers,
            });
          }}
        >
          Start {formatInteger(wafers)} wafers
        </button>
      </div>

      {!wafersFit && available > 0 && (
        <p className="validation-message">
          This week has {formatInteger(available)} wafers of capacity; a lot may use 1-
          {formatInteger(Math.min(tuning.manufacturing.foundry.maxWaferLot, available))} wafers.
        </p>
      )}
      {product === undefined && (
        <p className="validation-message">Create a product stack before starting wafers.</p>
      )}

      <h3>Lot history</h3>
      {lots.length === 0 ? (
        <p className="muted">No wafer lots started yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Started</th>
                <th>Wafers</th>
                <th>Status</th>
                <th>Ready</th>
                <th>Good / scrap</th>
                <th>Yield</th>
                <th>D0</th>
                <th>Cost / good die</th>
                <th>Bins</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id}>
                  <td className="mono">{lot.id}</td>
                  <td>week {String(lot.startedWeek)}</td>
                  <td>{formatInteger(lot.wafers)}</td>
                  <td>
                    <span className={`status-pill status-${lot.status}`}>
                      {lot.status === "inFab"
                        ? "in fab"
                        : lot.status === "testing"
                          ? "test + package"
                          : "completed"}
                    </span>
                  </td>
                  <td>week {String(lot.finishWeek)}</td>
                  <td>
                    {formatInteger(lot.result.goodDies)} / {formatInteger(lot.result.scrapDies)}
                  </td>
                  <td>{formatPercent(lot.result.yieldFraction)}</td>
                  <td>{lot.result.d0.toFixed(2)}</td>
                  <td>{formatMoney(lot.result.costPerGoodDie)}</td>
                  <td className="bin-list">
                    {Object.entries(lot.result.counts)
                      .filter(([, quantity]) => quantity > 0)
                      .map(([skuId, quantity]) => (
                        <span key={skuId}>
                          {productName(skuId)}: {formatInteger(quantity)}
                        </span>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="hint-line">
        Binning is frozen when a lot starts: later design edits cannot change material already in
        the fab. Test escapes become field failures in M9.
      </p>
    </section>
  );
}