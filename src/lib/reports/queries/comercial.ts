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

export type OrdenacaoDemanda = "tempo_parado" | "valor" | "data_criacao";

/**
 * Demanda em aberta: pedidos com bucket_demanda='ABERTA' (materializado pelo builder
 * de classificacao = venda a cliente externo, aprovado, sem NF ao consumidor final).
 * Retorna total (pedidos e R$), quebra por etapa, e a lista das mais paradas.
 * "Tempo parado" = dias desde a entrada na etapa ATUAL (fato_pedido_historico), com
 * fallback data_aprovacao/data_orcamento (153 pedidos sem historico). Volume pequeno
 * (~395), entao busca todas e agrega/ordena em memoria.
 */
export async function queryDemandaEmAberta(
  prisma: PrismaClient,
  filtros: { empresaId?: number; limite?: number; ordenacao?: OrdenacaoDemanda } = {},
): Promise<{
  totalPedidos: number;
  valorTotal: number;
  porEtapa: { etapaNome: string | null; quantidade: number; valorTotal: number }[];
  lista: {
    numero: string | null;
    etapaNome: string | null;
    empresaNome: string | null;
    participanteNome: string | null;
    valorProdutos: number;
    diasParado: number | null;
  }[];
  ordenadoPor: OrdenacaoDemanda;
}> {
  const limite = Math.min(Math.max(filtros.limite ?? 20, 1), 100);
  const ordenacao = filtros.ordenacao ?? "tempo_parado";

  const todas = await prisma.$queryRaw<
    {
      numero: string | null;
      etapa_nome: string | null;
      empresa_id: number | null;
      empresa_nome: string | null;
      participante_nome: string | null;
      valor: number;
      dias_parado: number | null;
      data_orcamento: Date | null;
    }[]
  >`
    SELECT f.numero, f.etapa_nome, f.empresa_id, f.empresa_nome, f.participante_nome,
           f.vr_produtos::float8 AS valor,
           EXTRACT(DAY FROM now() - COALESCE(h.data_entrada, f.data_aprovacao, f.data_orcamento))::int AS dias_parado,
           f.data_orcamento
    FROM fato_pedido f
    LEFT JOIN LATERAL (
      SELECT max(data_entrada) AS data_entrada
      FROM fato_pedido_historico h
      WHERE h.pedido_id = f.odoo_id AND h.etapa_id = f.etapa_id
    ) h ON true
    WHERE f.bucket_demanda = 'ABERTA'
  `;
  // Filtro de empresa em memoria (volume pequeno, ~395), evita SQL condicional.
  const rows =
    filtros.empresaId != null
      ? todas.filter((r) => r.empresa_id === filtros.empresaId)
      : todas;

  const totalPedidos = rows.length;
  const valorTotal = rows.reduce((s, r) => s + (r.valor ?? 0), 0);

  const mapEtapa = new Map<string | null, { quantidade: number; valorTotal: number }>();
  for (const r of rows) {
    const e = mapEtapa.get(r.etapa_nome) ?? { quantidade: 0, valorTotal: 0 };
    e.quantidade += 1;
    e.valorTotal += r.valor ?? 0;
    mapEtapa.set(r.etapa_nome, e);
  }
  const porEtapa = [...mapEtapa.entries()]
    .map(([etapaNome, v]) => ({ etapaNome, ...v }))
    .sort((a, b) => b.quantidade - a.quantidade);

  const ordenar = {
    tempo_parado: (a: (typeof rows)[number], b: (typeof rows)[number]) =>
      (b.dias_parado ?? -1) - (a.dias_parado ?? -1),
    valor: (a: (typeof rows)[number], b: (typeof rows)[number]) => b.valor - a.valor,
    data_criacao: (a: (typeof rows)[number], b: (typeof rows)[number]) =>
      (a.data_orcamento?.getTime() ?? Infinity) - (b.data_orcamento?.getTime() ?? Infinity),
  }[ordenacao];

  const lista = [...rows]
    .sort(ordenar)
    .slice(0, limite)
    .map((r) => ({
      numero: r.numero,
      etapaNome: r.etapa_nome,
      empresaNome: r.empresa_nome,
      participanteNome: r.participante_nome,
      valorProdutos: r.valor,
      diasParado: r.dias_parado,
    }));

  return { totalPedidos, valorTotal, porEtapa, lista, ordenadoPor: ordenacao };
}

/**
 * Situacao (imersao) de um pedido: por onde passou (trilha), em que etapa esta, ha
 * quanto tempo (dias parado na etapa atual) e os dados-chave. Busca por numero
 * (ex.: "PV-2037/26"); aceita match parcial/case-insensitive para tolerar variacoes.
 */
export async function queryPedidoSituacao(
  prisma: PrismaClient,
  filtros: { numero: string },
): Promise<{
  encontrado: boolean;
  pedido: {
    numero: string | null;
    etapaNome: string | null;
    bucketDemanda: string | null;
    categoriaOperacao: string | null;
    operacaoNome: string | null;
    empresaNome: string | null;
    participanteNome: string | null;
    vendedorNome: string | null;
    valorProdutos: number;
    dataAprovacao: string | null;
    dataPrevista: string | null;
    diasParado: number | null;
  } | null;
  trilha: {
    etapaNome: string | null;
    entrouEm: string | null;
    tempoEtapaDias: number | null;
  }[];
}> {
  const alvo = filtros.numero.trim();
  const pedido = await prisma.fatoPedido.findFirst({
    where: { numero: { contains: alvo, mode: "insensitive" } },
    orderBy: { dataOrcamento: "desc" },
  });
  if (!pedido) return { encontrado: false, pedido: null, trilha: [] };

  const historico = await prisma.fatoPedidoHistorico.findMany({
    where: { pedidoId: pedido.odooId },
    orderBy: [{ dataEntrada: "asc" }, { odooId: "asc" }],
    select: { etapaId: true, etapaNome: true, dataEntrada: true, tempoEtapaDias: true },
  });

  // Dias parado = desde a ULTIMA entrada na etapa ATUAL (fallback aprovacao/orcamento).
  const entradasEtapaAtual = historico
    .filter((h) => h.etapaId === pedido.etapaId && h.dataEntrada)
    .map((h) => h.dataEntrada!.getTime());
  const refMs = entradasEtapaAtual.length
    ? Math.max(...entradasEtapaAtual)
    : (pedido.dataAprovacao ?? pedido.dataOrcamento)?.getTime() ?? null;
  const diasParado =
    refMs != null ? Math.floor((Date.now() - refMs) / 86_400_000) : null;

  return {
    encontrado: true,
    pedido: {
      numero: pedido.numero,
      etapaNome: pedido.etapaNome,
      bucketDemanda: pedido.bucketDemanda,
      categoriaOperacao: pedido.categoriaOperacao,
      operacaoNome: pedido.operacaoNome,
      empresaNome: pedido.empresaNome,
      participanteNome: pedido.participanteNome,
      vendedorNome: pedido.vendedorNome,
      valorProdutos: Number(pedido.vrProdutos),
      dataAprovacao: pedido.dataAprovacao?.toISOString() ?? null,
      dataPrevista: pedido.dataPrevista?.toISOString() ?? null,
      diasParado,
    },
    trilha: historico.map((h) => ({
      etapaNome: h.etapaNome,
      entrouEm: h.dataEntrada?.toISOString() ?? null,
      tempoEtapaDias: h.tempoEtapaDias,
    })),
  };
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
