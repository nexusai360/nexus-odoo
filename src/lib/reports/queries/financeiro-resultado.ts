// src/lib/reports/queries/financeiro-resultado.ts
//
// DRE gerencial: resultado por conta gerencial, a partir de
// fato_financeiro_lancamento_item (itens do lancamento com conta_id + tipo
// herdado do lancamento pai). Receita = tipo a_receber/recebimento;
// Despesa = tipo a_pagar/pagamento. Framework-neutro (sem freshness/shaping).

import type { PrismaClient } from "@/generated/prisma/client";
import { janelaClampada } from "@/lib/corte-dados";

const RECEITA = new Set(["a_receber", "recebimento"]);
const DESPESA = new Set(["a_pagar", "pagamento"]);

function naturezaDe(tipo: string): "receita" | "despesa" | "outro" {
  if (RECEITA.has(tipo)) return "receita";
  if (DESPESA.has(tipo)) return "despesa";
  return "outro";
}

export async function queryResultadoPorConta(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; natureza?: "receita" | "despesa"; limite?: number },
): Promise<{
  linhas: { contaNome: string | null; natureza: string; total: number; itens: number }[];
  totalReceita: number;
  totalDespesa: number;
  resultado: number;
}> {
  // Lancamento e documento com data: HISTORICO. A janela e sempre grampeada a data de
  // inicio das analises e, sem periodo, o piso e o proprio corte (antes, o where vazio
  // fazia a DRE somar o cache inteiro). Borda superior exclusiva: o dia "ate" entra
  // inteiro sem depender da hora gravada (o `lte 23:59:59` perdia lancamento na virada).
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);

  const rows = await prisma.fatoFinanceiroLancamentoItem.findMany({
    where: { dataDocumento: { gte: j.gte, lt: j.lt } },
    select: { contaNome: true, tipo: true, vrTotal: true },
  });

  const map = new Map<string, { contaNome: string | null; natureza: string; total: number; itens: number }>();
  let totalReceita = 0;
  let totalDespesa = 0;
  for (const r of rows) {
    const nat = naturezaDe(r.tipo);
    if (nat === "outro") continue;
    if (filtros.natureza && nat !== filtros.natureza) continue;
    const v = Number(r.vrTotal);
    if (nat === "receita") totalReceita += v;
    else totalDespesa += v;
    const key = `${nat}|${r.contaNome ?? "(sem conta)"}`;
    const ex = map.get(key);
    if (ex) {
      ex.total += v;
      ex.itens += 1;
    } else {
      map.set(key, { contaNome: r.contaNome, natureza: nat, total: v, itens: 1 });
    }
  }

  const linhas = [...map.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, filtros.limite ?? 50);

  return { linhas, totalReceita, totalDespesa, resultado: totalReceita - totalDespesa };
}
