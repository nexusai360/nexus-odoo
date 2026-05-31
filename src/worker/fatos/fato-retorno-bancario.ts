// B3 (cobrança bancária): builder do retorno bancário (cabeçalho do arquivo).
// Fonte: raw_finan_retorno (modelo finan.retorno).
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { str, num, bool, dt } from "./_coerce";

export interface FatoRetornoBancarioRow {
  odooId: number;
  tipo: string | null;
  bancoId: number | null;
  bancoNome: string | null;
  cnpjCpfRaiz: string | null;
  carteiraId: number | null;
  numero: string | null;
  data: Date | null;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  dataInicialOfx: Date | null;
  dataFinalOfx: Date | null;
  caixaFechado: boolean;
}

export function mapRetornoBancarioRow(raw: Record<string, unknown>): FatoRetornoBancarioRow {
  return {
    odooId: Number(raw.id),
    tipo: str(raw.tipo),
    bancoId: relId(raw.banco_id as OdooM2O),
    bancoNome: relNome(raw.banco_id as OdooM2O),
    cnpjCpfRaiz: str(raw.cnpj_cpf_raiz),
    carteiraId: relId(raw.carteira_id as OdooM2O),
    numero: str(raw.numero),
    data: dt(raw.data),
    totalEntradas: num(raw.total_entradas),
    totalSaidas: num(raw.total_saidas),
    saldo: num(raw.saldo),
    dataInicialOfx: dt(raw.data_inicial_ofx),
    dataFinalOfx: dt(raw.data_final_ofx),
    caixaFechado: bool(raw.caixa_fechado),
  };
}

export async function rebuildFatoRetornoBancario(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawFinanRetorno.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapRetornoBancarioRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoRetornoBancario.deleteMany({});
      if (mapped.length) await tx.fatoRetornoBancario.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_retorno_bancario");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
