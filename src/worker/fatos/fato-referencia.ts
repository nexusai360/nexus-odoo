// src/worker/fatos/fato-referencia.ts
// FONTE: os 15 raw_* de lookup da L1b (ver GRUPO_A).
// ESCOPO: tabela unificada de referência (tabela, codigo, descricao).
// CYCLE: incremental.
import type { PrismaClient } from "../../generated/prisma/client";
import { markFatoBuilt } from "./fato-build-state";

export interface ReferenciaLinha {
  tabela: string;
  codigo: string;
  descricao: string | null;
}

type RawRef = { data: unknown };

/** Mapa das 15 tabelas de lookup: nome no fato + carregador do raw +
 * chaves de código e descrição dentro do JSONB `data`. */
export const GRUPO_A: {
  tabela: string;
  load: (p: PrismaClient) => Promise<RawRef[]>;
  codigo: string;
  descricao: string;
}[] = [
  { tabela: "ncm", load: (p) => p.rawSpedNcm.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "descricao" },
  { tabela: "cfop", load: (p) => p.rawSpedCfop.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "descricao" },
  { tabela: "cest", load: (p) => p.rawSpedCest.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "descricao" },
  { tabela: "cnae", load: (p) => p.rawSpedCnae.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "descricao" },
  { tabela: "nbs", load: (p) => p.rawSpedNbs.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "descricao" },
  { tabela: "natureza_operacao", load: (p) => p.rawSpedNaturezaOperacao.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "unidade", load: (p) => p.rawSpedUnidade.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "cst_icms", load: (p) => p.rawSpedCstIcms.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "cst_icms_sn", load: (p) => p.rawSpedCstIcmsSn.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "cst_ipi", load: (p) => p.rawSpedCstIpi.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "cst_pis_cofins", load: (p) => p.rawSpedCstPisCofins.findMany({ where: { rawDeleted: false } }), codigo: "codigo", descricao: "nome" },
  { tabela: "cst_cibs", load: (p) => p.rawSpedCstCibs.findMany({ where: { rawDeleted: false } }), codigo: "cst_cibs", descricao: "nome_cst_cibs" },
  { tabela: "municipio", load: (p) => p.rawSpedMunicipio.findMany({ where: { rawDeleted: false } }), codigo: "codigo_ibge", descricao: "nome" },
  { tabela: "pais", load: (p) => p.rawSpedPais.findMany({ where: { rawDeleted: false } }), codigo: "codigo_bacen", descricao: "nome" },
  { tabela: "estado", load: (p) => p.rawSpedEstado.findMany({ where: { rawDeleted: false } }), codigo: "uf", descricao: "nome" },
];

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === false) return null;
  const s = String(v);
  return s.length > 0 ? s : null;
}

/** Achata as linhas raw de UMA tabela em ReferenciaLinha[]. As chaves de
 * código e descrição vêm de GRUPO_A. Linha sem código vira código "". */
export function mapReferenciaRows(tabela: string, rows: RawRef[]): ReferenciaLinha[] {
  const cfg = GRUPO_A.find((g) => g.tabela === tabela);
  if (!cfg) throw new Error(`tabela de referência desconhecida: ${tabela}`);
  return rows.map((r) => {
    const data = r.data as Record<string, unknown>;
    return {
      tabela,
      codigo: str(data[cfg.codigo]) ?? "",
      descricao: str(data[cfg.descricao]),
    };
  });
}

/** Reconstrói fato_referencia a partir dos 15 raw_* de lookup. */
export async function rebuildFatoReferencia(prisma: PrismaClient): Promise<number> {
  const todas: ReferenciaLinha[] = [];
  for (const cfg of GRUPO_A) {
    const rows = await cfg.load(prisma);
    todas.push(...mapReferenciaRows(cfg.tabela, rows));
  }
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoReferencia.deleteMany({});
      if (todas.length) {
        await tx.fatoReferencia.createMany({ data: todas });
      }
      await markFatoBuilt(tx, "fato_referencia");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return todas.length;
}
