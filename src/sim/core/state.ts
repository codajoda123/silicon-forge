import { getGameData, getTuning } from "../../data/gameData";
import type { WorkloadProfile } from "../../data/schemas";
import { createDefaultDesign } from "../design/defaults";
import type { ChipDesign } from "../design/types";
import { createInitialManufacturing } from "../fab/state";
import type { ManufacturingState } from "../fab/types";
import { nextEvent, type GameEvent } from "./events";
import { createRngSet, type RngSnapshot } from "./rng";

const tuning = getTuning();

export const SAVE_VERSION = 5 as const;

export const PLAYER_COMPANY_ID = "player";

export interface GameSettings {
  companyName: string;
  startYear: number;
}

export interface CompanyState {
  id: string;
  name: string;
  isPlayer: boolean;
  cash: number;
}

export interface GameState {
  version: number;
  /** Elapsed weeks since Jan 1 of `settings.startYear`. */
  week: number;
  seed: number;
  settings: GameSettings;
  companies: CompanyState[];
  designs: ChipDesign[];
  activeDesignId: string;
  /** Section 10.5 Workload Lab profiles; built-ins stay in data files. */
  customWorkloads: WorkloadProfile[];
  /** Section 11: fabs, lots, SKUs, inventory, validation and tape-outs. */
  manufacturing: ManufacturingState;
  /** Monotonic counter used for deterministic event ids. */
  eventSeq: number;
  rng: RngSnapshot;
  log: GameEvent[];
}

export interface NewGameOptions {
  companyName?: string;
  startYear?: number;
  seed?: number;
}

export function normalizeCompanyName(raw: string): string {
  return raw.trim().slice(0, tuning.newGame.companyNameMaxLength);
}

export function isStartYearAllowed(year: number): boolean {
  return (
    Number.isInteger(year) &&
    year >= tuning.newGame.earliestStartYear &&
    year <= tuning.newGame.latestStartYear
  );
}

export function getPlayerCompany(state: GameState): CompanyState {
  const player = state.companies.find((company) => company.isPlayer);
  if (player === undefined) {
    throw new Error("Game state has no player company");
  }
  return player;
}

export function getActiveDesign(state: GameState): ChipDesign {
  const design = state.designs.find((candidate) => candidate.id === state.activeDesignId);
  if (design === undefined) {
    throw new Error(`Game state has no active design "${state.activeDesignId}"`);
  }
  return design;
}

export function createNewGame(options: NewGameOptions = {}): GameState {
  const seed = options.seed ?? tuning.newGame.defaultSeed;
  if (!Number.isInteger(seed)) {
    throw new Error(`Seed must be an integer, received ${String(seed)}`);
  }

  const startYear = options.startYear ?? tuning.time.defaultStartYear;
  if (!isStartYearAllowed(startYear)) {
    throw new Error(
      `Start year ${String(startYear)} is outside ${tuning.newGame.earliestStartYear}-${tuning.newGame.latestStartYear}`,
    );
  }

  const requestedName = options.companyName ?? tuning.newGame.defaultCompanyName;
  const companyName = normalizeCompanyName(requestedName) || tuning.newGame.defaultCompanyName;

  const startupEvent = nextEvent(
    { week: 0, eventSeq: 0 },
    "gameStarted",
    `You founded ${companyName} in ${startYear}.`,
  );
  const design = createDefaultDesign(startYear, getGameData(), tuning);

  return {
    version: SAVE_VERSION,
    week: 0,
    seed,
    settings: { companyName, startYear },
    companies: [
      {
        id: PLAYER_COMPANY_ID,
        name: companyName,
        isPlayer: true,
        cash: tuning.newGame.startingCash,
      },
    ],
    designs: [design],
    activeDesignId: design.id,
    customWorkloads: [],
    manufacturing: createInitialManufacturing(design, getGameData(), tuning),
    eventSeq: 1,
    rng: createRngSet(seed).snapshot(),
    log: [startupEvent],
  };
}
