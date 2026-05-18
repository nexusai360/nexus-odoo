// src/worker/fatos/fato-nota-fiscal-item.ts
// Builder do fato_nota_fiscal_item — fonte: raw_sped_documento_item.
//
// Estratégia (decisão do orquestrador 2026-05-18):
//   - Leitura de raw_sped_documento e raw_sped_documento_item ANTES da transação
//     (fora, para não esgotar heap/timeout da transação no findMany de 211k linhas).
//   - Transação ÚNICA: deleteMany + loop de createMany em chunks de 5000 + markFatoBuilt.
//   - CHUNK_SIZE = 5000 (constante nomeada — R2-M4).
//   - chunk() é exportado deste arquivo (R2-M4); futuras ondas importam daqui.
//   - Desnormalização: dataEmissao e entradaSaida vêm da nota-mãe via notaInfoMap.
//   - Mapper não produz atualizadoEm (@default(now()) no schema).
//   - Filtra rawDeleted=false em ambas as fontes.

import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

/** Tamanho de cada página de createMany dentro da transação. */
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
 * Leitura das fontes ocorre ANTES da transação (evita OOM / timeout de tx).
 * Transação única: deleteMany + createMany chunked + markFatoBuilt.
 * Timeout amplo (600000ms / 10 min) para suportar 211k registros.
 */
export async function rebuildFatoNotaFiscalItem(prisma: PrismaClient): Promise<number> {
  // 1. Construir notaInfoMap (só 3743 linhas — pode carregar inteiro)
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

  // 2. Ler itens fora da transação (211k linhas — evita OOM dentro da tx)
  const rawItems = await prisma.rawSpedDocumentoItem.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawItems.map((r) =>
    mapNotaFiscalItemRow(r.data as Record<string, unknown>, notaInfoMap),
  );

  // 3. Transação única: delete + createMany chunked + markFatoBuilt
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoNotaFiscalItem.deleteMany({});

      const chunks = chunk(mapped, CHUNK_SIZE);
      for (const chunkArr of chunks) {
        if (chunkArr.length) {
          await tx.fatoNotaFiscalItem.createMany({ data: chunkArr });
        }
      }

      await markFatoBuilt(tx, "fato_nota_fiscal_item");
    },
    { timeout: 600_000, maxWait: 30_000 },
  );

  return mapped.length;
}
