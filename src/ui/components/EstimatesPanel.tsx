import { getGameData, getTuning } from "../../data/gameData";
import { dieAreaBreakdown, pinUsage, tileUsage, transistorCount } from "../../sim/design/area";
import { countLinksByTiming } from "../../sim/design/links";
import type { ChipDesign, DesignLink } from "../../sim/design/types";
import { formatInteger } from "../format";

const data = getGameData();
const tuning = getTuning();

export interface EstimatesPanelProps {
  design: ChipDesign;
  links: readonly DesignLink[];
}

export function EstimatesPanel({ design, links }: EstimatesPanelProps) {
  const transistors = transistorCount(design, data);
  const area = dieAreaBreakdown(design, data, tuning);
  const tiles = tileUsage(design);
  const pins = pinUsage(design, data, tuning);
  const timing = countLinksByTiming(links);
  const packageName = data.packageById[design.packageId]?.name ?? design.packageId;
  const utilization = tiles.total === 0 ? 0 : (tiles.used / tiles.total) * 100;
  const warnings: string[] = [];

  if (design.blocks.length === 0) {
    warnings.push("The die is empty. Add blocks from the palette.");
  }
  if (pins.overflow > 0) {
    warnings.push(
      `${String(pins.overflow)} pins over capacity. Multiplex the bus, shrink it, or choose a larger package.`,
    );
  } else if (!design.settings.busMultiplexed && pins.multiplexingSaves > 0) {
    warnings.push(
      `Separate address and data buses use ${String(pins.multiplexingSaves)} more pins than necessary; multiplexing would free them.`,
    );
  }
  if (tiles.whitespace === 0) {
    warnings.push("No whitespace remains; there is no room for routing or thermal relief.");
  }

  return (
    <section className="panel estimates-panel">
      <h2>Estimates</h2>
      <dl className="estimate-list">
        <div>
          <dt>Transistors</dt>
          <dd>{formatInteger(Math.round(transistors))}</dd>
        </div>
        <div>
          <dt>Die area</dt>
          <dd>{area.totalAreaMm2.toFixed(2)} mm²</dd>
        </div>
        <div>
          <dt>Grid</dt>
          <dd>
            {String(design.dieW)}×{String(design.dieH)} · {utilization.toFixed(1)}% used
          </dd>
        </div>
        <div>
          <dt>Whitespace</dt>
          <dd>{formatInteger(tiles.whitespace)} tiles</dd>
        </div>
        <div>
          <dt>Links</dt>
          <dd>
            {String(timing.critical)} critical · {String(timing.normal)} normal ·{" "}
            {String(timing.relaxed)} relaxed
          </dd>
        </div>
        <div>
          <dt>Pins</dt>
          <dd>
            {String(pins.effectivePinsNeeded)} / {String(pins.capacity)} · {packageName}
            {pins.multiplexingSaves > 0 && design.settings.busMultiplexed
              ? ` · multiplexed from ${String(pins.pinsNeeded)}`
              : ""}
          </dd>
        </div>
      </dl>

      <h3>Area breakdown</h3>
      <dl className="estimate-list estimate-breakdown">
        <div>
          <dt>Core</dt>
          <dd>{area.coreAreaMm2.toFixed(2)} mm²</dd>
        </div>
        <div>
          <dt>Pad ring</dt>
          <dd>{area.padRingAreaMm2.toFixed(2)} mm²</dd>
        </div>
        <div>
          <dt>Scribe</dt>
          <dd>{area.scribeAreaMm2.toFixed(2)} mm²</dd>
        </div>
        <div>
          <dt>Tile</dt>
          <dd>
            {area.tileSizeMm.toFixed(3)} mm · {area.tileAreaMm2.toFixed(4)} mm²
          </dd>
        </div>
      </dl>

      {warnings.length > 0 && (
        <ul className="designer-warnings">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <p className="muted estimates-note">
        Floorplan totals are live; frequency, power, thermal and wire-delay estimates are in the
        physical analysis panel.
      </p>
    </section>
  );
}
