import { getGameData, getTuning } from "../../../data/gameData";
import type { GameState } from "../../../sim/core/state";
import { getPlayerCompany } from "../../../sim/core/state";
import { analyzeManufacturing } from "../../../sim/fab/analysis";
import type { ManufacturingCommand } from "../../../sim/fab/commands";
import type { ChipDesign } from "../../../sim/design/types";
import type { TapeOutRecord, ValidationRecord } from "../../../sim/fab/types";
import { tapeOutCost } from "../../../sim/fab/validation";
import { formatMoney, formatPercent } from "../../format";

const data = getGameData();
const tuning = getTuning();

export interface ValidationPanelProps {
  state: GameState;
  design: ChipDesign;
  validation: ValidationRecord | undefined;
  tapeOut: TapeOutRecord | undefined;
  onCommand: (command: ManufacturingCommand) => boolean;
  onOpenManufacturing: () => void;
}

function statusLabel(record: TapeOutRecord): string {
  switch (record.status) {
    case "released":
      return "released";
    case "awaitingErratumDecision":
      return "serious bugs";
    case "respinning":
      return "respinning";
  }
}

/** Section 7.9: validation campaign, severity split, tape-out and respin. */
export function ValidationPanel({
  state,
  design,
  validation,
  tapeOut,
  onCommand,
  onOpenManufacturing,
}: ValidationPanelProps) {
  const coverage = validation?.coverage ?? 0;
  const analysis = analyzeManufacturing(design, data, tuning, {
    week: state.week,
    startYear: state.settings.startYear,
    coverage,
  });
  const node = data.nodeById[design.nodeId];
  const costs = node === undefined ? null : tapeOutCost(data, design, tuning);
  const cash = getPlayerCompany(state).cash;
  const running = validation !== undefined && validation.startedWeek !== null;
  const rush = coverage < tuning.manufacturing.validation.coverageWarning;
  const pinBlocked = analysis.pins.overflow > 0;
  const canStartValidation = !running && tapeOut === undefined;
  const canTapeOut = tapeOut === undefined && costs !== null && !pinBlocked;
  const respinCost = node?.maskSetCost ?? 0;

  if (node === undefined || costs === null) {
    return (
      <section className="panel">
        <p className="validation-message">This design references an unknown process node.</p>
      </section>
    );
  }

  return (
    <>
      <section className="panel validation-summary-panel">
        <div className="panel-heading-row">
          <h2>Validation campaign · {design.name}</h2>
          <span className="muted">
            {running ? `running since week ${String(validation?.startedWeek)}` : "not running"}
          </span>
        </div>

        <div className="stat-grid validation-stat-grid">
          <div className="stat-card is-accent">
            <span className="stat-label">Coverage</span>
            <span className="stat-value">{formatPercent(coverage)}</span>
            <span className="stat-foot">
              {validation?.validatedWeeks ?? 0} validated weeks · full coverage at{" "}
              {formatPercent(tuning.manufacturing.validation.fullCoverageThreshold)}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Bugs found</span>
            <span className="stat-value">{validation?.foundBugs ?? 0}</span>
            <span className="stat-foot">
              {validation?.lastFoundWeek === null || validation?.lastFoundWeek === undefined
                ? "none found yet"
                : `last found week ${String(validation.lastFoundWeek)}`}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Expected bugs</span>
            <span className="stat-value">{analysis.expectedBugs.toFixed(1)}</span>
            <span className="stat-foot">from transistors, ISA novelty and control style</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Estimated remaining</span>
            <span className="stat-value">
              {analysis.bugRange.low}–{analysis.bugRange.high}
            </span>
            <span className="stat-foot">
              range estimate at {formatPercent(coverage)} coverage; the exact count is hidden
            </span>
          </div>
        </div>

        <div className="validation-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!canStartValidation}
            onClick={() => {
              onCommand({ type: "startValidation", designId: design.id });
            }}
          >
            {running
              ? "Validation running"
              : tapeOut !== undefined
                ? "Tape-out complete"
                : "Start validation"}
          </button>
          <p className="muted">
            Each week finds a share of the hidden bugs. You see coverage and a remaining-bug range,
            never the exact Poisson draw. Tape-out below{" "}
            {formatPercent(tuning.manufacturing.validation.coverageWarning, 0)} coverage is allowed
            but risky.
          </p>
        </div>
      </section>

      <section className="panel tapeout-panel">
        <div className="panel-heading-row">
          <h2>Tape-out</h2>
          <span className="muted">
            {tapeOut === undefined ? "masks not cut" : `week ${String(tapeOut.week)}`}
          </span>
        </div>

        {tapeOut === undefined ? (
          <>
            <dl className="detail-grid tapeout-costs">
              <div>
                <dt>Mask set</dt>
                <dd>{formatMoney(costs.maskCost)}</dd>
              </div>
              <div>
                <dt>Design tools</dt>
                <dd>{formatMoney(costs.toolCost)}</dd>
              </div>
              <div>
                <dt>Engineering</dt>
                <dd>{formatMoney(costs.engineeringCost)}</dd>
              </div>
            </dl>
            <p className="lead">
              Total tape-out cost {formatMoney(costs.totalCost)} · cash {formatMoney(cash)}
            </p>
            {rush && (
              <p className="validation-message">
                Rushing at {formatPercent(coverage)} coverage: the remaining bugs will be assigned
                severities only after the masks are cut.
              </p>
            )}
            {pinBlocked && (
              <p className="validation-message">
                {analysis.pins.overflow} pins over the {analysis.pins.capacity}-pin package and
                perimeter limit. Multiplex the address/data bus, shrink it, or choose a larger
                package before tape-out.
              </p>
            )}
            <button
              type="button"
              className="primary-button"
              disabled={!canTapeOut || cash < costs.totalCost}
              onClick={() => {
                onCommand({ type: "tapeOut", designId: design.id });
              }}
            >
              {pinBlocked
                ? "Fix pin overflow to tape out"
                : cash < costs.totalCost
                  ? `Need ${formatMoney(costs.totalCost)}`
                  : `Tape out · ${formatMoney(costs.totalCost)}`}
            </button>
            {design.settings.control === "microcoded" && (
              <p className="hint-line">
                Microcoded control lets you patch{" "}
                {formatPercent(tuning.manufacturing.validation.microcodeErrataFixShare, 0)} of errata
                bugs before production.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="tapeout-status-row">
              <span className={`status-pill status-${tapeOut.status}`}>
                {statusLabel(tapeOut)}
              </span>
              <span>
                {tapeOut.remainingBugs} remaining bug{tapeOut.remainingBugs === 1 ? "" : "s"} ·{" "}
                {tapeOut.severities.cosmetic} cosmetic · {tapeOut.severities.errata} errata ·{" "}
                {tapeOut.severities.serious} serious
              </span>
              <span className="muted">
                {tapeOut.respins} respin{tapeOut.respins === 1 ? "" : "s"} ·{" "}
                {formatMoney(tapeOut.totalCost)} spent
              </span>
            </div>

            {tapeOut.status === "awaitingErratumDecision" && (
              <div className="tapeout-decision">
                <p className="validation-message">
                  {tapeOut.severities.serious} serious bug
                  {tapeOut.severities.serious === 1 ? "" : "s"} block release. Respinning costs{" "}
                  {formatMoney(respinCost)} and takes {String(tuning.manufacturing.respinWeeks)}{" "}
                  weeks; shipping with an erratum damages reputation in M9.
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={cash < respinCost}
                    onClick={() => {
                      onCommand({ type: "respinDesign", designId: design.id });
                    }}
                  >
                    {cash < respinCost
                      ? `Respin needs ${formatMoney(respinCost)}`
                      : `Respin · ${formatMoney(respinCost)}`}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      onCommand({ type: "acceptErratum", designId: design.id });
                    }}
                  >
                    Ship with erratum
                  </button>
                </div>
              </div>
            )}

            {tapeOut.status === "respinning" && (
              <p className="hint-line">
                New masks are in progress; the design releases in week{" "}
                {String(tapeOut.respinReadyWeek)}.
              </p>
            )}

            {tapeOut.status === "released" && (
              <div className="tapeout-decision">
                <p>
                  Design released to production.
                  {tapeOut.erratumAccepted
                    ? " The accepted erratum is logged as a reputation risk."
                    : " Masks are clean enough to build."}
                </p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onOpenManufacturing}
                >
                  Open Manufacturing
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}