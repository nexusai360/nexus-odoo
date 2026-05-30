// src/worker/fatos/fato-dfe.ts
// Builder do fato_dfe , fonte: raw_sped_consulta_dfe_item (modelo
// sped.consulta.dfe.item). 1 linha = 1 DF-e de fornecedor capturado
// eletronicamente (manifestacao do destinatario). Distinto de fato_nota_fiscal
// (documentos proprios). Ver SPEC docs/superpowers/specs/2026-05-29-o1-sped-fiscal-spec.md.
//
// Decisoes aterradas no dado real (PLAN Task 0):
// - cycle incremental (sped.consulta.dfe.item tem write_date).
// - numero vem como float no Odoo (48) , convertido para string.
// - participante_id/vr_nf costumam vir false/0; agregacao real e por cnpj_cpf.
// - manifestacao e char livre ("conhecido"/vazio); "pendente" = vazio.
// - consultaId guarda o id do LOTE (sped.consulta.dfe), nao a empresa.
// Valores monetarios via Number(... ?? 0). mapper nao produz atualizadoEm (@default(now())).

import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoDfeRow {
  odooId: number;
  chave: string | null;
  numero: string | null;
  modelo: string | null;
  cnpjFornecedor: string | null;
  fornecedorId: number | null;
  fornecedorNome: string | null;
  vrNf: number;
  dataEmissao: Date | null;
  dataRecebimento: Date | null;
  manifestacao: string | null;
  podeManifestar: boolean;
  consultaId: number | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Converte numero (float no Odoo) ou char para string; false/null/"" vira null. */
const numStr = (v: unknown): string | null => {
  if (v == null || v === false || v === "") return null;
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return null;
};

/** data_hora_* vem como "YYYY-MM-DD HH:MM:SS"; false/null/"" vira null. */
const dt = (v: unknown): Date | null =>
  typeof v === "string" && v ? new Date(v.replace(" ", "T")) : null;

export function mapDfeRow(raw: Record<string, unknown>): FatoDfeRow {
  return {
    odooId: Number(raw.id),
    chave: str(raw.chave),
    numero: numStr(raw.numero),
    modelo: str(raw.modelo),
    cnpjFornecedor: str(raw.cnpj_cpf),
    fornecedorId: relId(raw.participante_id as OdooM2O),
    fornecedorNome: relNome(raw.participante_id as OdooM2O),
    vrNf: Number(raw.vr_nf ?? 0),
    dataEmissao: dt(raw.data_hora_emissao),
    dataRecebimento: dt(raw.data_hora_recebimento),
    manifestacao: str(raw.manifestacao),
    podeManifestar: raw.pode_manifestar === true,
    consultaId: relId(raw.consulta_id as OdooM2O),
  };
}

export async function rebuildFatoDfe(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawSpedConsultaDfeItem.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) => mapDfeRow(r.data as Record<string, unknown>));

  await prisma.$transaction(
    async (tx) => {
      await tx.fatoDfe.deleteMany({});
      if (mapped.length) {
        await tx.fatoDfe.createMany({ data: mapped });
      }
      await markFatoBuilt(tx, "fato_dfe");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );

  return mapped.length;
}
