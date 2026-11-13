import { useMemo, useRef, useState } from "react";

import { getGameData } from "../../data/gameData";
import type { WorkloadProfile } from "../../data/schemas";
import { useGameStore } from "../../store/gameStore";
import { useUiStore } from "../../store/uiStore";
import { getActiveDesign } from "../../sim/core/state";
import {
  combineWorkloads,
  duplicateWorkload,
  exportWorkloadJson,
  parseWorkloadImport,
} from "../../sim/perf/workloads";
import { formatCount } from "../format";
import { WorkloadEditor } from "../components/perf/WorkloadEditor";
import { WorkloadList } from "../components/perf/WorkloadList";
import { WorkloadBenchmarkTable } from "../components/perf/WorkloadBenchmarkTable";

const data = getGameData();

function blankWorkload(id: string): WorkloadProfile {
  return {
    id,
    name: "Custom workload",
    description: "Player-authored workload profile measured or estimated outside the game.",
    era: [1971, 2000],
    kind: "app",
    workUnit: "iteration",
    opsPerUnit: {
      intAlu: 100,
      intMul: 0,
      intDiv: 0,
      shift: 0,
      bcd: 0,
      fpAdd: 0,
      fpMul: 0,
      fpDiv: 0,
      fpSqrt: 0,
      load: 40,
      store: 20,
      branch: 10,
      simd: 0,
    },
    operandBits: 8,
    patterns: {},
    branchPredictability: 0.5,
    ilpMax: 2,
    ilpScale: 4,
    depProb: 0.3,
    footprintKB: { instr: 64, data: 32 },
    memBytesPerOp: 2,
    parallelFraction: 0,
    maxThreads: 1,
    variance: 0.05,
    source: "measured",
  };
}

interface EditorState {
  initial: WorkloadProfile;
  isNew: boolean;
}

export function WorkloadLab() {
  const state = useGameStore((store) => store.state);
  const addWorkload = useGameStore((store) => store.addWorkload);
  const updateWorkload = useGameStore((store) => store.updateWorkload);
  const deleteWorkload = useGameStore((store) => store.deleteWorkload);
  const setStatus = useUiStore((store) => store.setStatus);

  const [selectedId, setSelectedId] = useState(
    data.workloadById["galaxy-raiders"]?.id ?? data.workloads[0]?.id ?? "",
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const workloads = useMemo(
    () => combineWorkloads(data, state.customWorkloads),
    [state.customWorkloads],
  );
  const selected =
    workloads.find((workload) => workload.id === selectedId) ?? workloads[0];
  const builtins = workloads.filter((workload) => workloadIsBuiltin(workload.id));
  const custom = workloads.filter((workload) => !workloadIsBuiltin(workload.id));
  const activeDesign = getActiveDesign(state);


  const customIds = useMemo(
    () => new Set(state.customWorkloads.map((workload) => workload.id)),
    [state.customWorkloads],
  );

  const allIds = useMemo(
    () => new Set(workloads.map((workload) => workload.id)),
    [workloads],
  );

  const importFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseWorkloadImport(text, allIds);
    if (parsed.error !== null) {
      setStatus(`Import failed: ${parsed.error}`);
      return;
    }
    let imported = 0;
    for (const workload of parsed.workloads) {
      if (addWorkload(workload)) {
        imported += 1;
      }
    }
    if (imported > 0) {
      setSelectedId(parsed.workloads[0]?.id ?? selectedId);
      setStatus(`Imported ${String(imported)} workload profile(s).`);
    }
  };

  const exportSelected = () => {
    if (selected === undefined) {
      return;
    }
    const blob = new Blob([exportWorkloadJson(selected)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `workload-${selected.id}.json`;
    anchor.click();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  };

  const duplicate = () => {
    if (selected === undefined) {
      return;
    }
    const copy = duplicateWorkload(selected, allIds);
    if (addWorkload(copy)) {
      setSelectedId(copy.id);
      setStatus(`Duplicated "${selected.name}" as an editable profile.`);
    }
  };

  const createNew = () => {
    let index = 1;
    while (allIds.has(`custom-${String(index)}`)) {
      index += 1;
    }
    setEditor({ initial: blankWorkload(`custom-${String(index)}`), isNew: true });
  };

  const rowsFor = (profile: WorkloadProfile) =>
    Object.entries(profile.opsPerUnit)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

  if (editor !== null) {
    return (
      <section className="screen workload-screen">
        <header className="screen-header">
          <h1>Workload Lab</h1>
          <span className="milestone-tag">M6 · performance</span>
        </header>
        <WorkloadEditor
          initial={editor.initial}
          isNew={editor.isNew}
          existingIds={allIds}
          onCancel={() => {
            setEditor(null);
          }}
          onSave={(workload) => {
            const applied = editor.isNew
              ? addWorkload(workload)
              : updateWorkload(workload);
            if (applied) {
              setSelectedId(workload.id);
              setEditor(null);
              setStatus(
                `${editor.isNew ? "Created" : "Saved"} workload "${workload.name}".`,
              );
            }
            return applied;
          }}
        />
      </section>
    );
  }

  return (
    <section className="screen workload-screen">
      <header className="screen-header">
        <h1>Workload Lab</h1>
        <span className="milestone-tag">M6 · performance</span>
      </header>
      <p className="lead">
        Profiles are ISA-neutral operation mixes (Section 10.1). Duplicate or import one, tune its
        counts and memory footprint, then benchmark every chip in the company against it.
      </p>

      <div className="workload-lab-layout">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file !== undefined) {
              void importFile(file);
            }
          }}
        />
        <WorkloadList
          builtins={builtins}
          custom={custom}
          selectedId={selected?.id}
          onSelect={setSelectedId}
          onNew={createNew}
          onImport={() => {
            fileRef.current?.click();
          }}
        />

        <div className="workload-detail">
          {selected === undefined ? (
            <p className="muted">Select a workload.</p>
          ) : (
            <>
              <div className="panel workload-detail-panel">
                <div className="panel-heading-row">
                  <div>
                    <h2>{selected.name}</h2>
                    <p className="muted">
                      {selected.description} · {selected.era[0]}–{selected.era[1]} ·{" "}
                      {selected.kind} · per {selected.workUnit}
                    </p>
                  </div>
                  <div className="workload-detail-actions">
                    <button type="button" className="secondary-button" onClick={duplicate}>
                      Duplicate
                    </button>
                    {customIds.has(selected.id) && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setEditor({ initial: selected, isNew: false });
                        }}
                      >
                        Edit
                      </button>
                    )}
                    <button type="button" className="secondary-button" onClick={exportSelected}>
                      Export
                    </button>
                    {customIds.has(selected.id) && (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete workload "${selected.name}"? Designs keep their ISA settings.`,
                            )
                          ) {
                            deleteWorkload(selected.id);
                            setSelectedId(data.workloads[0]?.id ?? "");
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                <dl className="workload-stats">
                  <div>
                    <dt>Operations</dt>
                    <dd>{formatCount(Object.values(selected.opsPerUnit).reduce((a, b) => a + b, 0))}</dd>
                  </div>
                  <div>
                    <dt>Operand</dt>
                    <dd>{String(selected.operandBits)}-bit</dd>
                  </div>
                  <div>
                    <dt>Footprint</dt>
                    <dd>
                      {String(selected.footprintKB.instr)} KB I · {String(selected.footprintKB.data)} KB D
                    </dd>
                  </div>
                  <div>
                    <dt>Branch predictability</dt>
                    <dd>{(selected.branchPredictability * 100).toFixed(0)}%</dd>
                  </div>
                  <div>
                    <dt>ILP</dt>
                    <dd>
                      max {selected.ilpMax.toFixed(1)} · scale {selected.ilpScale.toFixed(1)}
                    </dd>
                  </div>
                  <div>
                    <dt>Memory op</dt>
                    <dd>{selected.memBytesPerOp.toFixed(1)} B · {selected.depProb * 100}% dependent</dd>
                  </div>
                  <div>
                    <dt>Variance</dt>
                    <dd>±{(selected.variance * 100).toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{selected.source}</dd>
                  </div>
                </dl>

                <div className="workload-two-column">
                  <div>
                    <h3>Operation mix</h3>
                    <ul className="workload-op-list">
                      {rowsFor(selected).map(([opClass, count]) => (
                        <li key={opClass}>
                          <span>{opClass}</span>
                          <strong>{formatCount(count)}</strong>
                          <span className="muted">
                            {(
                              (count /
                                Object.values(selected.opsPerUnit).reduce((a, b) => a + b, 0)) *
                              100
                            ).toFixed(1)}
                            %
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>Patterns</h3>
                    {Object.keys(selected.patterns).length === 0 ? (
                      <p className="muted">
                        No patterns. Custom instructions cannot accelerate this profile.
                      </p>
                    ) : (
                      <ul className="workload-pattern-list">
                        {Object.entries(selected.patterns)
                          .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                          .map(([patternId, share]) => (
                            <li key={patternId}>
                              <span>
                                {data.patternById[patternId]?.name ?? patternId}
                              </span>
                              <strong>{((share ?? 0) * 100).toFixed(0)}%</strong>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <WorkloadBenchmarkTable
                designs={state.designs}
                activeDesignId={activeDesign.id}
                workload={selected}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function workloadIsBuiltin(id: string): boolean {
  return data.workloadById[id] !== undefined;
}
