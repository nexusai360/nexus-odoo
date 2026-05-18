import { z } from "zod";

export const syncConfigSchema = z.object({
  incrementalIntervalMin: z.number().int().min(1).max(1440),
  snapshotIntervalMin: z.number().int().min(1).max(10080),
  reconcileIntervalMin: z.number().int().min(1).max(10080),
});

export type SyncConfigInput = z.infer<typeof syncConfigSchema>;

/**
 * Valida um valor individual lido de `AppSetting.value` (campo Json) como um
 * intervalo de sync: inteiro positivo. Usado por leitores da config (UI e
 * worker) para tratar dados corrompidos de forma consistente (WR-09).
 */
export const syncIntervalValueSchema = z.number().int().positive();
