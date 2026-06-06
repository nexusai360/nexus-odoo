import type { Prisma } from "../../../generated/prisma/client";

/**
 * Regra canonica de periodo: filtra por dataEmissao com borda exclusiva.
 * O par precisa estar completo (de E ate); par incompleto retorna {} (mesmo
 * comportamento do fiscal.ts legado). A borda de fim e exclusiva: lt = ate + 1 dia UTC,
 * para o dia "ate" entrar inteiro sem depender de hora.
 */
export function buildPeriodoWhere(de?: string, ate?: string): Prisma.FatoNotaFiscalWhereInput {
  if (!de || !ate) return {};
  const ateMais1 = new Date(`${ate}T00:00:00Z`);
  ateMais1.setUTCDate(ateMais1.getUTCDate() + 1);
  return { dataEmissao: { gte: new Date(`${de}T00:00:00Z`), lt: ateMais1 } };
}
