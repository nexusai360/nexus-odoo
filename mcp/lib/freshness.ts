// mcp/lib/freshness.ts
//
// A checagem "builder nunca rodou → preparando" existe em **dois lugares** com
// contratos distintos mas semântica idêntica:
//   - `estadoDoFato` em `src/lib/actions/report-data.ts` (wrapper F3, devolve
//     `{ estado: 'preparando', dados: vazio, freshness }`)
//   - `withFreshness` aqui (MCP, devolve `{ estado: 'preparando' }` sem `dados`)
//
// Ambas seguem a **regra multi-fato da spec 3.9**: se **qualquer** fato
// consultado não tem `FatoBuildState`, vale "preparando". O wrapper F3 hoje
// consulta **um** fato por relatório; `withFreshness` recebe uma **lista**.
// Se a regra multi-fato mudar, **os dois pontos devem ser atualizados juntos**.
//
// A função `estadoPreparando(prisma, fatos)` exportada por este módulo é o
// helper compartilhado da regra — `withFreshness` a usa; um refactor futuro
// do wrapper F3 pode adotá-la também.

import type { PrismaClient } from "@/generated/prisma/client.js";

// ---------------------------------------------------------------------------
// FATO_FONTE — mapa fato → fonte do SyncState com modo
// ---------------------------------------------------------------------------
//
// Quando um fato é usado junto de outros, `fonteStatus` reporta a fonte
// **mais defasada** (a sync mais antiga). `mode` decide a coluna do `SyncState`:
//   `snapshot`    → `lastSnapshotAt`
//   `incremental` → `lastIncrementalAt`
// Fontes incrementais nunca preenchem `lastSnapshotAt` (achado N4).
// Confirmar o `model` de `estoque.extrato` contra `MODEL_CATALOG`.

export const FATO_FONTE: Record<string, { model: string; mode: "snapshot" | "incremental" }> = {
  fato_estoque_saldo:        { model: "estoque.saldo.hoje",       mode: "snapshot" },
  fato_estoque_movimento:    { model: "estoque.extrato",          mode: "incremental" },
  fato_produto_parado:       { model: "estoque.saldo.hoje",       mode: "snapshot" },
  fato_financeiro_saldo:     { model: "finan.banco.saldo.hoje",   mode: "snapshot" },
  fato_financeiro_movimento: { model: "finan.fluxo.caixa",        mode: "incremental" },
  fato_financeiro_titulo:    { model: "finan.pagamento.divida",   mode: "incremental" },
};

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

export type FreshnessEnvelope<O> =
  | { estado: "preparando" }
  | {
      estado: "ok" | "vazio";
      dados: O;
      atualizadoEm: string;
      fonteStatus: { status: string; ultimaSyncEm: string | null };
    };

// ---------------------------------------------------------------------------
// Helper: estadoPreparando
// ---------------------------------------------------------------------------

/**
 * Retorna `true` se **qualquer** fato da lista não tem `FatoBuildState`
 * (builder nunca rodou). Regra multi-fato da spec 3.9.
 */
export async function estadoPreparando(
  prisma: PrismaClient,
  fatos: string[],
): Promise<boolean> {
  const builds = await prisma.fatoBuildState.findMany({
    where: { fato: { in: fatos } },
    select: { fato: true, ultimoBuildAt: true },
  });
  const built = new Set(builds.map((b) => b.fato));
  return fatos.some((f) => !built.has(f));
}

// ---------------------------------------------------------------------------
// Nomes de arrays em ordem de prioridade (N12)
// ---------------------------------------------------------------------------
// `withFreshness` inspeciona `dados` para decidir "vazio": pega o primeiro
// array entre as chaves abaixo, por ordem. Se nenhum existir → "ok".
const ARRAY_KEYS_PRIORITY = ["linhas", "titulos", "serie", "contas", "top", "familia", "marca"] as const;

function extractFirstArray(dados: unknown): unknown[] | null {
  if (typeof dados !== "object" || dados === null) return null;
  const obj = dados as Record<string, unknown>;
  for (const key of ARRAY_KEYS_PRIORITY) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return null;
}

// ---------------------------------------------------------------------------
// withFreshness
// ---------------------------------------------------------------------------

/**
 * Wrapper de freshness para handlers do MCP.
 *
 * Contrato de retorno (achado C2):
 *   - Se algum fato não tem build → `{ estado: "preparando" }` (sem `dados`).
 *   - Caso contrário executa `fn()`, obtém `dados` e devolve:
 *     `{ estado: "ok" | "vazio", dados, atualizadoEm, fonteStatus }`.
 *
 * Decisão "vazio" (N12): inspeciona o primeiro array de `dados` conforme
 * `ARRAY_KEYS_PRIORITY`. Comprimento 0 → "vazio". Sem array → "ok".
 */
export async function withFreshness<O>(
  prisma: PrismaClient,
  fatos: string[],
  fn: () => Promise<O>,
): Promise<FreshnessEnvelope<O>> {
  // 1. Verificar se todos os fatos têm build
  const builds = await prisma.fatoBuildState.findMany({
    where: { fato: { in: fatos } },
    select: { fato: true, ultimoBuildAt: true },
  });
  const built = new Set(builds.map((b) => b.fato));
  if (fatos.some((f) => !built.has(f))) {
    return { estado: "preparando" };
  }

  // 2. Executar a função de negócio
  const dados = await fn();

  // 3. atualizadoEm = ISO do máximo dos ultimoBuildAt
  const maxBuildAt = builds.reduce((max, b) =>
    b.ultimoBuildAt > max ? b.ultimoBuildAt : max,
    builds[0]!.ultimoBuildAt,
  );
  const atualizadoEm = maxBuildAt.toISOString();

  // 4. fonteStatus = pior fonte (sync mais antiga)
  // Deduplica modelos (ex.: fato_estoque_saldo e fato_produto_parado → mesmo model)
  const modelosFatos = [...new Set(
    fatos
      .map((f) => FATO_FONTE[f])
      .filter((entry): entry is { model: string; mode: "snapshot" | "incremental" } => Boolean(entry)),
  )];

  const modelos = modelosFatos.map((e) => e.model);
  const syncStates = await prisma.syncState.findMany({
    where: { model: { in: modelos } },
    select: { model: true, lastStatus: true, lastSnapshotAt: true, lastIncrementalAt: true },
  });

  // Pior fonte: menor ultimaSyncEm
  let piorStatus = "ok";
  let piorSyncEm: Date | null = null;

  for (const fatoNome of fatos) {
    const fonte = FATO_FONTE[fatoNome];
    if (!fonte) continue;
    const ss = syncStates.find((s) => s.model === fonte.model);
    if (!ss) continue;

    const syncAt = fonte.mode === "snapshot" ? ss.lastSnapshotAt : ss.lastIncrementalAt;

    // Atualiza "pior" status
    if (ss.lastStatus !== "ok") piorStatus = ss.lastStatus as string;

    // Atualiza piorSyncEm: queremos a MENOR data (mais antiga)
    if (piorSyncEm === null || (syncAt !== null && syncAt < piorSyncEm)) {
      piorSyncEm = syncAt;
    } else if (syncAt === null) {
      piorSyncEm = null;
    }
  }

  const fonteStatus = {
    status: piorStatus,
    ultimaSyncEm: piorSyncEm ? piorSyncEm.toISOString() : null,
  };

  // 5. Decidir estado: vazio × ok
  const firstArr = extractFirstArray(dados);
  const estado: "ok" | "vazio" = firstArr !== null && firstArr.length === 0 ? "vazio" : "ok";

  return { estado, dados, atualizadoEm, fonteStatus };
}
