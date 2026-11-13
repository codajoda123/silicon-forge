import { useId, useState } from "react";

import type { Contributor } from "../../sim/explain/why";

export interface StatWithWhyProps {
  label: string;
  value: string;
  why?: readonly Contributor[];
  note?: string;
}

/**
 * Section 17 "Why?" disclosure: one headline number, then the contributors
 * that made it. Shares are shown as percentages of the displayed total.
 */
export function StatWithWhy({ label, value, why = [], note }: StatWithWhyProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const hasWhy = why.length > 0;

  return (
    <div className="stat-with-why">
      <div className="physical-stat-row">
        <span className="physical-stat-label">{label}</span>
        <span className="physical-stat-value">{value}</span>
        <button
          type="button"
          className="why-toggle"
          aria-expanded={open}
          aria-controls={listId}
          disabled={!hasWhy}
          title={hasWhy ? "Show contributing factors" : "No contributions yet"}
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          Why?
        </button>
      </div>
      {note !== undefined && <p className="physical-stat-note">{note}</p>}
      {open && hasWhy && (
        <ul className="why-list" id={listId}>
          {why.map((contributor, index) => (
            <li key={`${contributor.label}:${String(index)}`}>
              <div className="why-head">
                <span className="why-label">{contributor.label}</span>
                <span className="why-share">
                  {(contributor.share * 100).toFixed(0)}%
                </span>
              </div>
              <span className="why-bar" aria-hidden="true">
                <span
                  style={{ width: `${String(Math.round(contributor.share * 100))}%` }}
                />
              </span>
              {contributor.detail !== undefined && (
                <span className="why-detail">{contributor.detail}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
