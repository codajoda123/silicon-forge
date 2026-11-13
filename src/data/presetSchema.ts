import { z } from "zod";

const PresetConfigValueSchema = z.union([z.number().finite(), z.string(), z.boolean()]);

export const DesignPresetBlockSchema = z.object({
  typeId: z.string().min(1),
  config: z.record(z.string(), PresetConfigValueSchema),
  aspectRatio: z.number().positive().optional(),
});

export const DesignPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  historicalYear: z.number().int().min(1900).max(2100),
  nodeId: z.string().min(1),
  packageId: z.string().min(1),
  dieW: z.number().int().min(3).max(40),
  dieH: z.number().int().min(3).max(40),
  blocks: z.array(DesignPresetBlockSchema).min(1),
});

export type DesignPresetBlock = z.infer<typeof DesignPresetBlockSchema>;
export type DesignPreset = z.infer<typeof DesignPresetSchema>;
