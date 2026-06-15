// src/lib/reports/queries/comercial.ts
//
// Núcleo de agregação de comercial, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua , sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.

import type { PrismaClient } from "@/generated/prisma/client";
import { diasAtraso } from "../../../../mcp/lib/dias-atraso";

export async function queryPedidosPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ totalPedidos: number; valorTotal: number }> {
  const where =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataOrcamento: {
            gte: new Date(`${filtros.periodoDe}T00:00:00Z`),
            lte: new Date(`${filtros.periodoAte}T00:00:00Z`),
          },
        }
      : {};
  // Usa vrProdutos (valor do pedido independente de faturamento) , consistente
  // com queryPedidosPorEtapa e queryPedidosPorVendedor. vrNf ≈ 0 para pedidos
  // pré-faturamento, o que subnotificaria o valor total do período.
  const rows = await prisma.fatoPedido.findMany({ where, select: { vrProdutos: true } });
  const valorTotal = rows.reduce((acc, r) => acc + Number(r.vrProdutos), 0);
  return { totalPedidos: rows.length, valorTotal };
}

/** Conta o total de pedidos cadastrados (fato_pedido). Devolve só o número,
 * sem amostra de linhas, para perguntas de contagem-total ("quantos pedidos"). */
export async function queryContarPedidos(
  prisma: PrismaClient,
): Promise<{ total: number }> {
  const total = await prisma.fatoPedido.count();
  return { total };
}

export async function queryPedidosPorEtapa(
  prisma: PrismaClient,
): Promise<{ linhas: { etapaNome: string | null; etapaFinaliza: boolean; quantidade: number; valorTotal: number }[] }> {
  // Usa vrProdutos (valor do pedido independente de faturamento) em vez de vrNf.
  // vrNf é 0 para pedidos ainda não faturados (etapas pré-conclusão), o que
  // subnotificaria todo o pipeline em aberto , distorcendo a pergunta-alvo
  // "qual o volume por etapa". vrProdutos reflete o valor comprometido em
  // qualquer etapa. A mesma decisão se aplica a queryPedidosPorVendedor.
  const rows = await prisma.fatoPedido.findMany({
    select: { etapaNome: true, etapaFinaliza: true, vrProdutos: true },
  });
  // Agrupa em memória por etapaNome (não groupBy , precisa carregar etapaFinaliza)
  const map = new Map<string | null, { etapaFinaliza: boolean; quantidade: number; valorTotal: number }>();
  for (const r of rows) {
    const key = r.etapaNome;
    const existing = map.get(key);
    if (existing) {
      existing.quantidade += 1;
      existing.valorTotal += Number(r.vrProdutos);
    } else {
      map.set(key, { etapaFinaliza: r.etapaFinaliza, quantidade: 1, valorTotal: Number(r.vrProdutos) });
    }
  }
  const linhas = [...map.entries()].map(([etapaNome, v]) => ({ etapaNome, ...v }));
  return { linhas };
}

export async function queryPedidosPorVendedor(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ linhas: { vendedorNome: string | null; quantidade: number; valorTotal: number }[] }> {
  const where =
    filtros.periodoDe && filtros.periodoAte
      ? {
          dataOrcamento: {
            gte: new Date(`${filtros.periodoDe}T00:00:00Z`),
            lte: new Date(`${filtros.periodoAte}T00:00:00Z`),
          },
        }
      : {};
  // Usa vrProdutos , mesma decisão de queryPedidosPorEtapa: vrNf=0 para
  // pedidos não faturados, o que subnotificaria vendedores com pedidos em aberto.
  const rows = await prisma.fatoPedido.findMany({
    where,
    select: { vendedorNome: true, vrProdutos: true },
  });
  const map = new Map<string | null, { quantidade: number; valorTotal: number }>();
  for (const r of rows) {
    const key = r.vendedorNome;
    const existing = map.get(key);
    if (existing) {
      existing.quantidade += 1;
      existing.valorTotal += Number(r.vrProdutos);
    } else {
      map.set(key, { quantidade: 1, valorTotal: Number(r.vrProdutos) });
    }
  }
  const linhas = [...map.entries()]
    .map(([vendedorNome, v]) => ({ vendedorNome, ...v }))
    // Ordenacao ESTAVEL: valorTotal desc + desempate por vendedorNome, para que
    // a paginacao em memoria (slice no handler) nao repita nem pule vendedor.
    .sort(
      (a, b) =>
        b.valorTotal - a.valorTotal ||
        (a.vendedorNome ?? "").localeCompare(b.vendedorNome ?? ""),
    );
  return { linhas };
}

export async function queryPedidosAtrasados(
  prisma: PrismaClient,
  hoje: Date,
  paginacao?: { limit?: number; offset?: number },
): Promise<{ linhas: { pedidoId: number | null; participanteNome: string | null; numero: string | null; dataVencimento: Date | null; valor: number; diasAtraso: number }[]; totalAtrasado: number; totalEncontrados: number; maxDiasAtraso: number }> {
  // Normaliza para início do dia local , parcelas gravadas como T00:00:00 não
  // devem ser contadas como atrasadas se vencem HOJE. Mesmo padrão de
  // queryTitulosVencidos (financeiro.ts:230).
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const where = {
    dataVencimento: { lt: inicioDoDia },
    parcelaFaturada: false,
  };
  // Alavanca 2b: paginacao via take/skip no SQL. orderBy por dataVencimento
  // (mais antigo primeiro = maior atraso) + desempate por odooId.
  const [rows, totalEncontrados, somaAgg, maisAntiga] = await Promise.all([
    prisma.fatoPedidoParcela.findMany({
      where,
      select: {
        pedidoId: true,
        participanteNome: true,
        numero: true,
        dataVencimento: true,
        valor: true,
      },
      orderBy: [{ dataVencimento: "asc" }, { odooId: "asc" }],
      take: paginacao?.limit,
      skip: paginacao?.offset,
    }),
    prisma.fatoPedidoParcela.count({ where }),
    prisma.fatoPedidoParcela.aggregate({ where, _sum: { valor: true } }),
    // Parcela mais antiga = maior atraso (independente da pagina), para _DESTAQUE.
    prisma.fatoPedidoParcela.findFirst({
      where,
      select: { dataVencimento: true },
      orderBy: [{ dataVencimento: "asc" }],
    }),
  ]);
  const linhas = rows.map((r) => ({
    pedidoId: r.pedidoId,
    participanteNome: r.participanteNome,
    numero: r.numero,
    dataVencimento: r.dataVencimento,
    valor: Number(r.valor),
    diasAtraso: diasAtraso(r.dataVencimento, inicioDoDia),
  }));
  // totalAtrasado e maxDias consideram TODO o recorte, nao so a pagina.
  const totalAtrasado = Number(somaAgg._sum.valor ?? 0);
  const maxDiasAtraso = maisAntiga ? diasAtraso(maisAntiga.dataVencimento, inicioDoDia) : 0;
  return { linhas, totalAtrasado, totalEncontrados, maxDiasAtraso };
}

export async function queryParcelasAVencer(
  prisma: PrismaClient,
  filtros: { ateDias?: number; limit?: number; offset?: number },
  hoje: Date,
): Promise<{ linhas: { pedidoId: number | null; participanteNome: string | null; numero: string | null; dataVencimento: Date | null; valor: number }[]; totalAVencer: number; totalEncontrados: number }> {
  // Normaliza para início do dia local , parcelas que vencem HOJE (gravadas como
  // T00:00:00) devem ser incluídas em "a vencer". Mesmo padrão de
  // queryTitulosVencidos (financeiro.ts:230).
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const ateDias = filtros.ateDias ?? 30;
  const limite = new Date(inicioDoDia.getTime() + ateDias * 24 * 60 * 60 * 1000);
  const where = {
    dataVencimento: { gte: inicioDoDia, lte: limite },
    parcelaFaturada: false,
  };
  // Alavanca 2b: paginacao via take/skip no SQL. orderBy estavel com desempate
  // por odooId para que "os proximos" nao repitam nem pulem parcela.
  const [rows, totalEncontrados, somaAgg] = await Promise.all([
    prisma.fatoPedidoParcela.findMany({
      where,
      select: {
        pedidoId: true,
        participanteNome: true,
        numero: true,
        dataVencimento: true,
        valor: true,
      },
      orderBy: [{ dataVencimento: "asc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoPedidoParcela.count({ where }),
    prisma.fatoPedidoParcela.aggregate({ where, _sum: { valor: true } }),
  ]);
  const linhas = rows.map((r) => ({
    pedidoId: r.pedidoId,
    participanteNome: r.participanteNome,
    numero: r.numero,
    dataVencimento: r.dataVencimento,
    valor: Number(r.valor),
  }));
  // totalAVencer e a soma de TODAS as parcelas do recorte (nao so da pagina).
  const totalAVencer = Number(somaAgg._sum.valor ?? 0);
  return { linhas, totalAVencer, totalEncontrados };
}
