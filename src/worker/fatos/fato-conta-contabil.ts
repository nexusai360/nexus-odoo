// src/worker/fatos/fato-conta-contabil.ts
// FONTE: raw_contabil_conta (modelo contabil.conta , plano de contas).
// ESCOPO: estrutura hierárquica do plano de contas da Matrix Fitness Group.
//   Não há lançamento/movimento contábil no Odoo da Matrix , apenas a
//   estrutura de contas (tipo S=sintética, A=analítica).
// CAMPOS: id, codigo, nome, tipo, nivel, natureza, conta_superior_id (M2O),
//   parent_path, caracteristica_saldo, eh_redutora.
// CYCLE: incremental , 934 linhas, plano de contas muda raramente.
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoContaContabilRow {
  odooId: number;
  codigo: string;
  nome: string;
  tipo: string;
  nivel: number | null;
  natureza: string | null;
  contaPaiId: number | null;
  contaPaiNome: string | null;
  parentPath: string | null;
  caracteristicaSaldo: string | null;
  ehRedutora: boolean;
  // NÃO inclui atualizadoEm , campo tem @default(now()) no schema
}

export function mapContaContabilRow(raw: Record<string, unknown>): FatoContaContabilRow {
  return {
    odooId: Number(raw.id),
    codigo: typeof raw.codigo === "string" ? raw.codigo : "",
    nome: typeof raw.nome === "string" ? raw.nome : "",
    tipo: typeof raw.tipo === "string" ? raw.tipo : "",
    nivel: typeof raw.nivel === "number" ? raw.nivel : null,
    natureza: typeof raw.natureza === "string" ? raw.natureza : null,
    // conta_superior_id é M2O: [id, nome] ou false para conta raiz
    contaPaiId: relId(raw.conta_superior_id as OdooM2O),
    contaPaiNome: relNome(raw.conta_superior_id as OdooM2O),
    parentPath: typeof raw.parent_path === "string" ? raw.parent_path : null,
    caracteristicaSaldo: typeof raw.caracteristica_saldo === "string" ? raw.caracteristica_saldo : null,
    ehRedutora: raw.eh_redutora === true,
  };
}

/** Reconstrói fato_conta_contabil a partir de raw_contabil_conta. */
export async function rebuildFatoContaContabil(
  prisma: PrismaClient,
): Promise<number> {
  const rawRows = await prisma.rawContabilConta.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapContaContabilRow(r.data as Record<string, unknown>),
  );
  await prisma.$transaction(async (tx) => {
    await tx.fatoContaContabil.deleteMany({});
    if (mapped.length) {
      await tx.fatoContaContabil.createMany({ data: mapped });
    }
    await markFatoBuilt(tx, "fato_conta_contabil");
  });
  return mapped.length;
}
