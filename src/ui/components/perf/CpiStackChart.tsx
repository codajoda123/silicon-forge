import type { CpiComponent } from "../../../sim/perf/types";

export interface CpiStackChartProps {
  components: readonly CpiComponent[];
}

/** Section 9.5 CPI stack: one additive bar plus a table of the same components. */
export function CpiStackChart({ components }: CpiStackChartProps) {
  const visible = components.filter((component) => component.cpi > 0);
  const total = visible.reduce((sum, component) => sum + component.cpi, 0);

  if (total <= 0) {
    return <p className="muted">No measured work: add an execution path and a workload.</p>;
  }

  return (
    <div className="cpi-stack">
      <div
        className="cpi-stack-bar"
        role="img"
        aria-label={`CPI stack totaling ${total.toFixed(2)} cycles per instruction`}
      >
        {visible.map((component) => (
          <span
            key={component.key}
            className={`cpi-segment cpi-${component.key}`}
            style={{ width: `${String((component.cpi / total) * 100)}%` }}
            title={`${component.label}: ${component.cpi.toFixed(2)} CPI`}
          />
        ))}
      </div>
      <ul className="cpi-legend">
        {visible.map((component) => (
          <li key={component.key}>
            <span className={`cpi-swatch cpi-${component.key}`} aria-hidden="true" />
            <span className="cpi-legend-label">{component.label}</span>
            <span className="cpi-legend-value">{component.cpi.toFixed(2)}</span>
            <span className="cpi-legend-share">
              {((component.cpi / total) * 100).toFixed(0)}%
            </span>
            <span className="cpi-legend-detail">{component.detail}</span>
          </li>
        ))}
      </ul>
      <p className="cpi-total">
        Total <strong>{total.toFixed(2)}</strong> cycles/instruction · components add up to the
        estimate (no hidden stall term)
      </p>
    </div>
  );
}
