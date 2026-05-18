// src/lib/reports/queries/comercial.ts
//
// Núcleo de agregação de comercial, framework-neutro. Recebe `prisma` + filtros,
// devolve agregação crua — sem `estado`/`freshness`/shaping. Não captura exceção.
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
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};
  const rows = await prisma.fatoPedido.findMany({ where, select: { vrNf: true } });
  const valorTotal = rows.reduce((acc, r) => acc + Number(r.vrNf), 0);
  return { totalPedidos: rows.length, valorTotal };
}

export async function queryPedidosPorEtapa(
  prisma: PrismaClient,
): Promise<{ linhas: { etapaNome: string | null; etapaFinaliza: boolean; quantidade: number; valorTotal: number }[] }> {
  // Usa vrProdutos (valor do pedido independente de faturamento) em vez de vrNf.
  // vrNf é 0 para pedidos ainda não faturados (etapas pré-conclusão), o que
  // subnotificaria todo o pipeline em aberto — distorcendo a pergunta-alvo
  // "qual o volume por etapa". vrProdutos reflete o valor comprometido em
  // qualquer etapa. A mesma decisão se aplica a queryPedidosPorVendedor.
  const rows = await prisma.fatoPedido.findMany({
    select: { etapaNome: true, etapaFinaliza: true, vrProdutos: true },
  });
  // Agrupa em memória por etapaNome (não groupBy — precisa carregar etapaFinaliza)
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
            gte: new Date(`${filtros.periodoDe}T00:00:00`),
            lte: new Date(`${filtros.periodoAte}T00:00:00`),
          },
        }
      : {};
  // Usa vrProdutos — mesma decisão de queryPedidosPorEtapa: vrNf=0 para
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
    .sort((a, b) => b.valorTotal - a.valorTotal);
  return { linhas };
}

export async function queryPedidosAtrasados(
  prisma: PrismaClient,
  hoje: Date,
): Promise<{ linhas: { pedidoId: number | null; participanteNome: string | null; numero: string | null; dataVencimento: Date | null; valor: number; diasAtraso: number }[]; totalAtrasado: number }> {
  // Normaliza para início do dia local — parcelas gravadas como T00:00:00 não
  // devem ser contadas como atrasadas se vencem HOJE. Mesmo padrão de
  // queryTitulosVencidos (financeiro.ts:230).
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const rows = await prisma.fatoPedidoParcela.findMany({
    where: {
      dataVencimento: { lt: inicioDoDia },
      parcelaFaturada: false,
    },
    select: {
      pedidoId: true,
      participanteNome: true,
      numero: true,
      dataVencimento: true,
      valor: true,
    },
    orderBy: { dataVencimento: "asc" }, // mais antigo primeiro (maior atraso)
    take: 200,                           // cap: evita payload gigante; acima de 200 linhas a tool perde utilidade semântica
  });
  const linhas = rows.map((r) => ({
    pedidoId: r.pedidoId,
    participanteNome: r.participanteNome,
    numero: r.numero,
    dataVencimento: r.dataVencimento,
    valor: Number(r.valor),
    diasAtraso: diasAtraso(r.dataVencimento, inicioDoDia),
  }));
  const totalAtrasado = linhas.reduce((acc, l) => acc + l.valor, 0);
  return { linhas, totalAtrasado };
}

export async function queryParcelasAVencer(
  prisma: PrismaClient,
  filtros: { ateDias?: number },
  hoje: Date,
): Promise<{ linhas: { pedidoId: number | null; participanteNome: string | null; numero: string | null; dataVencimento: Date | null; valor: number }[]; totalAVencer: number }> {
  // Normaliza para início do dia local — parcelas que vencem HOJE (gravadas como
  // T00:00:00) devem ser incluídas em "a vencer". Mesmo padrão de
  // queryTitulosVencidos (financeiro.ts:230).
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const ateDias = filtros.ateDias ?? 30;
  const limite = new Date(inicioDoDia.getTime() + ateDias * 24 * 60 * 60 * 1000);
  const rows = await prisma.fatoPedidoParcela.findMany({
    where: {
      dataVencimento: { gte: inicioDoDia, lte: limite },
      parcelaFaturada: false,
    },
    select: {
      pedidoId: true,
      participanteNome: true,
      numero: true,
      dataVencimento: true,
      valor: true,
    },
    orderBy: { dataVencimento: "asc" },
  });
  const linhas = rows.map((r) => ({
    pedidoId: r.pedidoId,
    participanteNome: r.participanteNome,
    numero: r.numero,
    dataVencimento: r.dataVencimento,
    valor: Number(r.valor),
  }));
  const totalAVencer = linhas.reduce((acc, l) => acc + l.valor, 0);
  return { linhas, totalAVencer };
}
