// B2 (onda fiscal complementar): builder do evento REINF (obrigação acessória).
// Estrutural (0 reg hoje). Fonte: raw_reinf_evento (modelo reinf.evento).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoReinfEventoRow {
  odooId: number;
  chave: string | null;
  tipo: string | null;
  situacao: string | null;
  protocoloTransmissao: string | null;
  empresaId: number | null;
  empresaCnpjRaiz: string | null;
  dataEvento: Date | null;
  dataInicial: Date | null;
  dataFinal: Date | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const dt = (v: unknown): Date | null =>
  typeof v === "string" && v ? new Date(v.replace(" ", "T")) : null;

export function mapReinfEventoRow(raw: Record<string, unknown>): FatoReinfEventoRow {
  return {
    odooId: Number(raw.id),
    chave: str(raw.chave),
    tipo: str(raw.tipo),
    situacao: str(raw.situacao),
    protocoloTransmissao: str(raw.protocolo_transmissao),
    empresaId: relId(raw.empresa_id as OdooM2O),
    empresaCnpjRaiz: str(raw.empresa_cnpj_cpf_raiz),
    dataEvento: dt(raw.data_evento) ?? dt(raw.data_hora_evento),
    dataInicial: dt(raw.data_inicial),
    dataFinal: dt(raw.data_final),
  };
}

export async function rebuildFatoReinfEvento(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawReinfEvento.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapReinfEventoRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoReinfEvento.deleteMany({});
      if (mapped.length) await tx.fatoReinfEvento.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_reinf_evento");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
