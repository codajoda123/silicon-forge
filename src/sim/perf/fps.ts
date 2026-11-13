import type { Tuning, WorkloadProfile } from "../../data/schemas";
import type { FpsBound, FpsEstimate } from "./types";

/**
 * Section 10.3. `cpi` already contains every memory stall (step 4 of Section
 * 9.4), so there is deliberately no second latency term here: the frame time is
 * one instruction budget times one CPI.
 */
export function estimateFps(
  workload: WorkloadProfile,
  instructionsPerFrame: number,
  cpi: number,
  clockMHz: number,
  tuning: Tuning,
  uncertaintyRelative = 0,
): FpsEstimate {
  const frameWorkload = workload.workUnit === "frame";
  const systemOverheadMs = frameWorkload ? tuning.perf.fps.fixedOverheadMs : 0;
  const cpuFrameMs =
    clockMHz > 0
      ? (instructionsPerFrame * cpi) / (clockMHz * 1000) + systemOverheadMs
      : Number.POSITIVE_INFINITY;
  const gpuFrameMs = workload.gpuFrameMs ?? 0;
  const frameMs = Math.max(cpuFrameMs, gpuFrameMs);
  const frameCapHz = workload.frameCapHz ?? null;
  const capped = frameCapHz !== null ? Math.min(frameCapHz, 1000 / frameMs) : 1000 / frameMs;
  const bound: FpsBound =
    gpuFrameMs > cpuFrameMs ? "gpu" : frameCapHz !== null && frameMs * frameCapHz < 1000 ? "frame-cap" : "cpu";

  const highFrameMs = cpuFrameMs * (1 + uncertaintyRelative);
  const lowFrameMs = cpuFrameMs * (1 - uncertaintyRelative);
  const clampCap = (value: number): number =>
    frameCapHz === null ? value : Math.min(frameCapHz, value);
  const fpsLow = clampCap(1000 / Math.max(highFrameMs, gpuFrameMs));
  const fpsHigh = clampCap(1000 / Math.max(lowFrameMs, gpuFrameMs));
  const achievableFrameMs = 1000 / capped;

  return {
    cpuFrameMs,
    frameMs,
    fps: capped,
    fpsLow,
    fpsHigh,
    bound,
    frameCapHz,
    frameBudgetUse: achievableFrameMs > 0 ? cpuFrameMs / achievableFrameMs : 0,
    systemOverheadMs,
  };
}
