import { z } from "zod";

export const OP_CLASSES = [
  "intAlu",
  "intMul",
  "intDiv",
  "shift",
  "bcd",
  "fpAdd",
  "fpMul",
  "fpDiv",
  "fpSqrt",
  "load",
  "store",
  "branch",
  "simd",
] as const;

export type OpClass = (typeof OP_CLASSES)[number];

export const OpClassSchema = z.enum(OP_CLASSES);
