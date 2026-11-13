import { z } from "zod";

import { WorkloadSchema } from "../../data/schemas";
import { GAME_EVENT_KINDS } from "./events";

export const CompanySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isPlayer: z.boolean(),
  cash: z.number().finite(),
});

export const SettingsSchema = z.object({
  companyName: z.string().min(1),
  startYear: z.number().int(),
});

export const RngSchema = z.object({
  seed: z.number().int(),
  streams: z.record(z.string(), z.number().int()),
});

export const EventSchema = z.object({
  id: z.string().min(1),
  week: z.number().int().min(0),
  kind: z.enum(GAME_EVENT_KINDS),
  message: z.string(),
});

export const ConfigValueSchema = z.union([z.number().finite(), z.string(), z.boolean()]);

export const BlockRegionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});

export const PlacedBlockSchema = z.object({
  uid: z.string().min(1),
  typeId: z.string().min(1),
  config: z.record(z.string(), ConfigValueSchema),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  rotated: z.boolean(),
  locked: z.boolean(),
  region: BlockRegionSchema.optional(),
});

export const ChipDesignBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nodeId: z.string().min(1),
  packageId: z.string().min(1),
  dieW: z.number().int().positive(),
  dieH: z.number().int().positive(),
  blocks: z.array(PlacedBlockSchema),
  pipelinedLinks: z.array(z.string()),
});

export const IsaConfigSchema = z.object({
  archetypeId: z.string().min(1),
  wordBits: z.number().int().positive(),
  registers: z.number().int().positive(),
  addressBits: z.number().int().positive(),
  fixedLength: z.boolean(),
  addressingModes: z.number().int().positive(),
  privilegeModes: z.boolean(),
  extensions: z.array(z.string().min(1)),
});

export const DesignSettingsSchema = z.object({
  targetClockMHz: z.number().finite(),
  vdd: z.number().finite(),
  pipelineStages: z.number().int().positive(),
  control: z.enum(["hardwired", "microcoded"]),
  cooling: z.string().min(1),
  testStrategy: z.string().min(1),
  spareRows: z.boolean(),
  busMultiplexed: z.boolean(),
  prefetchQueueBytes: z.number().int().nonnegative(),
});

export const ChipDesignSchema = ChipDesignBaseSchema.extend({
  isa: IsaConfigSchema,
  settings: DesignSettingsSchema,
  customInstructions: z.array(z.string().min(1)),
});

export type OldChipDesign = z.infer<typeof ChipDesignBaseSchema>;

export const BaseSavedSchema = z.object({
  week: z.number().int().min(0),
  seed: z.number().int(),
  settings: SettingsSchema,
  companies: z.array(CompanySchema).min(1),
  eventSeq: z.number().int().min(0),
  rng: RngSchema,
  log: z.array(EventSchema),
});

export const SavedGameV1Schema = BaseSavedSchema.extend({
  version: z.literal(1),
});

export const SavedGameV2Schema = BaseSavedSchema.extend({
  version: z.literal(2),
  designs: z.array(ChipDesignBaseSchema).min(1),
  activeDesignId: z.string().min(1),
});

export const SavedGameV3Schema = BaseSavedSchema.extend({
  version: z.literal(3),
  designs: z.array(ChipDesignSchema).min(1),
  activeDesignId: z.string().min(1),
});

export const SkuSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  minFreqMHz: z.number().finite().nonnegative(),
  requiredBlocks: z.array(z.string().min(1)),
  disabledBlocks: z.array(z.string().min(1)),
  maxPowerW: z.number().finite().positive().nullable(),
  price: z.number().finite().nonnegative(),
  allocationTarget: z.number().finite().min(0).max(1).nullable(),
});

export const ProductSchema = z.object({
  id: z.string().min(1),
  designId: z.string().min(1),
  skus: z.array(SkuSchema),
  launchedWeek: z.number().int().nonnegative().nullable(),
});

export const FabContractSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["contract", "reserved"]),
  nodeId: z.string().min(1),
  waferCostMultiplier: z.number().finite().positive(),
  capacityPerWeek: z.number().int().positive(),
  leadTimeWeeks: z.number().int().nonnegative(),
  upfrontCost: z.number().finite().nonnegative(),
  takeOrPay: z.boolean(),
  signedWeek: z.number().int().nonnegative(),
  skillFactor: z.number().finite().positive(),
  cumulativeWafers: z.number().int().nonnegative(),
});

export const LotResultSchema = z.object({
  productId: z.string().min(1),
  sampleDies: z.number().int().positive(),
  dpw: z.number().int().nonnegative(),
  totalDies: z.number().int().nonnegative(),
  goodDies: z.number().int().nonnegative(),
  scrapDies: z.number().int().nonnegative(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  shares: z.record(z.string(), z.number().finite().min(0).max(1)),
  yieldFraction: z.number().finite().min(0).max(1),
  d0: z.number().finite().nonnegative(),
  dieAreaMm2: z.number().finite().positive(),
  escapedDies: z.number().int().nonnegative(),
  costPerGoodDie: z.number().finite().nonnegative(),
});

export const WaferLotSchema = z.object({
  id: z.string().min(1),
  designId: z.string().min(1),
  fabId: z.string().min(1),
  productId: z.string().min(1),
  wafers: z.number().int().positive(),
  startedWeek: z.number().int().nonnegative(),
  waferReadyWeek: z.number().int().nonnegative(),
  finishWeek: z.number().int().nonnegative(),
  status: z.enum(["inFab", "testing", "completed"]),
  result: LotResultSchema,
});

export const InventoryItemSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  designId: z.string().min(1),
  skuId: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  unitCost: z.number().finite().nonnegative(),
  producedWeek: z.number().int().nonnegative(),
});

export const ValidationRecordSchema = z.object({
  designId: z.string().min(1),
  actualBugs: z.number().int().nonnegative(),
  foundBugs: z.number().int().nonnegative(),
  validatedWeeks: z.number().int().nonnegative(),
  startedWeek: z.number().int().nonnegative().nullable(),
  lastFoundWeek: z.number().int().nonnegative().nullable(),
  coverage: z.number().finite().min(0).max(1),
});

export const TapeOutRecordSchema = z.object({
  designId: z.string().min(1),
  week: z.number().int().nonnegative(),
  maskCost: z.number().finite().nonnegative(),
  toolCost: z.number().finite().nonnegative(),
  engineeringCost: z.number().finite().nonnegative(),
  totalCost: z.number().finite().nonnegative(),
  remainingBugs: z.number().int().nonnegative(),
  severities: z.object({
    cosmetic: z.number().int().nonnegative(),
    errata: z.number().int().nonnegative(),
    serious: z.number().int().nonnegative(),
  }),
  status: z.enum(["released", "awaitingErratumDecision", "respinning"]),
  respinReadyWeek: z.number().int().nonnegative().nullable(),
  erratumAccepted: z.boolean(),
  respins: z.number().int().nonnegative(),
});

export const ManufacturingSchema = z.object({
  fabs: z.array(FabContractSchema),
  lots: z.array(WaferLotSchema),
  products: z.array(ProductSchema),
  inventory: z.array(InventoryItemSchema),
  validations: z.array(ValidationRecordSchema),
  tapeouts: z.array(TapeOutRecordSchema),
  nextFabSeq: z.number().int().positive(),
  nextLotSeq: z.number().int().positive(),
});

export const SavedGameV4Schema = SavedGameV3Schema.extend({
  version: z.literal(4),
  customWorkloads: z.array(WorkloadSchema),
});

export const SavedGameV5Schema = SavedGameV4Schema.extend({
  version: z.literal(5),
  manufacturing: ManufacturingSchema,
});

export const VersionProbeSchema = z.object({ version: z.number().int() });
