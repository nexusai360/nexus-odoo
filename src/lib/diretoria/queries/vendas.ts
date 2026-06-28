// Queries de Vendas da Diretoria (módulo C do HTML). Próprias da Diretoria para
// não tocar os arquivos compartilhados de relatórios. Padrão do projeto:
// recebem (prisma, filtros), agregam em memória, retornam linhas ordenadas.

import type { PrismaClient } from "@/generated/prisma/client";

export interface FiltrosVendas {
  periodoDe?: string;
  periodoAte?: string;
  /** Recorte geográfico (UF-scoping); vazio/undefined = todas as UFs. */
  ufs?: string[];
}

function periodoWhere(
  de: string | undefined,
  ate: string | undefined,
  campo: string,
): Record<string, unknown> {
  if (!de || !ate) return {};
  return {
    [campo]: {
      gte: new Date(`${de}T00:00:00Z`),
      lte: new Date(`${ate}T23:59:59Z`),
    },
  };
}

export interface LinhaFormaPagamento {
  formaPagamento: string;
  quantidade: number;
  valorTotal: number;
}

/**
 * C10 , Formas de pagamento no período. Agrega o valor das parcelas por forma de
 * pagamento (`formaPagamentoNome`), filtrando por `dataVencimento`. Parcelas sem
 * forma definida entram como "Não informado".
 */
export async function queryFormasPagamento(
  prisma: PrismaClient,
  filtros: FiltrosVendas,
): Promise<{ linhas: LinhaFormaPagamento[]; valorGeral: number }> {
  const rows = await prisma.fatoPedidoParcela.findMany({
    where: periodoWhere(filtros.periodoDe, filtros.periodoAte, "dataVencimento"),
    select: { formaPagamentoNome: true, valor: true },
  });

  const map = new Map<string, { quantidade: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const r of rows) {
    const key = r.formaPagamentoNome ?? "Não informado";
    const v = Number(r.valor);
    const cur = map.get(key);
    if (cur) {
      cur.quantidade += 1;
      cur.valorTotal += v;
    } else {
      map.set(key, { quantidade: 1, valorTotal: v });
    }
    valorGeral += v;
  }

  const linhas = [...map.entries()]
    .map(([formaPagamento, v]) => ({ formaPagamento, ...v }))
    .sort(
      (a, b) =>
        b.valorTotal - a.valorTotal || a.formaPagamento.localeCompare(b.formaPagamento),
    );

  return { linhas, valorGeral };
}
