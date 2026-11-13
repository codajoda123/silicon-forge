import type { WorkloadProfile } from "../../../data/schemas";
import { OP_CLASSES } from "../../../data/schemas";

export interface WorkloadFormSectionProps {
  draft: WorkloadProfile;
  patch: (value: Partial<WorkloadProfile>) => void;
}

function numberValue(event: React.ChangeEvent<HTMLInputElement>): number {
  const value = Number(event.target.value);
  return Number.isFinite(value) ? value : 0;
}

export function WorkloadIdentitySection({
  draft,
  patch,
  isNew,
}: WorkloadFormSectionProps & { isNew: boolean }) {
  return (
    <section className="workload-form-section">
      <h3>Identity</h3>
      <div className="workload-form-grid">
        <label>
          <span>Name</span>
          <input
            value={draft.name}
            onChange={(event) => {
              patch({ name: event.target.value });
            }}
          />
        </label>
        <label>
          <span>Id</span>
          <input
            value={draft.id}
            disabled={!isNew}
            onChange={(event) => {
              patch({ id: event.target.value });
            }}
          />
        </label>
        <label className="span-2">
          <span>Description</span>
          <textarea
            rows={2}
            value={draft.description}
            onChange={(event) => {
              patch({ description: event.target.value });
            }}
          />
        </label>
        <label>
          <span>Kind</span>
          <select
            value={draft.kind}
            onChange={(event) => {
              patch({ kind: event.target.value as WorkloadProfile["kind"] });
            }}
          >
            <option value="kernel">Kernel</option>
            <option value="app">Application</option>
            <option value="game">Game frame</option>
          </select>
        </label>
        <label>
          <span>Work unit</span>
          <select
            value={draft.workUnit}
            onChange={(event) => {
              patch({ workUnit: event.target.value as WorkloadProfile["workUnit"] });
            }}
          >
            <option value="iteration">Iteration</option>
            <option value="job">Job</option>
            <option value="frame">Frame</option>
          </select>
        </label>
        <label>
          <span>Era start</span>
          <input
            type="number"
            value={draft.era[0]}
            onChange={(event) => {
              patch({ era: [Math.round(numberValue(event)), draft.era[1]] });
            }}
          />
        </label>
        <label>
          <span>Era end</span>
          <input
            type="number"
            value={draft.era[1]}
            onChange={(event) => {
              patch({ era: [draft.era[0], Math.round(numberValue(event))] });
            }}
          />
        </label>
        <label>
          <span>Operand bits</span>
          <input
            type="number"
            min={1}
            value={draft.operandBits}
            onChange={(event) => {
              patch({ operandBits: Math.max(1, Math.round(numberValue(event))) });
            }}
          />
        </label>
        <label>
          <span>Source</span>
          <select
            value={draft.source}
            onChange={(event) => {
              patch({ source: event.target.value as WorkloadProfile["source"] });
            }}
          >
            <option value="builtin">Fictional / built-in</option>
            <option value="measured">Measured / imported</option>
          </select>
        </label>
      </div>
    </section>
  );
}

export function WorkloadOperationsSection({
  draft,
  setOp,
}: {
  draft: WorkloadProfile;
  setOp: (opClass: (typeof OP_CLASSES)[number], value: number) => void;
}) {
  return (
    <section className="workload-form-section">
      <h3>Operations per unit</h3>
      <div className="workload-ops-grid">
        {OP_CLASSES.map((opClass) => (
          <label key={opClass}>
            <span>{opClass}</span>
            <input
              type="number"
              min={0}
              step="any"
              value={draft.opsPerUnit[opClass] ?? 0}
              onChange={(event) => {
                setOp(opClass, numberValue(event));
              }}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

export function WorkloadPatternsSection({
  draft,
  patch,
  patternOptions,
  setPattern,
}: WorkloadFormSectionProps & {
  patternOptions: readonly { id: string; name: string }[];
  setPattern: (patternId: string, value: number) => void;
}) {
  return (
    <section className="workload-form-section">
      <h3>Patterns &amp; memory</h3>
      <div className="workload-form-grid workload-form-grid-3">
        {patternOptions.map((pattern) => (
          <label key={pattern.id}>
            <span>{pattern.name}</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={draft.patterns[pattern.id] ?? 0}
              onChange={(event) => {
                setPattern(pattern.id, numberValue(event));
              }}
            />
          </label>
        ))}
        <label>
          <span>I footprint (KB)</span>
          <input
            type="number"
            min={0}
            step="any"
            value={draft.footprintKB.instr}
            onChange={(event) => {
              patch({
                footprintKB: { ...draft.footprintKB, instr: Math.max(0, numberValue(event)) },
              });
            }}
          />
        </label>
        <label>
          <span>D footprint (KB)</span>
          <input
            type="number"
            min={0}
            step="any"
            value={draft.footprintKB.data}
            onChange={(event) => {
              patch({
                footprintKB: { ...draft.footprintKB, data: Math.max(0, numberValue(event)) },
              });
            }}
          />
        </label>
        <label>
          <span>Bytes per memory op</span>
          <input
            type="number"
            min={0}
            step="any"
            value={draft.memBytesPerOp}
            onChange={(event) => {
              patch({ memBytesPerOp: Math.max(0, numberValue(event)) });
            }}
          />
        </label>
        <label>
          <span>Branch predictability</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={draft.branchPredictability}
            onChange={(event) => {
              patch({ branchPredictability: Math.min(1, Math.max(0, numberValue(event))) });
            }}
          />
        </label>
        <label>
          <span>Dependency probability</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={draft.depProb}
            onChange={(event) => {
              patch({ depProb: Math.min(1, Math.max(0, numberValue(event))) });
            }}
          />
        </label>
        <label>
          <span>ILP max</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={draft.ilpMax}
            onChange={(event) => {
              patch({ ilpMax: Math.max(0.1, numberValue(event)) });
            }}
          />
        </label>
        <label>
          <span>ILP scale</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={draft.ilpScale}
            onChange={(event) => {
              patch({ ilpScale: Math.max(0.1, numberValue(event)) });
            }}
          />
        </label>
        <label>
          <span>Parallel fraction</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={draft.parallelFraction}
            onChange={(event) => {
              patch({ parallelFraction: Math.min(1, Math.max(0, numberValue(event))) });
            }}
          />
        </label>
        <label>
          <span>Max threads</span>
          <input
            type="number"
            min={1}
            value={draft.maxThreads}
            onChange={(event) => {
              patch({ maxThreads: Math.max(1, Math.round(numberValue(event))) });
            }}
          />
        </label>
        <label>
          <span>Variance (±)</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={draft.variance}
            onChange={(event) => {
              patch({ variance: Math.min(1, Math.max(0, numberValue(event))) });
            }}
          />
        </label>
        <label>
          <span>Frame cap (Hz, 0 = none)</span>
          <input
            type="number"
            min={0}
            value={draft.frameCapHz ?? 0}
            onChange={(event) => {
              const value = numberValue(event);
              patch({ frameCapHz: value > 0 ? value : undefined });
            }}
          />
        </label>
        <label>
          <span>GPU frame (ms, 0 = none)</span>
          <input
            type="number"
            min={0}
            step="any"
            value={draft.gpuFrameMs ?? 0}
            onChange={(event) => {
              const value = numberValue(event);
              patch({ gpuFrameMs: value > 0 ? value : undefined });
            }}
          />
        </label>
      </div>
    </section>
  );
}
