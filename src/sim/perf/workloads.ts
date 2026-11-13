import type { WorkloadProfile } from "../../data/schemas";
import { WorkloadSchema } from "../../data/schemas";
import { getGameData } from "../../data/gameData";
import type { GameData } from "../../data/load";

export interface WorkloadValidation {
  workload: WorkloadProfile | null;
  error: string | null;
}

function formatIssues(error: { issues: readonly { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

/** Built-in profiles first, then the player's Workload Lab profiles. */
export function combineWorkloads(
  data: GameData,
  custom: readonly WorkloadProfile[],
): WorkloadProfile[] {
  return [...data.workloads, ...custom];
}

export function findWorkload(
  data: GameData,
  custom: readonly WorkloadProfile[],
  id: string,
): WorkloadProfile | undefined {
  return data.workloadById[id] ?? custom.find((profile) => profile.id === id);
}

export function workloadIdExists(
  data: GameData,
  custom: readonly WorkloadProfile[],
  id: string,
): boolean {
  return findWorkload(data, custom, id) !== undefined;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug.length > 0 ? slug : "workload";
}

/** A duplicate is a new custom profile; its id never collides with the source. */
export function duplicateWorkload(
  profile: WorkloadProfile,
  existingIds: ReadonlySet<string>,
): WorkloadProfile {
  const base = slugify(`${profile.id}-copy`);
  let candidate = base;
  let index = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${String(index)}`;
    index += 1;
  }
  return {
    ...profile,
    id: candidate,
    name: `${profile.name} (copy)`,
    opsPerUnit: { ...profile.opsPerUnit },
    patterns: { ...profile.patterns },
    footprintKB: { ...profile.footprintKB },
    era: [profile.era[0], profile.era[1]],
  };
}

/**
 * Validate one profile for the Workload Lab. `allowedId` lets an update keep
 * its own id while still rejecting a collision with a built-in or other custom
 * profile.
 */
export function validateWorkloadProfile(
  value: unknown,
  existingIds: ReadonlySet<string>,
  allowedId: string | null = null,
): WorkloadValidation {
  const parsed = WorkloadSchema.safeParse(value);
  if (!parsed.success) {
    return { workload: null, error: formatIssues(parsed.error) };
  }
  const workload = parsed.data;
  if (workload.id !== allowedId && existingIds.has(workload.id)) {
    return { workload: null, error: `Workload id "${workload.id}" already exists.` };
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(workload.id)) {
    return {
      workload: null,
      error: "Workload id must use lowercase letters, digits and dashes.",
    };
  }
  const data = getGameData();
  for (const patternId of Object.keys(workload.patterns)) {
    if (data.patternById[patternId] === undefined) {
      return {
        workload: null,
        error: `Unknown workload pattern "${patternId}".`,
      };
    }
  }
  return { workload, error: null };
}

export interface WorkloadImport {
  workloads: WorkloadProfile[];
  error: string | null;
}

/** Accept one profile object or an array of them (Section 10.5 import). */
export function parseWorkloadImport(
  text: string,
  existingIds: ReadonlySet<string>,
): WorkloadImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { workloads: [], error: "Workload file is not valid JSON." };
  }
  const items = Array.isArray(raw) ? raw : [raw];
  const imported: WorkloadProfile[] = [];
  const seen = new Set(existingIds);
  for (const item of items) {
    const result = validateWorkloadProfile(item, seen);
    if (result.workload === null) {
      return { workloads: [], error: result.error ?? "Invalid workload profile." };
    }
    seen.add(result.workload.id);
    imported.push(result.workload);
  }
  return { workloads: imported, error: null };
}

export function exportWorkloadJson(profile: WorkloadProfile): string {
  return JSON.stringify(profile, null, 2);
}
