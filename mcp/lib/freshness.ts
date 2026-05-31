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
// helper compartilhado da regra , `withFreshness` a usa; um refactor futuro
// do wrapper F3 pode adotá-la também.

import type { PrismaClient } from "@/generated/prisma/client.js";

// ---------------------------------------------------------------------------
// FATO_FONTE , mapa fato → fonte do SyncState com modo
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
  // Comercial (onda B) , model confirmado via SELECT model FROM sync_state
  fato_pedido:               { model: "pedido.documento",          mode: "incremental" },
  fato_pedido_parcela:       { model: "pedido.parcela",            mode: "incremental" },
  // Fiscal (onda C) , model confirmado via SELECT model FROM sync_state
  fato_nota_fiscal:          { model: "sped.documento",            mode: "incremental" },
  fato_nota_fiscal_item:     { model: "sped.documento.item",       mode: "incremental" },
  // O1 , DF-e de entrada (notas de fornecedores capturadas eletronicamente)
  fato_dfe:                  { model: "sped.consulta.dfe.item",    mode: "incremental" },
  // O3 , historico de etapas do pedido
  fato_pedido_historico:     { model: "pedido.documento.historico", mode: "incremental" },
  // O4 , itens do lancamento financeiro (DRE gerencial)
  fato_financeiro_lancamento_item: { model: "finan.lancamento.item", mode: "incremental" },
  // F4 L1a , expansão da base de leitura
  fato_preco:                { model: "sped.tabela.preco.regra",   mode: "incremental" },
  fato_servico:              { model: "sped.servico",              mode: "incremental" },
  fato_apuracao:             { model: "sped.apuracao",             mode: "incremental" },
  fato_carta_correcao:       { model: "sped.carta.correcao",        mode: "incremental" },
  // F4 L1c , resíduo operacional 4a
  fato_certificado:          { model: "sped.certificado",          mode: "incremental" },
  // F4 L1b , fato_referencia vem de 15 modelos; sped.ncm é o representativo p/ fonteStatus.
  fato_referencia:           { model: "sped.ncm",                  mode: "incremental" },
  // Cadastros (onda D) , model confirmado via SELECT model FROM sync_state
  fato_parceiro:             { model: "res.partner",               mode: "incremental" },
  // Contábil (onda E) , model confirmado via SELECT model FROM sync_state
  fato_conta_contabil:       { model: "contabil.conta",            mode: "incremental" },
  // B1 (onda contábil , movimento)
  fato_contabil_conta_referencial: { model: "contabil.conta.referencial", mode: "incremental" },
  fato_contabil_lancamento:        { model: "contabil.lancamento",        mode: "incremental" },
  fato_contabil_lancamento_item:   { model: "contabil.lancamento.item",   mode: "incremental" },
  // B2 (onda fiscal complementar)
  fato_mdfe:                       { model: "sped.mdfe",                  mode: "incremental" },
  fato_reinf_evento:               { model: "reinf.evento",              mode: "incremental" },
  // B3 (cobrança bancária)
  fato_retorno_item:               { model: "finan.retorno.item",         mode: "incremental" },
  fato_retorno_bancario:           { model: "finan.retorno",              mode: "incremental" },
  fato_remessa_bancaria:           { model: "finan.remessa",              mode: "incremental" },
  fato_carteira_cobranca:          { model: "finan.carteira",             mode: "incremental" },
  fato_cheque:                     { model: "finan.cheque",               mode: "incremental" },
  fato_pix:                        { model: "finan.pix",                  mode: "incremental" },
  // B4 (comercial: cotação + comissão)
  fato_cotacao:                    { model: "pedido.documento.cotacao",   mode: "incremental" },
  fato_comissao:                   { model: "pedido.comissao",            mode: "incremental" },
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
      /**
       * Texto humano pre-computado da idade do dado (ex.: "30s", "2min", "1h", "3 dias").
       * Adicionado em 2026-05-26 apos auditoria identificar 624 turnos (12.7%) com
       * placeholder "Xs" nao substituido pelo LLM. A computacao deterministica
       * server-side garante a substituicao correta. O prompt deve instruir a IA a
       * usar este campo TEXTUAL no lugar de calcular a partir de `atualizadoEm`.
       */
      atualizadoHa: string;
      fonteStatus: { status: string; ultimaSyncEm: string | null };
    };

/**
 * Converte um ISO timestamp em texto humano de idade (ex.: "30s", "2min", "1h", "3 dias").
 * Usado pelo `withFreshness` para pre-computar o campo `atualizadoHa`.
 */
export function formatAtualizadoHa(atualizadoEm: string, agora: Date = new Date()): string {
  const t = new Date(atualizadoEm).getTime();
  if (Number.isNaN(t)) return "indefinido";
  const deltaMs = Math.max(0, agora.getTime() - t);
  const s = Math.round(deltaMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d === 1 ? "1 dia" : `${d} dias`;
}

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
 * Decisão "vazio" (N12): por padrão, inspeciona o primeiro array de `dados`
 * conforme `ARRAY_KEYS_PRIORITY`. Comprimento 0 → "vazio". Sem array → "ok".
 *
 * @param isVazio Predicado opcional de "vazio" customizado. Quando fornecido,
 * substitui a lógica padrão de `ARRAY_KEYS_PRIORITY`. Use quando a semântica
 * de "vazio" depende de múltiplos arrays (ex.: concentracao, que exige ambos
 * `familia` e `marca` vazios para ser "vazio" , paridade com o dashboard F3).
 */
export async function withFreshness<O>(
  prisma: PrismaClient,
  fatos: string[],
  fn: () => Promise<O>,
  isVazio?: (dados: O) => boolean,
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

  // Pior fonte: menor ultimaSyncEm.
  // REGRA: se qualquer fonte tem syncAt=null (nunca sincronizou), o resultado
  // é null , independentemente da ordem de iteração. null é o pior caso absoluto
  // e jamais pode ser sobrescrito por uma data válida de outra fonte.
  let piorStatus = "ok";
  let piorSyncEm: Date | null | undefined = undefined; // undefined = "ainda não vimos nenhuma fonte"

  for (const fatoNome of fatos) {
    const fonte = FATO_FONTE[fatoNome];
    if (!fonte) continue;
    const ss = syncStates.find((s) => s.model === fonte.model);
    if (!ss) continue;

    const syncAt = fonte.mode === "snapshot" ? ss.lastSnapshotAt : ss.lastIncrementalAt;

    // Atualiza "pior" status
    if (ss.lastStatus !== "ok") piorStatus = ss.lastStatus as string;

    // Atualiza piorSyncEm: null (nunca sincronizou) vence qualquer data.
    // Uma vez que piorSyncEm seja null, não pode ser substituído.
    if (piorSyncEm === undefined) {
      piorSyncEm = syncAt; // primeira fonte
    } else if (piorSyncEm !== null) {
      // piorSyncEm tem valor; null ou data mais antiga vence
      if (syncAt === null || syncAt < piorSyncEm) {
        piorSyncEm = syncAt;
      }
    }
    // se piorSyncEm já é null, permanece null
  }

  // Se não encontramos nenhuma fonte no mapa, mantemos null como resultado seguro
  const piorSyncEmFinal: Date | null = piorSyncEm === undefined ? null : piorSyncEm;

  const fonteStatus = {
    status: piorStatus,
    ultimaSyncEm: piorSyncEmFinal ? piorSyncEmFinal.toISOString() : null,
  };

  // 5. Decidir estado: vazio × ok
  let estado: "ok" | "vazio";
  if (isVazio !== undefined) {
    estado = isVazio(dados) ? "vazio" : "ok";
  } else {
    const firstArr = extractFirstArray(dados);
    estado = firstArr !== null && firstArr.length === 0 ? "vazio" : "ok";
  }

  return {
    estado,
    dados,
    atualizadoEm,
    atualizadoHa: formatAtualizadoHa(atualizadoEm),
    fonteStatus,
  };
}
