// src/worker/fatos/fato-nota-fiscal-item.ts
// Builder do fato_nota_fiscal_item — fonte: raw_sped_documento_item.
//
// Estratégia: STREAMING por cursor DENTRO de uma transação única (2026-05-18):
//   - notaInfoMap: carrega raw_sped_documento inteiro (3743 linhas — trivial, ok).
//     Montado ANTES da transação, fora dela (leitura não precisa de atomicidade).
//   - Transação ÚNICA ($transaction, timeout 600s): deleteMany + loop cursor
//     por páginas de 5000 + markFatoBuilt — tudo dentro do mesmo callback tx.
//   - Cada página: tx.rawSpedDocumentoItem.findMany(take:5000, cursor/skip:1),
//     mapeia, tx.fatoNotaFiscalItem.createMany, DESCARTA a página.
//   - Memória plana (~5000 linhas por iteração). Sem --max-old-space-size.
//   - Atomicidade garantida pelo MVCC do Postgres: leitores concorrentes veem
//     o estado ANTERIOR completo até o COMMIT — sem janela de inconsistência.
//   - CHUNK_SIZE = 5000 (constante nomeada — R2-M4).
//   - chunk() mantido como utilitário exportado (R2-M4); a função principal
//     NÃO usa chunk() — usa o loop de cursor diretamente.
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
  // NÃO inclui atualizadoEm — @default(now()) no schema
}

export interface NotaInfo {
  dataEmissao: Date | null;
  entradaSaida: string | null;
}

/**
 * Fatia um array em chunks de `size` elementos.
 * Exportado deste arquivo (R2-M4) — importar daqui em ondas futuras.
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
  };
}

/**
 * Reconstrói fato_nota_fiscal_item a partir de raw_sped_documento_item.
 *
 * STREAMING por cursor DENTRO de uma transação única:
 *   1. notaInfoMap montado fora da transação (leitura de raw_sped_documento —
 *      3743 linhas, ok carregar inteiro; não precisa de atomicidade).
 *   2. $transaction(timeout:600s, maxWait:60s):
 *      a. tx.fatoNotaFiscalItem.deleteMany({})
 *      b. Loop cursor-paginado (take:5000): lê página via tx.rawSpedDocumentoItem,
 *         mapeia, tx.fatoNotaFiscalItem.createMany, DESCARTA a página.
 *      c. markFatoBuilt(tx, ...) — commita junto com os dados.
 *
 * Propriedades:
 *   - Atomicidade: leitores concorrentes via MVCC do Postgres veem o estado
 *     ANTERIOR completo até o COMMIT — sem janela de inconsistência (SPEC v3 §3.2 N2).
 *   - Memória plana: cada página (~5000 itens JSONB) é descartada após o createMany;
 *     o GC coleta entre chunks. Heap constante sem --max-old-space-size.
 *   - Timeout 600s cobre amplamente o rebuild de ~40s; maxWait 60s para aquisição de tx.
 */
export async function rebuildFatoNotaFiscalItem(prisma: PrismaClient): Promise<number> {
  // 1. Construir notaInfoMap FORA da transação (3743 linhas — trivial)
  const rawNotas = await prisma.rawSpedDocumento.findMany({
    where: { rawDeleted: false },
  });
  const notaInfoMap = new Map<number, NotaInfo>();
  for (const r of rawNotas) {
    const data = r.data as Record<string, unknown>;
    const odooId = Number(data.id);
    notaInfoMap.set(odooId, {
      dataEmissao: typeof data.data_emissao === "string"
        ? new Date(`${data.data_emissao}T00:00:00`)
        : null,
      entradaSaida: typeof data.entrada_saida === "string" ? data.entrada_saida : null,
    });
  }

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

      // 2c. Marcar built dentro da mesma transação — commita junto
      await markFatoBuilt(tx, "fato_nota_fiscal_item");

      return inserted;
    },
    { timeout: 600_000, maxWait: 60_000 },
  );

  return totalInserted;
}
