// src/worker/fatos/fato-servico.ts
// FONTE: raw_sped_servico (modelo sped.servico).
// ESCOPO: catálogo de serviços fiscais (lista de serviços da LC 116).
// CYCLE: incremental , ~340 serviços, mudam raramente.
import type { PrismaClient } from "../../generated/prisma/client";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoServicoRow {
  odooId: number;
  codigo: string;
  codigoFormatado: string | null;
  descricao: string;
  codigoTributacao: string | null;
  alInssRetido: number;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function mapServicoRow(raw: Record<string, unknown>): FatoServicoRow {
  return {
    odooId: Number(raw.id),
    codigo: str(raw.codigo) ?? "",
    codigoFormatado: str(raw.codigo_formatado),
    descricao: str(raw.descricao) ?? "",
    codigoTributacao: str(raw.codigo_tributacao),
    alInssRetido:
      typeof raw.al_inss_retido === "number" && Number.isFinite(raw.al_inss_retido)
        ? raw.al_inss_retido
        : 0,
  };
}

/** Reconstrói fato_servico a partir de raw_sped_servico. */
export async function rebuildFatoServico(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedServico.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) => mapServicoRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoServico.deleteMany({});
      if (mapped.length) {
        await tx.fatoServico.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_servico");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
