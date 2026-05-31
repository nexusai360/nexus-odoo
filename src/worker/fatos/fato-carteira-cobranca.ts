// B3 (cobrança bancária): builder da carteira de cobrança (config de boleto).
// Fonte: raw_finan_carteira (modelo finan.carteira).
// SEGURANÇA: só campos de negócio. Credenciais de banco (itau_token,
// bradesco_certificado, *_secret, *_password, *_access_token...) NUNCA entram.
import type { PrismaClient } from "../../generated/prisma/client";
import { relId, relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";
import { str, num, numStr } from "./_coerce";

export interface FatoCarteiraCobrancaRow {
  odooId: number;
  nome: string | null;
  bancoId: number | null;
  bancoNome: string | null;
  banco: string | null;
  carteira: string | null;
  tipoCarteira: string | null;
  beneficiario: string | null;
  convenio: string | null;
  modalidade: string | null;
  alJuros: number;
  alMulta: number;
  alDesconto: number;
  taxaEmissao: number;
  diasProtesto: number | null;
  diasNegativacao: number | null;
  proximoNossoNumero: string | null;
  proximaRemessa: number | null;
}

export function mapCarteiraCobrancaRow(raw: Record<string, unknown>): FatoCarteiraCobrancaRow {
  const int = (v: unknown): number | null => (typeof v === "number" ? Math.trunc(v) : null);
  return {
    odooId: Number(raw.id),
    nome: str(raw.nome),
    bancoId: relId(raw.banco_id as OdooM2O),
    bancoNome: relNome(raw.banco_id as OdooM2O),
    banco: str(raw.banco),
    carteira: str(raw.carteira),
    tipoCarteira: str(raw.tipo_carteira),
    beneficiario: str(raw.beneficiario),
    convenio: str(raw.convenio),
    modalidade: str(raw.modalidade),
    alJuros: num(raw.al_juros),
    alMulta: num(raw.al_multa),
    alDesconto: num(raw.al_desconto),
    taxaEmissao: num(raw.taxa_emissao),
    diasProtesto: int(raw.dias_protesto),
    diasNegativacao: int(raw.dias_negativacao),
    proximoNossoNumero: numStr(raw.proximo_nosso_numero),
    proximaRemessa: int(raw.proxima_remessa),
  };
}

export async function rebuildFatoCarteiraCobranca(prisma: PrismaClient): Promise<number> {
  const rawRows = await prisma.rawFinanCarteira.findMany({ where: { rawDeleted: false } });
  const mapped = rawRows.map((r) => mapCarteiraCobrancaRow(r.data as Record<string, unknown>));
  await prisma.$transaction(
    async (tx) => {
      await tx.fatoCarteiraCobranca.deleteMany({});
      if (mapped.length) await tx.fatoCarteiraCobranca.createMany({ data: mapped });
      await markFatoBuilt(tx, "fato_carteira_cobranca");
    },
    { timeout: 180_000, maxWait: 15_000 },
  );
  return mapped.length;
}
