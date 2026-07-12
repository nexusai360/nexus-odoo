import { z } from "zod";

import { CORTE_DADOS_MINIMO } from "@/lib/corte-dados";

/**
 * Data (AAAA-MM-DD) a partir da qual a plataforma considera documentos.
 *
 * O piso (2026-01-01) e o mesmo limite que a UI oferece no calendario, repetido aqui de
 * proposito: a trava de tela nao e seguranca. Antes disso nao ha o que analisar , o cache
 * so guarda a partir do corte tecnico da ingestao.
 */
export const corteDadosSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data válida (AAAA-MM-DD).")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "Data inválida.")
  .refine(
    (v) => v >= CORTE_DADOS_MINIMO,
    `A plataforma só guarda dados a partir de ${CORTE_DADOS_MINIMO.split("-").reverse().join("/")}.`,
  );

export const syncConfigSchema = z.object({
  corteDados: corteDadosSchema,
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
