import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput, FaturamentoResultado } from "../_shared/types";
import { faturamentoAutorizado } from "./faturamento-autorizado";

/**
 * FATURAMENTO_SAIDA: por definicao, e o FATURAMENTO_AUTORIZADO (venda de saida).
 * Existe so para parear nominalmente com FATURAMENTO_ENTRADA. DELEGA, sem SQL
 * proprio, para nao duplicar a regra canonica de venda.
 */
export async function faturamentoSaida(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<FaturamentoResultado> {
  return faturamentoAutorizado(prisma, input);
}
