import { z } from "zod";

export const syncConfigSchema = z.object({
  incrementalIntervalMin: z.number().int().min(1).max(1440),
  snapshotIntervalMin: z.number().int().min(1).max(10080),
  reconcileIntervalMin: z.number().int().min(1).max(10080),
});

export type SyncConfigInput = z.infer<typeof syncConfigSchema>;
