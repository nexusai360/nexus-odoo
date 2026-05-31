// B3 (cobrança bancária): builder de cheques. Estrutural (0 reg hoje; auto-ativa).
// Fonte: raw_finan_cheque (modelo finan.cheque).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { str, num, dt } from "./_coerce";

export interface FatoChequeRow {
  odooId: number;
  codigo: string | null;
  codigoBarras: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  numero: string | null;
  titularNome: string | null;
  titularCnpjCpf: string | null;
  data: Date | null;
  dataEntrada: Date | null;
  dataPreDatado: Date | null;
  valor: number;
  empresaId: number | null;
  cnpjCpf: string | null;
  participanteId: number | null;
  participanteNome: string | null;
}

export function mapChequeRow(raw: Record<string, unknown>): FatoChequeRow {
  return {
    odooId: Number(raw.id),
    codigo: str(raw.codigo),
    codigoBarras: str(raw.codigo_barras),
    banco: str(raw.banco),
    agencia: str(raw.agencia),
    conta: str(raw.conta),
    numero: str(raw.numero),
    titularNome: str(raw.titular_nome),
    titularCnpjCpf: str(raw.titular_cnpj_cpf),
    data: dt(raw.data),
    dataEntrada: dt(raw.data_entrada),
    dataPreDatado: dt(raw.data_pre_datado),
    valor: num(raw.valor),
    empresaId: relId(raw.empresa_id as OdooM2O),
    cnpjCpf: str(raw.cnpj_cpf),
    participanteId: relId(raw.participante_id as OdooM2O),
    participanteNome: relNome(raw.participante_id as OdooM2O),
  };
}

export async function rebuildFatoCheque(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawFinanCheque.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapChequeRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoCheque.deleteMany({});
      if (mapped.length) await tx.fatoCheque.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_cheque");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
