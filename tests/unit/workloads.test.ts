import { describe, expect, it } from "vitest";

import { createNewGame, SAVE_VERSION } from "../../src/sim/core/state";
import { applyCommands } from "../../src/sim/core/commands";
import { deserializeSave, serializeSave } from "../../src/sim/core/save";
import {
  combineWorkloads,
  duplicateWorkload,
  exportWorkloadJson,
  parseWorkloadImport,
  validateWorkloadProfile,
} from "../../src/sim/perf/workloads";
import type { WorkloadProfile } from "../../src/data/schemas";
import { data, tuning } from "../design/helpers";

const galaxy = data.workloadById["galaxy-raiders"]!;

function custom(overrides: Partial<WorkloadProfile> = {}): WorkloadProfile {
  return {
    ...galaxy,
    id: "my-profile",
    name: "My profile",
    source: "measured",
    opsPerUnit: { ...galaxy.opsPerUnit },
    patterns: { ...galaxy.patterns },
    footprintKB: { ...galaxy.footprintKB },
    era: [galaxy.era[0], galaxy.era[1]],
    ...overrides,
  };
}

describe("workload profiles", () => {
  it("combines built-ins and custom profiles without mutating data", () => {
    const profiles = combineWorkloads(data, [custom()]);
    expect(profiles).toHaveLength(data.workloads.length + 1);
    expect(profiles.at(-1)?.id).toBe("my-profile");
    expect(data.workloads.some((workload) => workload.id === "my-profile")).toBe(false);
  });

  it("duplicates with a unique id and deep copies nested fields", () => {
    const copy = duplicateWorkload(galaxy, new Set([galaxy.id]));
    expect(copy.id).not.toBe(galaxy.id);
    expect(copy.name).toContain("(copy)");
    expect(copy.opsPerUnit).not.toBe(galaxy.opsPerUnit);
    expect(copy.patterns).not.toBe(galaxy.patterns);
    copy.opsPerUnit.intAlu += 1;
    expect(galaxy.opsPerUnit.intAlu).toBe(1440);
  });

  it("validates ids, schema and collisions", () => {
    expect(validateWorkloadProfile(custom(), new Set()).workload?.id).toBe("my-profile");
    expect(validateWorkloadProfile(custom({ id: "galaxy-raiders" }), new Set(["galaxy-raiders"])).error).toMatch(
      /already exists/,
    );
    expect(validateWorkloadProfile(custom({ id: "Bad Id" }), new Set()).error).toMatch(
      /lowercase/,
    );
    expect(
      validateWorkloadProfile(custom({ opsPerUnit: { ...galaxy.opsPerUnit, intAlu: -1 } }), new Set())
        .error,
    ).not.toBeNull();
    const allowed = validateWorkloadProfile(custom(), new Set(["my-profile"]), "my-profile");
    expect(allowed.error).toBeNull();
    expect(
      validateWorkloadProfile(custom({ patterns: { "no-such-pattern": 0.1 } }), new Set()).error,
    ).toMatch(/Unknown workload pattern/);
  });

  it("imports one profile or an array and exports a round trip", () => {
    const one = parseWorkloadImport(exportWorkloadJson(custom()), new Set());
    expect(one.error).toBeNull();
    expect(one.workloads).toHaveLength(1);

    const two = parseWorkloadImport(
      JSON.stringify([custom({ id: "a" }), custom({ id: "b" })]),
      new Set(),
    );
    expect(two.error).toBeNull();
    expect(two.workloads.map((workload) => workload.id)).toEqual(["a", "b"]);

    expect(parseWorkloadImport("{not json", new Set()).error).toMatch(/valid JSON/);
    expect(
      parseWorkloadImport(JSON.stringify([custom({ id: "a" }), custom({ id: "a" })]), new Set())
        .error,
    ).toMatch(/already exists/);
  });
});

describe("workload commands and save migration", () => {
  it("adds, updates and deletes custom profiles", () => {
    const base = createNewGame({ seed: 5 });
    const added = applyCommands(base, [{ type: "addWorkload", workload: custom() }]);
    expect(added.failures).toEqual([]);
    expect(added.state.customWorkloads).toHaveLength(1);

    const duplicateAdd = applyCommands(added.state, [{ type: "addWorkload", workload: custom() }]);
    expect(duplicateAdd.failures[0]).toMatch(/already exists/);

    const renamed = applyCommands(added.state, [
      { type: "updateWorkload", workload: custom({ name: "Renamed" }) },
    ]);
    expect(renamed.state.customWorkloads[0]?.name).toBe("Renamed");

    const deleted = applyCommands(renamed.state, [
      { type: "deleteWorkload", workloadId: "my-profile" },
    ]);
    expect(deleted.state.customWorkloads).toHaveLength(0);
    expect(
      applyCommands(base, [{ type: "deleteWorkload", workloadId: "galaxy-raiders" }]).failures[0],
    ).toMatch(/not an editable profile/);
  });

  it("refuses to overwrite a built-in profile", () => {
    const base = createNewGame({ seed: 5 });
    const result = applyCommands(base, [
      { type: "updateWorkload", workload: { ...galaxy, name: "Hijacked" } },
    ]);
    expect(result.failures[0]).toMatch(/not an editable profile/);
  });

  it("round-trips custom profiles in a v4 save and migrates v3", () => {
    const base = createNewGame({ seed: 5 });
    const added = applyCommands(base, [{ type: "addWorkload", workload: custom() }]).state;
    const loaded = deserializeSave(serializeSave(added));
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.customWorkloads[0]?.name).toBe("My profile");
    expect(loaded.manufacturing.fabs).toHaveLength(1);

    const { customWorkloads: _removed, ...withoutWorkloads } = added;
    const v3 = { ...withoutWorkloads, version: 3 };
    const migrated = deserializeSave(JSON.stringify(v3));
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.customWorkloads).toEqual([]);
    expect(migrated.manufacturing.fabs).toHaveLength(1);
    expect(tuning.save.storageKey.length).toBeGreaterThan(0);
  });
});
