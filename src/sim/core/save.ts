import { getGameData, getTuning } from "../../data/gameData";
import { createDefaultIsaConfig, createDefaultSettings } from "../isa/defaults";
import { createDefaultDesign } from "../design/defaults";
import type { ChipDesign } from "../design/types";
import { createInitialManufacturing } from "../fab/state";
import type { ManufacturingState } from "../fab/types";
import { SaveError } from "./saveErrors";
import {
  SavedGameV1Schema,
  SavedGameV2Schema,
  SavedGameV3Schema,
  SavedGameV4Schema,
  SavedGameV5Schema,
  VersionProbeSchema,
  type OldChipDesign,
} from "./saveSchemas";
import {
  formatIssues,
  validateCustomWorkloads,
  validateDesignReferences,
  validateManufacturingReferences,
} from "./saveValidation";
import { SAVE_VERSION, type GameState } from "./state";

export { SaveError } from "./saveErrors";

export function serializeSave(state: GameState): string {
  return JSON.stringify(state);
}

/** Version 2 designs predate the ISA/settings panel; give them the era defaults. */
function upgradeDesign(design: OldChipDesign): ChipDesign {
  const data = getGameData();
  const node = data.nodeById[design.nodeId];
  if (node === undefined) {
    throw new SaveError(`Save file is corrupt: unknown process node "${design.nodeId}"`);
  }
  return {
    ...design,
    isa: createDefaultIsaConfig(node.historicalYear, data),
    settings: createDefaultSettings(node, getTuning()),
    customInstructions: [],
  };
}

function initialManufacturingFor(design: ChipDesign): ManufacturingState {
  return createInitialManufacturing(design, getGameData(), getTuning());
}

/**
 * Parse and validate a save. Kept pure (no DOM, no IndexedDB) so it can be
 * used by tests and headless tools. Version 1/2 saves are migrated by filling
 * in the design architecture/settings those versions predate.
 */
export function deserializeSave(json: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch {
    throw new SaveError("Save file is not valid JSON.");
  }

  const probe = VersionProbeSchema.safeParse(raw);
  if (!probe.success) {
    throw new SaveError("Save file is missing a numeric version field.");
  }

  if (probe.data.version === 1) {
    const parsed = SavedGameV1Schema.safeParse(raw);
    if (!parsed.success) {
      throw new SaveError(`Save file is corrupt: ${formatIssues(parsed.error)}`);
    }
    const design = createDefaultDesign(parsed.data.settings.startYear, getGameData(), getTuning());
    const migrated: GameState = {
      ...parsed.data,
      version: SAVE_VERSION,
      designs: [design],
      activeDesignId: design.id,
      customWorkloads: [],
      manufacturing: initialManufacturingFor(design),
    };
    validateDesignReferences(migrated);
    validateManufacturingReferences(migrated);
    return migrated;
  }

  if (probe.data.version === 2) {
    const parsed = SavedGameV2Schema.safeParse(raw);
    if (!parsed.success) {
      throw new SaveError(`Save file is corrupt: ${formatIssues(parsed.error)}`);
    }
    const designs = parsed.data.designs.map((design) => upgradeDesign(design));
    const active =
      designs.find((design) => design.id === parsed.data.activeDesignId) ?? designs[0];
    if (active === undefined) {
      throw new SaveError("Save file is corrupt: no design to migrate");
    }
    const migrated: GameState = {
      ...parsed.data,
      version: SAVE_VERSION,
      designs,
      customWorkloads: [],
      manufacturing: initialManufacturingFor(active),
    };
    validateDesignReferences(migrated);
    validateManufacturingReferences(migrated);
    return migrated;
  }

  if (probe.data.version === 3) {
    const parsed = SavedGameV3Schema.safeParse(raw);
    if (!parsed.success) {
      throw new SaveError(`Save file is corrupt: ${formatIssues(parsed.error)}`);
    }
    const active =
      parsed.data.designs.find((design) => design.id === parsed.data.activeDesignId) ??
      parsed.data.designs[0];
    if (active === undefined) {
      throw new SaveError("Save file is corrupt: no design to migrate");
    }
    const migrated: GameState = {
      ...parsed.data,
      version: SAVE_VERSION,
      customWorkloads: [],
      manufacturing: initialManufacturingFor(active),
    };
    validateDesignReferences(migrated);
    validateManufacturingReferences(migrated);
    return migrated;
  }

  if (probe.data.version === 4) {
    const parsed = SavedGameV4Schema.safeParse(raw);
    if (!parsed.success) {
      throw new SaveError(`Save file is corrupt: ${formatIssues(parsed.error)}`);
    }
    const active =
      parsed.data.designs.find((design) => design.id === parsed.data.activeDesignId) ??
      parsed.data.designs[0];
    if (active === undefined) {
      throw new SaveError("Save file is corrupt: no design to migrate");
    }
    const migrated: GameState = {
      ...parsed.data,
      version: SAVE_VERSION,
      manufacturing: initialManufacturingFor(active),
    };
    validateDesignReferences(migrated);
    validateCustomWorkloads(migrated.customWorkloads);
    validateManufacturingReferences(migrated);
    return migrated;
  }

  if (probe.data.version !== SAVE_VERSION) {
    throw new SaveError(
      `Unsupported save version ${String(probe.data.version)}; this build reads versions 1-${String(SAVE_VERSION)}.`,
    );
  }

  const parsed = SavedGameV5Schema.safeParse(raw);
  if (!parsed.success) {
    throw new SaveError(`Save file is corrupt: ${formatIssues(parsed.error)}`);
  }
  validateDesignReferences(parsed.data);
  validateCustomWorkloads(parsed.data.customWorkloads);
  validateManufacturingReferences(parsed.data);
  return parsed.data;
}
