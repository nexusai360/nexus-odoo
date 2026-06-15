// src/worker/sync/sync-config.ts
import type { PrismaClient } from "../../generated/prisma/client";
import { syncIntervalValueSchema } from "../../lib/validations/sync-config";

export interface SyncConfig {
  incrementalIntervalMin: number;
  snapshotIntervalMin: number;
  reconcileIntervalMin: number;
}

export const SYNC_CONFIG_DEFAULTS: SyncConfig = {
  incrementalIntervalMin: 3,
  // Snapshot a cada 30 min: mantém o "Atualizado em" dos relatórios recente
  // sem martelar a API do Odoo Tauga a cada poucos minutos. Ajustável na tela
  // /configuracao (AppSetting `sync.snapshot_interval_min`).
  snapshotIntervalMin: 30,
  // Reconciliação a cada 3h (não mais 24h). A reconciliação é a ÚNICA rotina
  // que detecta DELEÇÕES no Odoo (o incremental só pega write_date novo, e
  // deleção não muda write_date). Com 24h, uma deleção (ex.: 707 títulos a
  // pagar baixados em bloco) inflava o "a pagar" por até um dia inteiro; e o
  // ciclo diário sempre colidia com a janela de manutenção da Tauga (~meio-dia)
  // e morria. 3h dá 8 janelas/dia: a deleção reflete em horas E o ciclo quase
  // sempre encontra a Tauga no ar. O custo é baixo (só compara IDs). Ajustável
  // em /configuracao (AppSetting `sync.reconcile_interval_min`).
  reconcileIntervalMin: 180,
};

const KEY_MAP: Record<string, keyof SyncConfig> = {
  "sync.incremental_interval_min": "incrementalIntervalMin",
  "sync.snapshot_interval_min": "snapshotIntervalMin",
  "sync.reconcile_interval_min": "reconcileIntervalMin",
};

export async function readSyncConfig(prisma: PrismaClient): Promise<SyncConfig> {
  const rows = await prisma.appSetting.findMany({ where: { category: "sync" } });
  const cfg = { ...SYNC_CONFIG_DEFAULTS };
  for (const row of rows) {
    const field = KEY_MAP[row.key];
    if (!field) continue;
    const parsed = syncIntervalValueSchema.safeParse(row.value);
    if (parsed.success) {
      cfg[field] = parsed.data;
    } else {
      // Dado corrompido em AppSetting (string, objeto, NaN…): cai no default
      // e registra o aviso em vez de propagar valor inválido (WR-09).
      console.warn(
        `[sync-config] AppSetting "${row.key}" com valor inválido (${JSON.stringify(row.value)}) , usando default ${SYNC_CONFIG_DEFAULTS[field]}`,
      );
    }
  }
  return cfg;
}
