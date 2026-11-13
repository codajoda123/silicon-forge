import { z } from "zod";

import { OP_CLASSES, OpClassSchema } from "./opClass";

export { OP_CLASSES, OpClassSchema, type OpClass } from "./opClass";
export { TuningSchema, type Tuning } from "./tuningSchema";

const FormulaSchema = z
  .string()
  .min(1, "formula must not be empty")
  .max(2048, "formula must be at most 2048 characters");

const YearSchema = z.number().int().min(1900).max(2100);
const MoneySchema = z.number().nonnegative();


export const ProcessNodeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    featureNm: z.number().positive(),
    historicalYear: YearSchema,
    family: z.enum(["PMOS", "NMOS", "CMOS"]),
    waferDiameterMm: z.number().positive(),
    densityTrPerMm2: z.number().positive(),
    transistorsPerTile: z.number().int().positive(),
    gateDelayPs: z.number().positive(),
    wireDelayPsPerMm: z.number().positive(),
    vddRange: z.tuple([z.number().positive(), z.number().positive()]),
    vddNominal: z.number().positive(),
    vthV: z.number().positive(),
    staticPowerPerKTrW: z.number().nonnegative(),
    capPerKTrPf: z.number().positive(),
    waferCost: MoneySchema,
    maskSetCost: MoneySchema,
    d0Initial: z.number().positive(),
    d0Mature: z.number().positive(),
    maturityTauWeeks: z.number().positive(),
    sigmaFreq: z.number().nonnegative(),
    metalLayers: z.number().int().positive(),
    /** Section 11.8: wafer start to finished wafer, before test/package. */
    cycleWeeks: z.number().int().positive(),
  })
  .refine((node) => node.vddRange[0] <= node.vddRange[1], {
    message: "vddRange minimum must be <= maximum",
    path: ["vddRange"],
  })
  .refine((node) => node.vddNominal >= node.vddRange[0] && node.vddNominal <= node.vddRange[1], {
    message: "vddNominal must lie inside vddRange",
    path: ["vddNominal"],
  })
  .refine((node) => node.d0Mature <= node.d0Initial, {
    message: "d0Mature must be <= d0Initial",
    path: ["d0Mature"],
  });

export type ProcessNode = z.infer<typeof ProcessNodeSchema>;

/**
 * A config option is tagged so the designer UI can render the right control
 * later and formulas can rely on every option having a concrete default.
 */
export const ConfigOptionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("enum"),
      label: z.string().min(1),
      values: z.array(z.union([z.number(), z.string()])).min(1),
      default: z.union([z.number(), z.string()]),
    })
    .refine((option) => option.values.includes(option.default), {
      message: "config enum default must be one of values",
      path: ["default"],
    }),
  z
    .object({
      kind: z.literal("integer"),
      label: z.string().min(1),
      min: z.number().int(),
      max: z.number().int(),
      default: z.number().int(),
    })
    .refine((option) => option.min <= option.max, {
      message: "config integer min must be <= max",
      path: ["min"],
    })
    .refine((option) => option.default >= option.min && option.default <= option.max, {
      message: "config integer default must lie inside min..max",
      path: ["default"],
    }),
  z.object({
    kind: z.literal("boolean"),
    label: z.string().min(1),
    default: z.boolean(),
  }),
]);

export type ConfigOption = z.infer<typeof ConfigOptionSchema>;
export type ConfigValue = number | string | boolean;

export const TimingClassSchema = z.enum(["critical", "normal", "relaxed"]);
export type TimingClass = z.infer<typeof TimingClassSchema>;

export const RequiredLinkSchema = z.object({
  to: z.string().min(1),
  widthBits: FormulaSchema,
  timing: TimingClassSchema,
});

export type RequiredLink = z.infer<typeof RequiredLinkSchema>;

/** One logic stage in a timing path: any placed instance of these block types. */
export const TimingPathStageSchema = z.object({
  blockTypes: z.array(z.string().min(1)).min(1),
});

export const TimingPathLegKindSchema = z.enum(["link", "wire"]);
export type TimingPathLegKind = z.infer<typeof TimingPathLegKindSchema>;

/**
 * A timing path template. `legs` has one entry per gap between stages:
 * "link" uses a generated critical link, "wire" is an implicit connection
 * (e.g. program-counter → decoder) that has no required-link record.
 */
export const TimingPathSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    stages: z.array(TimingPathStageSchema).min(1),
    legs: z.array(TimingPathLegKindSchema),
  })
  .refine((path) => path.legs.length === path.stages.length - 1, {
    message: "legs must have exactly one entry between each pair of stages",
    path: ["legs"],
  });

export type TimingPathTemplate = z.infer<typeof TimingPathSchema>;


export const BlockTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  historicalYear: YearSchema,
  configSchema: z.record(z.string(), ConfigOptionSchema),
  transistors: FormulaSchema,
  logicDepth: FormulaSchema,
  activity: z.partialRecord(OpClassSchema, z.number().min(0).max(1)),
  requiredLinks: z.array(RequiredLinkSchema),
  edgeOnly: z.boolean().optional(),
  isMemoryArray: z.boolean().optional(),
  repairable: z.boolean().optional(),
  disableable: z.boolean().optional(),
  unitFor: z.array(OpClassSchema).optional(),
  requiresTech: z.string().min(1).optional(),
});

export type BlockType = z.infer<typeof BlockTypeSchema>;

export const PackageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  maxPins: z.number().int().positive(),
  maxJunctionTempC: z.number().positive(),
  gVerticalWPerC: z.number().positive(),
  costPerUnit: MoneySchema,
  historicalYear: YearSchema,
});

export type ChipPackage = z.infer<typeof PackageSchema>;

/** A full record: the ISA math needs a defined cost for every op class. */
const OpsToInstrSchema = z.record(OpClassSchema, z.number().positive());
const MicrocodeCyclesSchema = z.record(OpClassSchema, z.number().positive());

export const IsaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  archetype: z.string().min(1),
  description: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(1),
  weaknesses: z.array(z.string().min(1)).min(1),
  historicalYear: YearSchema,
  opsToInstr: OpsToInstrSchema,
  bytesPerInstr: z.number().positive(),
  decodeDepth: z.number().positive(),
  microcodeCyclesPerClass: MicrocodeCyclesSchema,
  pipelineLatencyPerClass: MicrocodeCyclesSchema,
  pipelineFriendliness: z.number().min(0).max(1),
  compilerFriendliness: z.number().min(0).max(1),
  opcodeSpaceBits: z.number().int().positive(),
  defaultWordBits: z.number().int().positive(),
  defaultRegisters: z.number().int().positive(),
  defaultAddressBits: z.number().int().positive(),
  defaultAddressingModes: z.number().int().positive(),
  defaultFixedLength: z.boolean(),
  defaultPrivilegeModes: z.boolean(),
  defaultExtensions: z.array(z.string().min(1)),
});

export type Isa = z.infer<typeof IsaSchema>;

export const CustomInstructionSchema = z.object({
  id: z.string().min(1),
  patternId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  historicalYear: YearSchema,
  opsReplaced: z.number().int().min(2),
  latencyCycles: z.number().positive(),
  transistors: z.number().int().positive(),
  activity: z.partialRecord(OpClassSchema, z.number().min(0).max(1)),
  opcodeCost: z.number().int().positive(),
  validationWeight: z.number().nonnegative(),
  compilerEffort: z.number().positive(),
  patentRisk: z.number().min(0).max(1),
});

export type CustomInstruction = z.infer<typeof CustomInstructionSchema>;

export const WorkloadSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    era: z.tuple([YearSchema, YearSchema]),
    kind: z.enum(["kernel", "app", "game"]),
    workUnit: z.enum(["iteration", "frame", "job"]),
    opsPerUnit: z.record(OpClassSchema, z.number().nonnegative()),
    operandBits: z.number().int().positive(),
    patterns: z.partialRecord(z.string(), z.number().min(0).max(1)),
    branchPredictability: z.number().min(0).max(1),
    ilpMax: z.number().positive(),
    ilpScale: z.number().positive(),
    depProb: z.number().min(0).max(1),
    footprintKB: z.object({
      instr: z.number().nonnegative(),
      data: z.number().nonnegative(),
    }),
    memBytesPerOp: z.number().nonnegative(),
    parallelFraction: z.number().min(0).max(1),
    maxThreads: z.number().int().positive(),
    frameCapHz: z.number().positive().optional(),
    gpuFrameMs: z.number().nonnegative().optional(),
    variance: z.number().min(0).max(1),
    source: z.enum(["builtin", "measured"]),
  })
  .refine((workload) => workload.era[0] <= workload.era[1], {
    message: "era start year must be <= end year",
    path: ["era"],
  })
  .refine(
    (workload) => OP_CLASSES.some((opClass) => workload.opsPerUnit[opClass] > 0),
    {
      message: "opsPerUnit must contain at least one positive operation count",
      path: ["opsPerUnit"],
    },
  );

export type WorkloadProfile = z.infer<typeof WorkloadSchema>;

/** Section 9.4 world data: main-memory latency by historical year. */
export const MemoryLatencyPointSchema = z.object({
  year: YearSchema,
  latencyNs: z.number().positive(),
});

export type MemoryLatencyPoint = z.infer<typeof MemoryLatencyPointSchema>;

