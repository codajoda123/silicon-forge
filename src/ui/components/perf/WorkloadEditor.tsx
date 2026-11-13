import { useMemo, useState } from "react";

import { getGameData } from "../../../data/gameData";
import { OP_CLASSES, type OpClass, type WorkloadProfile } from "../../../data/schemas";
import {
  WorkloadIdentitySection,
  WorkloadOperationsSection,
  WorkloadPatternsSection,
} from "./WorkloadFormSections";
import { validateWorkloadProfile } from "../../../sim/perf/workloads";

const data = getGameData();

export interface WorkloadEditorProps {
  initial: WorkloadProfile;
  isNew: boolean;
  existingIds: ReadonlySet<string>;
  onSave: (workload: WorkloadProfile) => boolean;
  onCancel: () => void;
}

export function WorkloadEditor({
  initial,
  isNew,
  existingIds,
  onSave,
  onCancel,
}: WorkloadEditorProps) {
  const [draft, setDraft] = useState<WorkloadProfile>({
    ...initial,
    opsPerUnit: { ...initial.opsPerUnit },
    patterns: { ...initial.patterns },
    footprintKB: { ...initial.footprintKB },
    era: [initial.era[0], initial.era[1]],
  });
  const [error, setError] = useState<string | null>(null);

  const patternOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const instruction of data.customInstructions) {
      unique.set(instruction.patternId, instruction.name);
    }
    return [...unique.entries()].map(([id, name]) => ({ id, name }));
  }, []);

  const patch = (value: Partial<WorkloadProfile>) => {
    setDraft((current) => ({ ...current, ...value }));
    setError(null);
  };

  const setOp = (opClass: OpClass, value: number) => {
    setDraft((current) => ({
      ...current,
      opsPerUnit: {
        ...current.opsPerUnit,
        [opClass]: Math.max(0, value),
      },
    }));
  };

  const setPattern = (patternId: string, value: number) => {
    setDraft((current) => {
      const patterns = { ...current.patterns };
      if (value <= 0) {
        delete patterns[patternId];
      } else {
        patterns[patternId] = Math.min(1, value);
      }
      return { ...current, patterns };
    });
  };

  const submit = () => {
    const profile: WorkloadProfile = {
      ...draft,
      id: draft.id.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      era: [Math.round(draft.era[0]), Math.round(draft.era[1])],
      opsPerUnit: Object.fromEntries(
        OP_CLASSES.map((opClass) => [opClass, Math.max(0, draft.opsPerUnit[opClass] ?? 0)]),
      ) as Record<OpClass, number>,
      patterns: Object.fromEntries(
        Object.entries(draft.patterns)
          .filter(([, value]) => (value ?? 0) > 0)
          .map(([patternId, value]) => [patternId, Math.min(1, Math.max(0, value ?? 0))]),
      ),
      frameCapHz: draft.frameCapHz !== undefined && draft.frameCapHz > 0 ? draft.frameCapHz : undefined,
      gpuFrameMs: draft.gpuFrameMs !== undefined && draft.gpuFrameMs > 0 ? draft.gpuFrameMs : undefined,
    };
    const validation = validateWorkloadProfile(
      profile,
      existingIds,
      isNew ? null : initial.id,
    );
    if (validation.workload === null) {
      setError(validation.error ?? "Invalid workload profile.");
      return;
    }
    if (onSave(validation.workload)) {
      setError(null);
    }
  };

  return (
    <div className="workload-editor">
      <div className="workload-editor-head">
        <div>
          <h2>{isNew ? "New workload profile" : `Edit ${initial.name}`}</h2>
          <p className="muted">
            Section 10.5 profiles are ISA-neutral. Operation counts are ops per {draft.workUnit};
            patterns 0–1 describe how much of the run uses a custom-instruction opportunity.
          </p>
        </div>
        <div className="workload-editor-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={submit}>
            {isNew ? "Create profile" : "Save changes"}
          </button>
        </div>
      </div>

      {error !== null && <p className="designer-warning">{error}</p>}

      <WorkloadIdentitySection draft={draft} patch={patch} isNew={isNew} />
      <WorkloadOperationsSection draft={draft} setOp={setOp} />
      <WorkloadPatternsSection
        draft={draft}
        patch={patch}
        patternOptions={patternOptions}
        setPattern={setPattern}
      />
    </div>
  );
}
