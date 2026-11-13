import { useMemo } from "react";

import { getGameData } from "../../../data/gameData";
import type { WorkloadProfile } from "../../../data/schemas";
import type { PhysicalAnalysis } from "../../../sim/design/physical";
import type { ChipDesign } from "../../../sim/design/types";
import { combineWorkloads } from "../../../sim/perf/workloads";
import { PerformancePanel } from "./PerformancePanel";

const data = getGameData();

export interface DesignerPerformancePanelProps {
  design: ChipDesign;
  analysis: PhysicalAnalysis | null;
  customWorkloads: readonly WorkloadProfile[];
  onOpenWorkloadLab: () => void;
}

/** Keeps the designer screen under the file-size rule; memoizes the profile list. */
export function DesignerPerformancePanel({
  design,
  analysis,
  customWorkloads,
  onOpenWorkloadLab,
}: DesignerPerformancePanelProps) {
  const workloads = useMemo(
    () => combineWorkloads(data, customWorkloads),
    [customWorkloads],
  );
  return (
    <PerformancePanel
      design={design}
      analysis={analysis}
      workloads={workloads}
      onOpenWorkloadLab={onOpenWorkloadLab}
    />
  );
}
