// src/worker/fatos/fato-nota-fiscal-item.ts
// Builder do fato_nota_fiscal_item — fonte: raw_sped_documento_item.
//
// Estratégia de STREAMING por cursor (C-1/C-2 fix — 2026-05-18):
//   - notaInfoMap: carrega raw_sped_documento inteiro (3743 linhas — trivial, ok).
//   - Transação ÚNICA: deleteMany + loop cursor por páginas de 5000 + markFatoBuilt.
//   - Cada página: findMany(take:5000, cursor/skip:1), mapeia, createMany, DESCARTA.
//   - Memória plana (~5000 linhas por iteração). Sem --max-old-space-size.
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
 * STREAMING por cursor com batch transactions:
 *   1. deleteMany em tx atômica própria.
 *   2. Loop cursor-paginado (take:5000): cada página lida, mapeada, inserida em
 *      sua própria mini-tx atômica e descartada — memória fica plana (~5000 linhas).
 *   3. markFatoBuilt em tx atômica própria ao final.
 *
 * Evita a $transaction interativa de longa duração sobre 211k registros que causa
 * acúmulo de buffers de protocolo pg (heap > 2 GB). Com batch transactions, o GC
 * coleta entre chunks e o heap fica constante (~50–100 MB). Sem --max-old-space-size.
 *
 * Idempotência: se o processo morrer entre os inserts, o próximo rebuild começa com
 * deleteMany novamente — comportamento correto para um builder full-rebuild.
 */
export async function rebuildFatoNotaFiscalItem(prisma: PrismaClient): Promise<number> {
  // 1. Construir notaInfoMap (3743 linhas — pode carregar inteiro, ok)
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

  // 2. deleteMany em tx própria
  await prisma.fatoNotaFiscalItem.deleteMany({});

  // 3. Loop cursor-paginado: lê → mapeia → insere (mini-tx) → descarta
  let totalInserted = 0;
  let cursorOdooId: number | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    let page: Awaited<ReturnType<typeof prisma.rawSpedDocumentoItem.findMany>>;
    if (cursorOdooId !== undefined) {
      page = await prisma.rawSpedDocumentoItem.findMany({
        where: { rawDeleted: false },
        orderBy: { odooId: "asc" },
        take: CHUNK_SIZE,
        cursor: { odooId: cursorOdooId },
        skip: 1,
      });
    } else {
      page = await prisma.rawSpedDocumentoItem.findMany({
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

    // Mini-tx: insert atômico do chunk, descarta após commit
    await prisma.fatoNotaFiscalItem.createMany({ data: mappedPage });
    totalInserted += mappedPage.length;

    // Avançar cursor — descarta a página (não acumula)
    cursorOdooId = page[page.length - 1]!.odooId;

    // Página menor que CHUNK_SIZE: última página
    if (page.length < CHUNK_SIZE) {
      hasMore = false;
    }
  }

  // 4. Marcar built em tx própria
  await markFatoBuilt(prisma, "fato_nota_fiscal_item");

  return totalInserted;
}
