// src/worker/fatos/fato-nota-fiscal-item.ts
// Builder do fato_nota_fiscal_item , fonte: raw_sped_documento_item.
//
// Estratégia: STREAMING por cursor DENTRO de uma transação única (2026-05-18):
//   - notaInfoMap: carrega raw_sped_documento inteiro (3743 linhas , trivial, ok).
//     Montado ANTES da transação, fora dela (leitura não precisa de atomicidade).
//   - Transação ÚNICA ($transaction, timeout 600s): deleteMany + loop cursor
//     por páginas de 5000 + markFatoBuilt , tudo dentro do mesmo callback tx.
//   - Cada página: tx.rawSpedDocumentoItem.findMany(take:5000, cursor/skip:1),
//     mapeia, tx.fatoNotaFiscalItem.createMany, DESCARTA a página.
//   - Memória plana (~5000 linhas por iteração). Sem --max-old-space-size.
//   - Atomicidade garantida pelo MVCC do Postgres: leitores concorrentes veem
//     o estado ANTERIOR completo até o COMMIT , sem janela de inconsistência.
//   - CHUNK_SIZE = 5000 (constante nomeada , R2-M4).
//   - chunk() mantido como utilitário exportado (R2-M4); a função principal
//     NÃO usa chunk() , usa o loop de cursor diretamente.
//   - Desnormalização: dataEmissao e entradaSaida vêm da nota-mãe via notaInfoMap.
//   - Mapper não produz atualizadoEm (@default(now()) no schema).
//   - Filtra rawDeleted=false em ambas as fontes.

import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

/** Tamanho de cada página de cursor/createMany dentro da transação. */
export const CHUNK_SIZE = 5000;

export interface FatoNotaFiscalItemRow {
  odooId: number;
  documentoId: number | null;
  produtoId: number | null;
  produtoNome: string | null;
  cfopId: number | null;
  cfopNome: string | null;
  quantidade: number;
  vrUnitario: number;
  vrProdutos: number;
  vrNf: number;
  vrIcmsProprio: number;
  vrPisProprio: number;
  vrCofinsProprio: number;
  // Desnormalizados da nota-mãe (achado N8)
  dataEmissao: Date | null;
  entradaSaida: string | null;
  // Desnormalizados da nota-mãe (F1: corte por empresa e operação no nível do item)
  empresaId: number | null;
  situacaoNfe: string | null;
  // Desnormalizados da nota-mãe: aplicam a regra "só venda" (operação venda, não interna,
  // sem devolução) no grão de item, sem join com fato_nota_fiscal.
  operacaoId: number | null;
  operacaoNome: string | null;
  finalidadeNfe: string | null;
  // NÃO inclui atualizadoEm , @default(now()) no schema
}

export interface NotaInfo {
  dataEmissao: Date | null;
  entradaSaida: string | null;
  empresaId: number | null;
  situacaoNfe: string | null;
  operacaoId: number | null;
  operacaoNome: string | null;
  finalidadeNfe: string | null;
}

/**
 * Fatia um array em chunks de `size` elementos.
 * Exportado deste arquivo (R2-M4) , importar daqui em ondas futuras.
 * Nota: rebuildFatoNotaFiscalItem usa cursor de paginação, não chunk().
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Mapeia uma linha de raw_sped_documento_item para FatoNotaFiscalItemRow.
 * Desnormaliza dataEmissao/entradaSaida a partir do notaInfoMap.
 */
export function mapNotaFiscalItemRow(
  raw: Record<string, unknown>,
  notaInfoMap: Map<number, NotaInfo>,
): FatoNotaFiscalItemRow {
  const documentoId = relId(raw.documento_id as OdooM2O);
  const notaInfo = documentoId !== null ? notaInfoMap.get(documentoId) : undefined;

  return {
    odooId: Number(raw.id),
    documentoId,
    produtoId: relId(raw.produto_id as OdooM2O),
    produtoNome: relNome(raw.produto_id as OdooM2O),
    cfopId: relId(raw.cfop_id as OdooM2O),
    cfopNome: relNome(raw.cfop_id as OdooM2O),
    quantidade: Number(raw.quantidade ?? 0),
    vrUnitario: Number(raw.vr_unitario ?? 0),
    vrProdutos: Number(raw.vr_produtos ?? 0),
    vrNf: Number(raw.vr_nf ?? 0),
    vrIcmsProprio: Number(raw.vr_icms_proprio ?? 0),
    vrPisProprio: Number(raw.vr_pis_proprio ?? 0),
    vrCofinsProprio: Number(raw.vr_cofins_proprio ?? 0),
    // Desnormalizados da nota-mãe
    dataEmissao: notaInfo?.dataEmissao ?? null,
    entradaSaida: notaInfo?.entradaSaida ?? null,
    empresaId: notaInfo?.empresaId ?? null,
    situacaoNfe: notaInfo?.situacaoNfe ?? null,
    operacaoId: notaInfo?.operacaoId ?? null,
    operacaoNome: notaInfo?.operacaoNome ?? null,
    finalidadeNfe: notaInfo?.finalidadeNfe ?? null,
  };
}

/**
 * Reconstrói fato_nota_fiscal_item a partir de raw_sped_documento_item.
 *
 * STREAMING por cursor DENTRO de uma transação única:
 *   1. notaInfoMap montado fora da transação (leitura de raw_sped_documento ,
 *      3743 linhas, ok carregar inteiro; não precisa de atomicidade).
 *   2. $transaction(timeout:600s, maxWait:60s):
 *      a. tx.fatoNotaFiscalItem.deleteMany({})
 *      b. Loop cursor-paginado (take:5000): lê página via tx.rawSpedDocumentoItem,
 *         mapeia, tx.fatoNotaFiscalItem.createMany, DESCARTA a página.
 *      c. markFatoBuilt(tx, ...) , commita junto com os dados.
 *
 * Propriedades:
 *   - Atomicidade: leitores concorrentes via MVCC do Postgres veem o estado
 *     ANTERIOR completo até o COMMIT , sem janela de inconsistência (SPEC v3 §3.2 N2).
 *   - Memória plana: cada página (~5000 itens JSONB) é descartada após o createMany;
 *     o GC coleta entre chunks. Heap constante sem --max-old-space-size.
 *   - Timeout 600s cobre amplamente o rebuild de ~40s; maxWait 60s para aquisição de tx.
 */
/** Colunas da nota-mãe extraídas do jsonb , só o que o notaInfoMap usa. */
interface NotaMaeRow {
  id: number;
  data_emissao: string | null;
  entrada_saida: string | null;
  empresa_id: number | null;
  situacao_nfe: string | null;
  operacao_id: number | null;
  operacao_nome: string | null;
  finalidade_nfe: string | null;
}

/**
 * Carrega o notaInfoMap (7 campos da nota-mãe) extraindo colunas do jsonb no Postgres,
 * sem trazer o `data` inteiro para o heap (evita o OOM histórico). Se `notaIds` for
 * passado, carrega SÓ essas notas (build incremental); senão, todas (full rebuild).
 */
async function carregarNotaInfoMap(
  prisma: PrismaClient,
  notaIds?: number[],
): Promise<Map<number, NotaInfo>> {
  // Full (sem notaIds): mantém o $queryRaw (template) original. Incremental (com notaIds):
  // $queryRawUnsafe com a lista de ids inteiros (coeridos por Number(), sem injeção).
  const rawNotas =
    notaIds && notaIds.length
      ? await prisma.$queryRawUnsafe<NotaMaeRow[]>(`
    SELECT
      odoo_id                                        AS id,
      NULLIF(data->>'data_emissao', '')              AS data_emissao,
      NULLIF(data->>'entrada_saida', '')             AS entrada_saida,
      CASE WHEN jsonb_typeof(data->'empresa_id') = 'array'
           THEN (data->'empresa_id'->>0)::int END    AS empresa_id,
      NULLIF(data->>'situacao_nfe', '')              AS situacao_nfe,
      CASE WHEN jsonb_typeof(data->'operacao_id') = 'array'
           THEN (data->'operacao_id'->>0)::int END   AS operacao_id,
      CASE WHEN jsonb_typeof(data->'operacao_id') = 'array'
           THEN data->'operacao_id'->>1 END          AS operacao_nome,
      NULLIF(data->>'finalidade_nfe', '')            AS finalidade_nfe
    FROM raw_sped_documento
    WHERE coalesce(raw_deleted, false) = false
      AND odoo_id = ANY(ARRAY[${notaIds.map((n) => Number(n)).join(",")}]::bigint[])`)
      : await prisma.$queryRaw<NotaMaeRow[]>`
    SELECT
      odoo_id                                        AS id,
      NULLIF(data->>'data_emissao', '')              AS data_emissao,
      NULLIF(data->>'entrada_saida', '')             AS entrada_saida,
      CASE WHEN jsonb_typeof(data->'empresa_id') = 'array'
           THEN (data->'empresa_id'->>0)::int END    AS empresa_id,
      NULLIF(data->>'situacao_nfe', '')              AS situacao_nfe,
      CASE WHEN jsonb_typeof(data->'operacao_id') = 'array'
           THEN (data->'operacao_id'->>0)::int END   AS operacao_id,
      CASE WHEN jsonb_typeof(data->'operacao_id') = 'array'
           THEN data->'operacao_id'->>1 END          AS operacao_nome,
      NULLIF(data->>'finalidade_nfe', '')            AS finalidade_nfe
    FROM raw_sped_documento
    WHERE coalesce(raw_deleted, false) = false`;

  const notaInfoMap = new Map<number, NotaInfo>();
  for (const r of rawNotas) {
    notaInfoMap.set(Number(r.id), {
      dataEmissao:
        typeof r.data_emissao === "string" ? new Date(`${r.data_emissao}T00:00:00Z`) : null,
      entradaSaida: r.entrada_saida,
      empresaId: r.empresa_id,
      situacaoNfe: r.situacao_nfe,
      operacaoId: r.operacao_id,
      operacaoNome: r.operacao_nome,
      finalidadeNfe: r.finalidade_nfe,
    });
  }
  return notaInfoMap;
}

export async function rebuildFatoNotaFiscalItem(prisma: PrismaClient): Promise<number> {
  // 1. Construir notaInfoMap FORA da transação (todas as notas). Ver carregarNotaInfoMap
  //    para o motivo de extrair colunas do jsonb (OOM histórico com o `data` inteiro).
  const notaInfoMap = await carregarNotaInfoMap(prisma);

  // 2. Transação única: delete → streaming cursor → markFatoBuilt
  const totalInserted = await prisma.$transaction(
    async (tx) => {
      // 2a. Limpar tabela de destino
      await tx.fatoNotaFiscalItem.deleteMany({});

      // 2b. Loop de cursor: cada página lida, mapeada, inserida e descartada
      let inserted = 0;
      let cursorOdooId: number | undefined = undefined;
      let hasMore = true;

      while (hasMore) {
        let page: Awaited<ReturnType<typeof tx.rawSpedDocumentoItem.findMany>>;
        if (cursorOdooId !== undefined) {
          page = await tx.rawSpedDocumentoItem.findMany({
            where: { rawDeleted: false },
            orderBy: { odooId: "asc" },
            take: CHUNK_SIZE,
            cursor: { odooId: cursorOdooId },
            skip: 1,
          });
        } else {
          page = await tx.rawSpedDocumentoItem.findMany({
            where: { rawDeleted: false },
            orderBy: { odooId: "asc" },
            take: CHUNK_SIZE,
          });
        }

        if (page.length === 0) {
          hasMore = false;
          break;
        }

        const mappedPage = page.map((r) =>
          mapNotaFiscalItemRow(r.data as Record<string, unknown>, notaInfoMap),
        );

        await tx.fatoNotaFiscalItem.createMany({ data: mappedPage });
        inserted += mappedPage.length;

        // Avançar cursor; descartar página (não acumula em memória)
        cursorOdooId = page[page.length - 1]!.odooId;

        // Página menor que CHUNK_SIZE: última página
        if (page.length < CHUNK_SIZE) {
          hasMore = false;
        }
      }

      // 2c. Marcar built dentro da mesma transação , commita junto
      await markFatoBuilt(tx, "fato_nota_fiscal_item");

      return inserted;
    },
    { timeout: 600_000, maxWait: 60_000 },
  );

  return totalInserted;
}

/**
 * Build INCREMENTAL de fato_nota_fiscal_item (otimização 2026-07-23): reprocessa só o
 * DELTA em vez de refazer as 232k linhas. Resultado idêntico ao full para as linhas
 * tocadas (delete+insert do subconjunto), validado por shadow-diff antes de virar padrão.
 *
 * Delta = 3 fontes (rawSources do gate = raw_sped_documento_item + raw_sped_documento):
 *   (1) item alterado: raw_sped_documento_item.synced_at > ultimoBuildAt, raw_deleted=false.
 *   (2) cascata da nota-mãe: item de nota cujo raw_sped_documento mudou (7 campos
 *       desnormalizados) , senão a mudança da nota não refletiria nos itens.
 *   (3) item deletado: raw_sped_documento_item.raw_deleted=true e synced_at > ultimoBuildAt.
 *
 * Escrita: delete dos ids (1∪2∪3) + insert de (1∪2). Cursor capturado ANTES das leituras;
 * ultimoBuildAt = cursor (não now), para o próximo delta não perder escrita concorrente.
 * Retorna o nº de itens re-inseridos.
 */
export async function rebuildFatoNotaFiscalItemIncremental(
  prisma: PrismaClient,
  ultimoBuildAt: Date,
): Promise<number> {
  const cursor = new Date(); // ANTES de qualquer leitura , âncora do delta

  // Notas-mãe alteradas (para a cascata desnormalizada dos 7 campos).
  const notasAlteradas = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT odoo_id AS id FROM raw_sped_documento WHERE synced_at > $1`,
    ultimoBuildAt,
  );
  const notaIdsAlteradas = notasAlteradas.map((n) => Number(n.id));

  // Cláusula "afetado" (item vivo alterado OU item de nota-mãe alterada). Sem params:
  // a lista de notas é inteira (Number()) , sem espaço para injeção.
  const filtroNotas = notaIdsAlteradas.length
    ? ` OR (CASE WHEN jsonb_typeof(data->'documento_id') = 'array'
              THEN (data->'documento_id'->>0)::bigint END)
            = ANY(ARRAY[${notaIdsAlteradas.join(",")}]::bigint[])`
    : "";
  const CLAUSULA_AFETADO = `coalesce(raw_deleted, false) = false AND (synced_at > $1${filtroNotas})`;

  // notaInfoMap COMPLETO (9.6k notas, colunas extraídas no Postgres , trivial e evita
  // ARRAY gigante). O que NÃO pode ir pro heap é o `data` dos ITENS (232k), que é streamado.
  const notaInfoMap = await carregarNotaInfoMap(prisma);

  // IDs a remover do fato: afetados (versão nova entra depois) + deletados. Só ints, leve.
  const idsRemoverRows = await prisma.$queryRawUnsafe<{ odoo_id: number }[]>(
    `SELECT odoo_id FROM raw_sped_documento_item
     WHERE (${CLAUSULA_AFETADO})
        OR (coalesce(raw_deleted, false) = true AND synced_at > $1)`,
    ultimoBuildAt,
  );
  const idsRemover = idsRemoverRows.map((r) => Number(r.odoo_id));

  const inserted = await prisma.$transaction(
    async (tx) => {
      // 1. Remove do fato os afetados (para reinserir) e os deletados.
      for (const lote of chunk(idsRemover, 10_000)) {
        await tx.fatoNotaFiscalItem.deleteMany({ where: { odooId: { in: lote } } });
      }

      // 2. Reinsere os afetados por STREAMING (página de CHUNK_SIZE, memória constante).
      let n = 0;
      let ultimoId = 0;
      for (;;) {
        const page = await tx.$queryRawUnsafe<{ odoo_id: number; data: unknown }[]>(
          `SELECT odoo_id, data FROM raw_sped_documento_item
           WHERE (${CLAUSULA_AFETADO}) AND odoo_id > $2
           ORDER BY odoo_id ASC LIMIT ${CHUNK_SIZE}`,
          ultimoBuildAt,
          ultimoId,
        );
        if (page.length === 0) break;
        const mapped = page.map((p) =>
          mapNotaFiscalItemRow(p.data as Record<string, unknown>, notaInfoMap),
        );
        await tx.fatoNotaFiscalItem.createMany({ data: mapped });
        n += mapped.length;
        ultimoId = Number(page[page.length - 1]!.odoo_id);
        if (page.length < CHUNK_SIZE) break;
      }

      // ultimoBuildAt = cursor (capturado ANTES das leituras).
      await markFatoBuilt(tx, "fato_nota_fiscal_item", cursor);
      return n;
    },
    { timeout: 600_000, maxWait: 60_000 },
  );

  return inserted;
}
