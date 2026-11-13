import { getGameData, getTuning } from "../../../data/gameData";
import type { GameState } from "../../../sim/core/state";
import { analyzeManufacturing } from "../../../sim/fab/analysis";
import type { FabContract } from "../../../sim/fab/types";
import type { ChipDesign } from "../../../sim/design/types";
import { formatInteger, formatMoney, formatPercent } from "../../format";
import { StatWithWhy } from "../StatWithWhy";

const data = getGameData();
const tuning = getTuning();

export interface ManufacturingStatsPanelProps {
  state: GameState;
  design: ChipDesign;
  fab?: FabContract;
}

/**
 * Section 11.2/11.3/11.6 estimate: every headline number comes from
 * analyzeManufacturing, which also supplies the "Why?" contributors.
 */
export function ManufacturingStatsPanel({
  state,
  design,
  fab,
}: ManufacturingStatsPanelProps) {
  const analysis = analyzeManufacturing(design, data, tuning, {
    week: state.week,
    startYear: state.settings.startYear,
    fab,
  });
  const pins = analysis.pins;
  const warnings: string[] = [];

  if (pins.overflow > 0) {
    warnings.push(
      `${String(pins.overflow)} pins over the ${String(pins.capacity)}-pin package/perimeter limit. Enable bus multiplexing, shrink the bus, or choose a larger package.`,
    );
  } else if (!design.settings.busMultiplexed && pins.multiplexingSaves > 0) {
    warnings.push(
      `Separate address and data buses need ${String(pins.pinsNeeded)} pins. Multiplexing saves ${String(pins.multiplexingSaves)} and leaves ${String(pins.capacity - pins.effectivePinsNeeded)} spare.`,
    );
  }
  if (!design.settings.busMultiplexed && pins.overflowWithoutMultiplexing > 0) {
    warnings.push(
      `This die only fits if the bus is multiplexed: without it the design is ${String(pins.overflowWithoutMultiplexing)} pins over capacity.`,
    );
  }
  if (design.settings.targetClockMHz > analysis.dieFrequencyMHz) {
    warnings.push(
      `Target clock ${analysis.dieFrequencyMHz.toFixed(2)} MHz is capped by sustained timing; high-frequency bins will be empty.`,
    );
  }

  return (
    <section className="panel fab-stats-panel">
      <div className="panel-heading-row">
        <h2>Process economics · {analysis.node.name}</h2>
        <span className="muted">
          week {String(state.week)} · {analysis.weeksSinceNodeIntro.toLocaleString()} weeks of node life
        </span>
      </div>

      <div className="stat-grid fab-stat-grid">
        <div className="stat-card is-accent">
          <span className="stat-label">Dies per wafer</span>
          <span className="stat-value">{formatInteger(analysis.dpw)}</span>
          <span className="stat-foot">
            {analysis.waferDiameterMm} mm wafer · {analysis.dieAreaMm2.toFixed(2)} mm² die
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Die yield</span>
          <span className="stat-value">{formatPercent(analysis.yieldFraction)}</span>
          <span className="stat-foot">
            {formatInteger(Math.floor(analysis.goodDiesPerWafer))} good dies per wafer on average
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Defect density D0</span>
          <span className="stat-value">{analysis.d0PerCm2.toFixed(2)}</span>
          <span className="stat-foot">defects/cm² · clustering α {analysis.clusteringAlpha.toFixed(1)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Cost per good die</span>
          <span className="stat-value">{formatMoney(analysis.costPerGoodDie)}</span>
          <span className="stat-foot">
            wafer {formatMoney(analysis.waferCost)} · package {formatMoney(analysis.packageCostPerUnit)}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pins</span>
          <span className="stat-value">
            {String(pins.effectivePinsNeeded)} / {String(pins.capacity)}
          </span>
          <span className="stat-foot">
            {analysis.packageInfo.name} · {design.settings.busMultiplexed ? "multiplexed bus" : "separate buses"}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Test strategy</span>
          <span className="stat-value stat-value-small">{analysis.testStrategy.label}</span>
          <span className="stat-foot">
            {formatPercent(analysis.testStrategy.escapeRate)} escapes · {formatMoney(analysis.testCostPerDie)}/die
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Expected bugs</span>
          <span className="stat-value">{analysis.expectedBugs.toFixed(1)}</span>
          <span className="stat-foot">
            before validation · survivable range {analysis.bugRange.low}-{analysis.bugRange.high}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Sustained clock</span>
          <span className="stat-value">{analysis.dieFrequencyMHz.toFixed(2)} MHz</span>
          <span className="stat-foot">
            {analysis.powerW.toFixed(2)} W · target {design.settings.targetClockMHz.toFixed(2)} MHz
          </span>
        </div>
      </div>

      <div className="fab-why-grid">
        <StatWithWhy
          label="Yield drivers"
          value={formatPercent(analysis.yieldFraction)}
          why={analysis.yieldWhy}
          note="Negative-binomial yield combines die area, defect density and clustering."
        />
        <StatWithWhy
          label="Cost drivers"
          value={formatMoney(analysis.costPerGoodDie)}
          why={analysis.costWhy}
          note="Wafer, package/cooling and test cost are divided by yield."
        />
      </div>

      {warnings.length > 0 && (
        <ul className="designer-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </section>
  );
}