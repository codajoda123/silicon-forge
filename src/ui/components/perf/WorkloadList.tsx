import type { WorkloadProfile } from "../../../data/schemas";

export interface WorkloadListProps {
  builtins: readonly WorkloadProfile[];
  custom: readonly WorkloadProfile[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
  onImport: () => void;
}

export function WorkloadList({
  builtins,
  custom,
  selectedId,
  onSelect,
  onNew,
  onImport,
}: WorkloadListProps) {
  const item = (workload: WorkloadProfile) => (
    <li key={workload.id}>
      <button
        type="button"
        className={workload.id === selectedId ? "workload-item active" : "workload-item"}
        onClick={() => {
          onSelect(workload.id);
        }}
      >
        <span>{workload.name}</span>
        <small>
          {workload.source} · {workload.kind}
        </small>
      </button>
    </li>
  );

  return (
    <aside className="workload-list panel">
      <div className="panel-heading-row">
        <h2>Profiles</h2>
        <div className="workload-list-actions">
          <button type="button" className="secondary-button" onClick={onNew}>
            New
          </button>
          <button type="button" className="secondary-button" onClick={onImport}>
            Import
          </button>
        </div>
      </div>

      <h3>Built-in suites</h3>
      <ul className="workload-list-items">{builtins.map(item)}</ul>

      <h3>Custom &amp; measured</h3>
      {custom.length === 0 ? (
        <p className="muted">No custom profiles yet. Duplicate a built-in or import JSON.</p>
      ) : (
        <ul className="workload-list-items">{custom.map(item)}</ul>
      )}
    </aside>
  );
}
