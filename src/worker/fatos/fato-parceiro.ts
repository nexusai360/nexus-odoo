// src/worker/fatos/fato-parceiro.ts
// FONTE: raw_res_partner (modelo res.partner , parceiros/contatos do Odoo).
// Cobre clientes, fornecedores e contatos em geral.
// FILTRO: rawDeleted=false.
// Campos booleanos (customer, supplier, is_company) mapeados para ehCliente,
//   ehFornecedor, ehEmpresa.
// estado_id / country_id são M2O , extraídos via relId/relNome.
// telefone: phone com fallback para mobile (P-I8).
// email: campo direto raw.email.
// NÃO inclui atualizadoEm , campo tem @default(now()) no schema.
import type { PrismaClient } from "../../generated/prisma/client";
import { relNome, type OdooM2O } from "./odoo-relational";
import { markFatoBuilt } from "./fato-build-state";

export interface FatoParceiroRow {
  odooId: number;
  nome: string | null;
  nomeCompleto: string | null;
  documento: string | null;
  ehCliente: boolean;
  ehFornecedor: boolean;
  ehEmpresa: boolean;
  cidade: string | null;
  uf: string | null;
  pais: string | null;
  cep: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  // NÃO inclui atualizadoEm , campo tem @default(now()) no schema
}

export function mapParceiroRow(raw: Record<string, unknown>): FatoParceiroRow {
  const phone = typeof raw.phone === "string" ? raw.phone : null;
  const mobile = typeof raw.mobile === "string" ? raw.mobile : null;

  return {
    odooId: Number(raw.id),
    nome: typeof raw.name === "string" ? raw.name : null,
    nomeCompleto: typeof raw.complete_name === "string" ? raw.complete_name : null,
    documento: typeof raw.vat === "string" ? raw.vat : null,
    ehCliente: Boolean(raw.customer),
    ehFornecedor: Boolean(raw.supplier),
    ehEmpresa: Boolean(raw.is_company),
    cidade: typeof raw.city === "string" ? raw.city : null,
    uf: relNome(raw.state_id as OdooM2O),
    pais: relNome(raw.country_id as OdooM2O),
    cep: typeof raw.zip === "string" ? raw.zip : null,
    email: typeof raw.email === "string" ? raw.email : null,
    // P-I8: phone com fallback para mobile
    telefone: phone ?? mobile,
    ativo: Boolean(raw.active),
  };
}

/** Reconstrói fato_parceiro a partir de raw_res_partner.
 * Filtro: rawDeleted=false. Ciclo: incremental (deleteMany+createMany). */
export async function rebuildFatoParceiro(
  prisma: PrismaClient,
): Promise<number> {
  const rawRows = await prisma.rawResPartner.findMany({
    where: { rawDeleted: false },
  });
  const mapped = rawRows.map((r) =>
    mapParceiroRow(r.data as Record<string, unknown>),
  );
  await prisma.$transaction(async (tx) => {
    await tx.fatoParceiro.deleteMany({});
    if (mapped.length) {
      await tx.fatoParceiro.createMany({ data: mapped });
    }
    await markFatoBuilt(tx, "fato_parceiro");
  });
  return mapped.length;
}
