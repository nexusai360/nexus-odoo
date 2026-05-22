// src/worker/fatos/fato-certificado.ts
// FONTE: raw_sped_certificado (modelo sped.certificado).
// ESCOPO: certificados digitais (e-CNPJ) das empresas. Os campos `senha` e
// `arquivo` NÃO são copiados (excludeFields no MODEL_CATALOG) — não chegam aqui.
// CYCLE: incremental — volume baixo (~11 certificados).
import type { PrismaClient } from "../../generated/prisma/client";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoCertificadoRow {
  odooId: number;
  tipo: string | null;
  numeroSerie: string | null;
  proprietario: string | null;
  cnpjCpf: string | null;
  dataInicioValidade: Date | null;
  dataFimValidade: Date | null;
  dataVencimentoUtil: Date | null;
  nomeArquivo: string | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string" || v.length < 8) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapCertificadoRow(raw: Record<string, unknown>): FatoCertificadoRow {
  return {
    odooId: Number(raw.id),
    tipo: str(raw.tipo),
    numeroSerie: str(raw.numero_serie),
    proprietario: str(raw.proprietario),
    cnpjCpf: str(raw.cnpj_cpf),
    dataInicioValidade: dateOrNull(raw.data_inicio_validade),
    dataFimValidade: dateOrNull(raw.data_fim_validade),
    dataVencimentoUtil: dateOrNull(raw.data_vencimento_util),
    nomeArquivo: str(raw.nome_arquivo),
  };
}

/** Reconstrói fato_certificado a partir de raw_sped_certificado. */
export async function rebuildFatoCertificado(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedCertificado.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapCertificadoRow(r.data as Record<string, unknown>),
  );
  await prisma.$transaction(async (tx) => {
    await tx.fatoCertificado.deleteMany({});
    if (mapped.length) {
      await tx.fatoCertificado.createMany({ data: mapped });
    }
    await markFatoBuilt(tx, "fato_certificado");
  });
  return mapped.length;
}
