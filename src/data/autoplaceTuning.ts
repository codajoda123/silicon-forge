import { z } from "zod";

const AutoPlaceWeightSchema = z.object({
  wire: z.number().nonnegative(),
  congestion: z.number().nonnegative(),
  heat: z.number().nonnegative(),
  area: z.number().nonnegative(),
  edge: z.number().nonnegative(),
});

/** Section 7.8 auto-place tuning; kept separate so schemas.ts stays small. */
export const AutoPlaceTuningSchema = z
  .object({
    defaultSeed: z.number().int(),
    baseIterations: z.number().int().positive(),
    defaultEdaLevel: z.number().int().positive(),
    initialTemperatureFraction: z.number().positive(),
    coolingRate: z.number().gt(0).lt(1),
    attemptsPerIteration: z.number().int().positive(),
    localMoveFraction: z.number().min(0).max(1),
    localMoveRadiusTiles: z.number().int().positive(),
    rotationChance: z.number().min(0).max(1),
    searchThermalIterations: z.number().int().positive(),
    scoringClockMHz: z.number().positive(),
    thermalTargetRiseC: z.number().positive(),
    thermalTargetMarginC: z.number().nonnegative(),
    edgePenalty: z.number().positive(),
    wireScaleMmBits: z.number().positive(),
    congestionScaleTracks: z.number().positive(),
    heatScaleC: z.number().positive(),
    reportReasons: z.number().int().positive(),
    modes: z.object({
      performance: AutoPlaceWeightSchema,
      thermal: AutoPlaceWeightSchema,
      area: AutoPlaceWeightSchema,
    }),
  })
  .refine((value) => value.baseIterations * value.defaultEdaLevel > 0, {
    message: "autoplace iteration budget must be positive",
    path: ["baseIterations"],
  });
