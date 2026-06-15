import type { PrismaClient } from "../../../generated/prisma/client";
import type { FaturamentoInput } from "../_shared/types";
import { buildPeriodoWhere } from "../_shared/periodo";
import { buildEmpresaWhere } from "../_shared/empresa";

export interface NaoAutorizadoSituacao {
  situacaoNfe: string | null;
  totalNotas: number;
  valor: number;
}

export interface NaoAutorizadoResultado {
  totalNotas: number;
  valor: number;
  porSituacao: NaoAutorizadoSituacao[];
}

/**
 * FATURAMENTO_NAO_AUTORIZADO: notas de SAIDA cuja situacao nao e nem autorizada
 * nem cancelada (denegada, rejeitada, em processamento, null, ...). Metrica
 * NOMEADA (nao residuo de subtracao), decomposta por situacao. Parcela do
 * fechamento BRUTO. Fonte: fato_nota_fiscal. Agrupa via findMany + Map (situacao
 * e nulavel, por isso nao usa groupBy, que quebra com null no adapter-pg).
 */
export async function faturamentoNaoAutorizado(
  prisma: PrismaClient,
  input: FaturamentoInput,
): Promise<NaoAutorizadoResultado> {
  const where = {
    entradaSaida: "1",
    ...buildPeriodoWhere(input.periodoDe, input.periodoAte),
    ...buildEmpresaWhere(input.empresaId),
    OR: [{ situacaoNfe: { notIn: ["autorizada", "cancelada"] } }, { situacaoNfe: null }],
  };
  const rows = await prisma.fatoNotaFiscal.findMany({
    where,
    select: { situacaoNfe: true, vrNf: true },
  });
  const map = new Map<string | null, { totalNotas: number; valor: number }>();
  for (const r of rows) {
    const k = r.situacaoNfe;
    const cur = map.get(k) ?? { totalNotas: 0, valor: 0 };
    cur.totalNotas += 1;
    cur.valor += Number(r.vrNf ?? 0);
    map.set(k, cur);
  }
  const porSituacao: NaoAutorizadoSituacao[] = [...map.entries()]
    .map(([situacaoNfe, v]) => ({ situacaoNfe, totalNotas: v.totalNotas, valor: v.valor }))
    .sort((a, b) => b.valor - a.valor);
  const totalNotas = porSituacao.reduce((s, x) => s + x.totalNotas, 0);
  const valor = porSituacao.reduce((s, x) => s + x.valor, 0);
  return { totalNotas, valor, porSituacao };
}
