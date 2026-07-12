"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { syncConfigSchema, syncIntervalValueSchema } from "@/lib/validations/sync-config";
import { FATO_CATALOG, type FatoModo } from "@/lib/fatos-catalog";
import {
  CORTE_DADOS_KEY,
  CORTE_DADOS_PADRAO,
  invalidarCacheCorte,
} from "@/lib/corte-dados";

const KEY_OF = {
  corteDados: CORTE_DADOS_KEY,
  incrementalIntervalMin: "sync.incremental_interval_min",
  snapshotIntervalMin: "sync.snapshot_interval_min",
  reconcileIntervalMin: "sync.reconcile_interval_min",
} as const;

// Defaults alinhados com src/worker/sync/sync-config.ts (fonte de verdade
// do worker). Antes tinha snapshotIntervalMin=1440 aqui e 30 no worker -
// divergencia descoberta em auditoria 2026-05-27. Quando o usuario nunca
// salvou nada, frontend mostrava 1440 mas worker rodava 30 = silencioso.
const SYNC_CONFIG_DEFAULTS = {
  incrementalIntervalMin: 3,
  snapshotIntervalMin: 30,
  reconcileIntervalMin: 1440,
} as const;

/**
 * Lê um valor de AppSetting como intervalo de sync. Dado corrompido (string,
 * objeto, NaN) cai no default com aviso, em vez de devolver NaN para a UI
 * (WR-09) , alinhado à validação do worker.
 */
function readInterval(value: unknown, fallback: number, key: string): number {
  const parsed = syncIntervalValueSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  console.warn(
    `[sync-config] AppSetting "${key}" com valor inválido (${JSON.stringify(value)}) , usando default ${fallback}`,
  );
  return fallback;
}

export async function getSyncConfig() {
  const me = await getCurrentUser();
  if (!me || me.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }
  const rows = await prisma.appSetting.findMany({ where: { category: "sync" } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const corteBruto = byKey.get(CORTE_DADOS_KEY);
  return {
    // Marco zero: so existe dado a partir daqui (faturamento, estoque, contas, entregas,
    // relatorios e agente Nex). Configuravel na tela.
    corteDados:
      typeof corteBruto === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corteBruto)
        ? corteBruto
        : CORTE_DADOS_PADRAO,
    incrementalIntervalMin: readInterval(
      byKey.get(KEY_OF.incrementalIntervalMin),
      SYNC_CONFIG_DEFAULTS.incrementalIntervalMin,
      KEY_OF.incrementalIntervalMin,
    ),
    snapshotIntervalMin: readInterval(
      byKey.get(KEY_OF.snapshotIntervalMin),
      SYNC_CONFIG_DEFAULTS.snapshotIntervalMin,
      KEY_OF.snapshotIntervalMin,
    ),
    reconcileIntervalMin: readInterval(
      byKey.get(KEY_OF.reconcileIntervalMin),
      SYNC_CONFIG_DEFAULTS.reconcileIntervalMin,
      KEY_OF.reconcileIntervalMin,
    ),
  };
}

/**
 * Deriva o nome da tabela raw a partir do nome do modelo Odoo.
 * Convenção: pontos viram underscore, prefixo "raw_".
 * Exemplo: "estoque.saldo.hoje" → "raw_estoque_saldo_hoje".
 * Mantida em sync com rawTableFor() em worker/catalog/model-catalog.ts.
 */
function rawTableName(odooModel: string): string {
  return "raw_" + odooModel.replace(/\./g, "_");
}

export async function getSyncState() {
  const me = await getCurrentUser();
  if (!me || me.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }

  const rows = await prisma.syncState.findMany({ orderBy: { model: "asc" } });

  // Conta ao vivo a tabela raw de cada modelo para evitar valores defasados ou
  // condições de corrida no recordCount armazenado (especialmente em snapshots,
  // que mostrariam 0 após full refresh antes de o markOk ser gravado).
  //
  // Segurança: o nome da tabela é derivado do campo `model` que vem do banco
  // (populado pelo worker a partir de MODEL_CATALOG, lista fixa de constantes) ,
  // não há superfície de injeção SQL via input do usuário.
  const rowsWithLiveCount = await Promise.all(
    rows.map(async (row) => {
      const table = rawTableName(row.model);
      try {
        const result = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
          `SELECT COUNT(*) AS count FROM "${table}" WHERE "raw_deleted" = false`,
        );
        const liveCount = Number(result[0]?.count ?? 0);
        return { ...row, recordCount: liveCount };
      } catch {
        // Tabela raw ainda não existe (modelo nunca sincronizado) → 0 sem quebrar.
        return { ...row, recordCount: 0 };
      }
    }),
  );

  return rowsWithLiveCount;
}

export interface FatoStateRow {
  nome: string;
  dominio: string;
  modo: FatoModo;
  fonte: string;
  recordCount: number;
  ultimoBuildAt: Date | null;
  /** "ok" = já reconstruído ao menos uma vez; "rodando" = ainda não buildado. */
  status: "ok" | "rodando";
}

/**
 * Estado da camada de fatos (derivada). Espelha getSyncState, mas para os
 * fato_*: usa o FATO_CATALOG como lista canônica, conta cada tabela ao vivo e
 * lê o último build de fato_build_state. Um fato sem registro em
 * fato_build_state nunca foi construído pelo worker → status "rodando".
 *
 * Segurança: o nome da tabela vem do FATO_CATALOG (constantes fixas), não de
 * input do usuário → sem superfície de injeção em $queryRawUnsafe.
 */
export async function getFatosState(): Promise<FatoStateRow[]> {
  const me = await getCurrentUser();
  if (!me || me.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }

  const builds = await prisma.fatoBuildState.findMany();
  const buildPorFato = new Map(builds.map((b) => [b.fato, b.ultimoBuildAt]));

  return Promise.all(
    FATO_CATALOG.map(async (f) => {
      let recordCount = 0;
      try {
        const result = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
          `SELECT COUNT(*) AS count FROM "${f.nome}"`,
        );
        recordCount = Number(result[0]?.count ?? 0);
      } catch {
        // Tabela ainda não existe (migration não aplicada) → 0 sem quebrar.
        recordCount = 0;
      }
      const ultimoBuildAt = buildPorFato.get(f.nome) ?? null;
      return {
        nome: f.nome,
        dominio: f.dominio,
        modo: f.modo,
        fonte: f.fonte,
        recordCount,
        ultimoBuildAt,
        status: ultimoBuildAt ? ("ok" as const) : ("rodando" as const),
      };
    }),
  );
}

export async function updateSyncConfig(input: unknown) {
  const me = await getCurrentUser();
  if (!me || me.platformRole !== "super_admin") {
    throw new Error("Acesso negado");
  }
  const parsed = syncConfigSchema.parse(input);
  for (const [field, key] of Object.entries(KEY_OF)) {
    await prisma.appSetting.upsert({
      where: { key },
      update: {
        value: parsed[field as keyof typeof parsed],
        updatedById: me.id,
      },
      create: {
        key,
        value: parsed[field as keyof typeof parsed],
        category: "sync",
        updatedById: me.id,
      },
    });
  }
  // O corte manda na plataforma inteira: derruba o cache de processo para o valor novo
  // valer na proxima consulta (dashboard, relatorios e agente).
  invalidarCacheCorte();
  await logAudit({
    userId: me.id,
    action: "setting_updated",
    targetType: "sync_config",
    details: { scope: "sync", ...parsed },
  });
  return { ok: true };
}
