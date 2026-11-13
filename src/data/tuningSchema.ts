import { z } from "zod";

import { AutoPlaceTuningSchema } from "./autoplaceTuning";
import { OpClassSchema } from "./opClass";

export const TuningSchema = z
  .object({
    time: z.object({
      baseTickMsPerWeek: z.number().int().positive(),
      defaultStartYear: z.number().int(),
    }),
    newGame: z.object({
      defaultCompanyName: z.string().min(1),
      defaultSeed: z.number().int(),
      startingCash: z.number().nonnegative(),
      earliestStartYear: z.number().int(),
      latestStartYear: z.number().int(),
      companyNameMaxLength: z.number().int().positive(),
    }),
    log: z.object({
      maxEntries: z.number().int().positive(),
    }),
    design: z
      .object({
        defaultName: z.string().min(1),
        nameMaxLength: z.number().int().positive(),
        defaultDieWidth: z.number().int().positive(),
        defaultDieHeight: z.number().int().positive(),
        minDieWidth: z.number().int().positive(),
        minDieHeight: z.number().int().positive(),
        maxDieWidth: z.number().int().positive(),
        maxDieHeight: z.number().int().positive(),
        minBlockTiles: z.number().int().positive(),
        aspectRatios: z
          .array(
            z.object({
              label: z.string().min(1),
              ratio: z.number().positive(),
            }),
          )
          .min(1),
        padDepthMm: z.number().positive(),
        scribeWidthMm: z.number().nonnegative(),
        padPitchMm: z.number().positive(),
        powerGroundPins: z.number().int().nonnegative(),
        undoLimit: z.number().int().positive(),
      })
      .refine((value) => value.minDieWidth <= value.defaultDieWidth, {
        message: "design.defaultDieWidth must be >= minDieWidth",
        path: ["defaultDieWidth"],
      })
      .refine((value) => value.defaultDieWidth <= value.maxDieWidth, {
        message: "design.defaultDieWidth must be <= maxDieWidth",
        path: ["defaultDieWidth"],
      })
      .refine((value) => value.minDieHeight <= value.defaultDieHeight, {
        message: "design.defaultDieHeight must be >= minDieHeight",
        path: ["defaultDieHeight"],
      })
      .refine((value) => value.defaultDieHeight <= value.maxDieHeight, {
        message: "design.defaultDieHeight must be <= maxDieHeight",
        path: ["defaultDieHeight"],
      }),
    physical: z.object({
      voltageExponent: z.number().positive(),
      latchOverheadGateDelays: z.number().nonnegative(),
      defaultPipelineStages: z.number().int().positive(),
      ambientTempC: z.number(),
      thermalIterations: z.number().int().positive(),
      thermalToleranceC: z.number().positive(),
      lateralConductanceWPerC: z.number().nonnegative(),
      thermalDerateIterations: z.number().int().positive(),
      minimumClockFraction: z.number().min(0).max(1),
    }),
    perf: z.object({
      issueWidth: z.number().int().positive(),
      oooWindow: z.number().nonnegative(),
      oooHidingScale: z.number().positive(),
      controlFactors: z.object({
        hardwired: z.number().positive(),
        microcoded: z.number().positive(),
      }),
      unitOccupancy: z.record(OpClassSchema, z.number().positive()),
      fallbackUnitClass: OpClassSchema,
      missingUnitCount: z.number().int().positive(),
      branch: z.object({
        baseAccuracy: z.number().min(0).max(1),
        predictabilityScale: z.number().min(0).max(1),
        maxAccuracy: z.number().min(0).max(1),
      }),
      memory: z.object({
        compulsoryMissFloor: z.number().min(0).max(1),
        missRateCoefficient: z.number().positive(),
        missRateExponent: z.number().positive(),
        associativityMissReduction: z.number().min(0).max(1),
        cacheAccessTimePsPerSqrtKB: z.number().nonnegative(),
        multiplexedExtraBusCycles: z.number().nonnegative(),
        prefetchHiddenSharePerBufferedInstr: z.number().min(0).max(1),
        maxPrefetchHiddenShare: z.number().min(0).max(1),
      }),
      fps: z.object({
        fixedOverheadMs: z.number().nonnegative(),
      }),
      uncertainty: z.object({
        baseModelError: z.number().min(0).max(1),
        validationWeight: z.number().min(0),
        compilerWeight: z.number().min(0),
        highThreshold: z.number().positive(),
        mediumThreshold: z.number().positive(),
        shownReasons: z.number().int().positive(),
      }),
    }),
    power: z.object({
      referenceWorkloadId: z.string().min(1),
      ioPowerPerPadW: z.number().nonnegative(),
      ioReferenceClockMHz: z.number().positive(),
    }),
    congestion: z.object({
      tracksPerTile: z.number().positive(),
      detourPerOverflowRatio: z.number().nonnegative(),
    }),
    isa: z.object({
      wordBitsOptions: z.array(z.number().int().positive()).min(1),
      registerOptions: z.array(z.number().int().positive()).min(1),
      addressBitsMin: z.number().int().positive(),
      addressBitsMax: z.number().int().positive(),
      addressingModesMin: z.number().int().positive(),
      addressingModesMax: z.number().int().positive(),
      referenceWordBits: z.number().positive(),
      widthPassClasses: z.array(OpClassSchema).min(1),
      opcodeSpaceMultiplier: z.number().int().positive(),
      extraEncodingBytesPerOverflowChunk: z.number().int().positive(),
      customCompilerSupport: z.number().min(0).max(1),
      maxCustomRemovalShare: z.number().min(0).max(1),
      registersPerIlp: z.number().nonnegative(),
      baseWorkingRegisters: z.number().nonnegative(),
      spillTrafficFactor: z.number().min(0).max(1),
      variableBytesWidthExponent: z.number().nonnegative(),
      addressingModesDensityPerMode: z.number().min(0).max(1),
      addressShortfallPenaltyPerDoubling: z.number().nonnegative(),
      maxAddressingDensityReduction: z.number().min(0).max(1),
      minimumInstructionBytes: z.number().positive(),
      defaultTargetClockMHz: z.number().positive(),
      targetClockMinMHz: z.number().positive(),
      targetClockMaxMHz: z.number().positive(),
      pipelineStagesMin: z.number().int().positive(),
      pipelineStagesMax: z.number().int().positive(),
      prefetchQueueMinBytes: z.number().int().nonnegative(),
      prefetchQueueMaxBytes: z.number().int().nonnegative(),
      defaultControl: z.enum(["hardwired", "microcoded"]),
      defaultCooling: z.string().min(1),
      defaultTestStrategy: z.string().min(1),
      defaultSpareRows: z.boolean(),
      defaultBusMultiplexed: z.boolean(),
      defaultPrefetchQueueBytes: z.number().int().nonnegative(),
      extensions: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
            description: z.string().min(1),
            opClasses: z.array(OpClassSchema).min(1),
            missingHardwareFactor: z.number().positive(),
          }),
        )
        .min(1),
      testStrategies: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
            description: z.string().min(1),
            coverage: z.number().min(0).max(1),
            escapeRate: z.number().min(0).max(1),
            costPerDie: z.number().nonnegative(),
          }),
        )
        .min(1),
      coolingOptions: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
            verticalConductanceMultiplier: z.number().positive(),
          }),
        )
        .min(1),
    }),
    manufacturing: z.object({
      waferDefect: z.object({
        clusteringAlpha: z.number().positive(),
        monteCarloDies: z.number().int().positive(),
        spareRowsPerArray: z.number().int().nonnegative(),
        whitespaceHarmlessChance: z.number().min(0).max(1),
        minimumFrequencyMHz: z.number().positive(),
        powerFrequencyExponent: z.number().nonnegative(),
      }),
      foundry: z.object({
        contract: z.object({
          label: z.string().min(1),
          waferCostMultiplier: z.number().positive(),
          capacityPerWeek: z.number().int().positive(),
          leadTimeWeeks: z.number().int().nonnegative(),
          upfrontCost: z.number().nonnegative(),
          takeOrPay: z.boolean(),
        }),
        reserved: z.object({
          label: z.string().min(1),
          waferCostMultiplier: z.number().positive(),
          capacityPerWeek: z.number().int().positive(),
          leadTimeWeeks: z.number().int().nonnegative(),
          upfrontCost: z.number().nonnegative(),
          takeOrPay: z.boolean(),
        }),
        testAndPackageWeeks: z.number().int().nonnegative(),
        minWaferLot: z.number().int().positive(),
        maxWaferLot: z.number().int().positive(),
      }),
      skuAuto: z.object({
        names: z.array(z.string().min(1)).min(4),
        highFrequencyFraction: z.number().min(0).max(1),
        midFrequencyFraction: z.number().min(0).max(1),
        lowFrequencyFraction: z.number().min(0).max(1),
        salvageFrequencyFraction: z.number().min(0).max(1),
        priceBase: z.number().nonnegative(),
        pricePerMHz: z.number().nonnegative(),
        salvagePriceMultiplier: z.number().min(0).max(1),
        priceRounding: z.number().positive(),
      }),
      validation: z.object({
        baseBugCoefficient: z.number().nonnegative(),
        bugTransistorExponent: z.number().nonnegative(),
        noveltyFactor: z.number().positive(),
        customInstructionBugFactor: z.number().nonnegative(),
        hardwiredBugFactor: z.number().positive(),
        weeklySkill: z.number().nonnegative(),
        coverageScaleWeeks: z.number().positive(),
        rangeSigma: z.number().nonnegative(),
        severityCosmeticShare: z.number().min(0).max(1),
        severityErrataShare: z.number().min(0).max(1),
        microcodeErrataFixShare: z.number().min(0).max(1),
        tapeoutToolCost: z.number().nonnegative(),
        tapeoutEngineeringCost: z.number().nonnegative(),
        coverageWarning: z.number().min(0).max(1),
        fullCoverageThreshold: z.number().min(0).max(1),
      }),
      respinWeeks: z.number().int().positive(),
      coolingCostPerUnit: z.record(z.string(), z.number().nonnegative()),
    }),
    autoplace: AutoPlaceTuningSchema,
    timing: z.object({
      clockSkewPsPerMm: z.number().nonnegative(),
      maxPathInstances: z.number().int().positive(),
    }),
    save: z.object({
      storageKey: z.string().min(1),
    }),
  })
  .refine((value) => value.newGame.earliestStartYear <= value.newGame.latestStartYear, {
    message: "newGame.earliestStartYear must be <= newGame.latestStartYear",
    path: ["newGame", "earliestStartYear"],
  })
  .refine((value) => value.time.defaultStartYear >= value.newGame.earliestStartYear, {
    message: "time.defaultStartYear must be within the allowed start-year range",
    path: ["time", "defaultStartYear"],
  })
  .refine((value) => value.time.defaultStartYear <= value.newGame.latestStartYear, {
    message: "time.defaultStartYear must be within the allowed start-year range",
    path: ["time", "defaultStartYear"],
  });

export type Tuning = z.infer<typeof TuningSchema>;
