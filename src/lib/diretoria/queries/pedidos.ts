// Queries de Pedidos & Entregas (módulo B) , DEMANDA EM ABERTA.
// "Demanda em aberta" = pedido de VENDA a cliente externo, aprovado, ainda sem NF
// ao consumidor final. É por ETAPA, não por vr_nf (que é furado). Materializado em
// fato_pedido.bucket_demanda='ABERTA' pelo builder de classificação (Onda 0). Aqui
// a diretoria lê a MESMA verdade da tool comercial_demanda_em_aberta (paridade de
// dado painel==tool: 395 pedidos / R$77,6M no cache atual). UF do cliente vem de
// fato_parceiro.uf (normalizado por siglaDeUf).

import type { PrismaClient } from "@/generated/prisma/client";

import { janelaClampada } from "@/lib/corte-dados";
import { atendimentoSincronizado } from "@/lib/diretoria/atendimento-status";
import { siglaDeUf } from "@/lib/diretoria/uf";

export interface FiltrosDemandas {
  ufs?: string[];
  /** Início da janela (AAAA-MM-DD). Ausente ou anterior ao corte = piso na data de início das análises. */
  periodoDe?: string;
  /** Fim da janela (AAAA-MM-DD). Ausente = janela aberta até hoje. */
  periodoAte?: string;
}

export async function ufPorParticipante(
  prisma: PrismaClient,
  ids: number[],
): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const ps = await prisma.fatoParceiro.findMany({
    where: { odooId: { in: ids } },
    select: { odooId: true, uf: true },
  });
  return new Map(ps.map((p) => [p.odooId, siglaDeUf(p.uf) ?? "??"]));
}

interface PedidoAbertoRow {
  odooId: number;
  numero: string | null;
  participanteId: number | null;
  participanteNome: string | null;
  etapaId: number | null;
  etapaNome: string | null;
  dataPrevista: Date | null;
  dataAprovacao: Date | null;
  dataOrcamento: Date | null;
  vrProdutos: unknown;
  /** Preenchidos por `enriquecerComAAtender`. */
  qtdAAtender?: number;
  valorAAtenderCusto?: number;
  valorAAtenderVenda?: number;
  itensSemCusto?: number;
  itensSemProduto?: number;
  atendimentoSincronizado?: boolean;
}

/**
 * Universo único do módulo: os pedidos em demanda aberta. Pedido é DOCUMENTO com data, ou
 * seja, histórico , entra a partir da data de início das análises (`sync.corte_dados`).
 * Sem período informado (é como as páginas chamam hoje), o piso continua sendo o corte:
 * "em aberto" nunca significa "desde sempre". Pedido sem `dataOrcamento` fica de fora, pois
 * não há data de documento que prove que ele pertence à janela analisada.
 *
 * Como TUDO no módulo (B2, B4, B6, B6b, B7 e o mapa da visão geral) sai daqui, o piso
 * aplicado neste ponto vale para todos eles.
 */
async function carregarAbertas(
  prisma: PrismaClient,
  filtros: FiltrosDemandas = {},
): Promise<PedidoAbertoRow[]> {
  const j = janelaClampada(filtros.periodoDe, filtros.periodoAte);
  const pedidos = await prisma.fatoPedido.findMany({
    where: { bucketDemanda: "ABERTA", dataOrcamento: { gte: j.gte, lt: j.lt } },
    select: {
      odooId: true,
      numero: true,
      participanteId: true,
      participanteNome: true,
      etapaId: true,
      etapaNome: true,
      dataPrevista: true,
      dataAprovacao: true,
      dataOrcamento: true,
      vrProdutos: true,
    },
  });
  return enriquecerComAAtender(prisma, pedidos);
}

/**
 * O que ainda falta entregar de cada pedido, a custo.
 *
 * O `vr_produtos` do cabeçalho é o pedido INTEIRO: um pedido com 10 itens, 6 já
 * entregues, continuava valendo os 10. Aqui somamos linha a linha o que falta atender,
 * ao preço de custo do produto (o custo da linha do pedido vem zerado no Odoo, então a
 * fonte é `fato_produto.preco_custo` , a mesma do valor de estoque, para as duas telas
 * fecharem entre si).
 *
 * Enquanto o job de atendimento não tiver rodado, TODOS os pedidos usam a quantidade
 * cheia e a tela avisa. Nunca misturamos as duas bases no mesmo total.
 */
async function enriquecerComAAtender(
  prisma: PrismaClient,
  pedidos: PedidoAbertoRow[],
): Promise<PedidoAbertoRow[]> {
  if (!pedidos.length) return pedidos;

  const status = await atendimentoSincronizado(prisma);
  const ids = pedidos.map((p) => p.odooId);

  const [itens, produtos] = await Promise.all([
    prisma.fatoPedidoItem.findMany({
      where: { pedidoId: { in: ids } },
      select: {
        pedidoId: true,
        produtoId: true,
        quantidade: true,
        quantidadeAAtender: true,
        vrProdutos: true,
      },
    }),
    prisma.fatoProduto.findMany({ select: { odooId: true, precoCusto: true } }),
  ]);

  const custoDe = new Map(
    produtos.map((p) => [p.odooId, Number(p.precoCusto ?? 0)]),
  );
  const acc = new Map<
    number,
    { custo: number; venda: number; qtd: number; semCusto: number; semProduto: number }
  >();

  for (const it of itens) {
    const cheia = Number(it.quantidade ?? 0);
    // Sem o job, "a atender" é desconhecido , cai na quantidade cheia, uniformemente.
    const aAtender = status.ok ? Number(it.quantidadeAAtender ?? 0) : cheia;
    const custoUnit = it.produtoId != null ? custoDe.get(it.produtoId) : undefined;
    const precoUnit = cheia > 0 ? Number(it.vrProdutos ?? 0) / cheia : 0;

    const cur = acc.get(it.pedidoId) ?? {
      custo: 0,
      venda: 0,
      qtd: 0,
      semCusto: 0,
      semProduto: 0,
    };
    cur.qtd += aAtender;
    cur.custo += aAtender * (custoUnit ?? 0);
    cur.venda += aAtender * precoUnit;
    if (it.produtoId == null) cur.semProduto += 1;
    else if (custoUnit == null || custoUnit <= 0) cur.semCusto += 1;
    acc.set(it.pedidoId, cur);
  }

  return pedidos.map((p) => {
    const a = acc.get(p.odooId);
    return {
      ...p,
      qtdAAtender: a?.qtd ?? 0,
      valorAAtenderCusto: a?.custo ?? 0,
      valorAAtenderVenda: a?.venda ?? 0,
      itensSemCusto: a?.semCusto ?? 0,
      itensSemProduto: a?.semProduto ?? 0,
      atendimentoSincronizado: status.ok,
    };
  });
}

/**
 * O valor que a diretoria vê: o que falta entregar, a custo.
 *
 * Decisão do dono (2026-07-13): tabela e indicador falam a mesma língua. Antes o B-04
 * mostrava o cabeçalho a preço de venda e o KPI ao lado, outro número.
 */
function valorDoPedido(p: PedidoAbertoRow): number {
  return p.valorAAtenderCusto ?? 0;
}

/** Resolve UF de cada pedido (sigla) reusando fato_parceiro. */
async function ufMapDe(
  prisma: PrismaClient,
  pedidos: PedidoAbertoRow[],
): Promise<Map<number, string>> {
  return ufPorParticipante(
    prisma,
    [...new Set(pedidos.map((p) => p.participanteId).filter((x): x is number => x != null))],
  );
}

function ufDoPedido(p: PedidoAbertoRow, ufMap: Map<number, string>): string {
  return p.participanteId != null ? ufMap.get(p.participanteId) ?? "??" : "??";
}

function escopoDe(filtros: FiltrosDemandas): Set<string> | null {
  return filtros.ufs && filtros.ufs.length ? new Set(filtros.ufs) : null;
}

export interface DemandaUf {
  uf: string;
  quantidade: number;
  valorTotal: number;
}

/** B4 , Demanda em aberta por estado. Valor = total dos produtos. */
export async function queryDemandasPorUf(
  prisma: PrismaClient,
  filtros: FiltrosDemandas = {},
): Promise<{ linhas: DemandaUf[]; valorGeral: number }> {
  const pedidos = await carregarAbertas(prisma, filtros);
  const ufMap = await ufMapDe(prisma, pedidos);
  const escopo = escopoDe(filtros);

  const map = new Map<string, { quantidade: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const p of pedidos) {
    const uf = ufDoPedido(p, ufMap);
    if (escopo && !escopo.has(uf)) continue;
    const v = valorDoPedido(p);
    const cur = map.get(uf);
    if (cur) {
      cur.quantidade += 1;
      cur.valorTotal += v;
    } else {
      map.set(uf, { quantidade: 1, valorTotal: v });
    }
    valorGeral += v;
  }
  const linhas = [...map.entries()]
    .map(([uf, v]) => ({ uf, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal || a.uf.localeCompare(b.uf));
  return { linhas, valorGeral };
}

export interface IndicadoresDemandas {
  totalPendentes: number;
  valorAEntregar: number;
  atrasadas: number;
}

/** B6 , Indicadores da demanda em aberta. Atrasada = data prevista já passou. */
export async function queryIndicadoresDemandas(
  prisma: PrismaClient,
  hoje: Date,
  filtros: FiltrosDemandas = {},
): Promise<IndicadoresDemandas> {
  const pedidos = await carregarAbertas(prisma, filtros);
  const escopo = escopoDe(filtros);
  const ufMap = escopo ? await ufMapDe(prisma, pedidos) : null;

  let totalPendentes = 0;
  let valorAEntregar = 0;
  let atrasadas = 0;
  for (const p of pedidos) {
    if (escopo && !escopo.has(ufDoPedido(p, ufMap!))) continue;
    totalPendentes += 1;
    valorAEntregar += valorDoPedido(p);
    if (p.dataPrevista && p.dataPrevista < hoje) atrasadas += 1;
  }
  return { totalPendentes, valorAEntregar, atrasadas };
}

export interface DemandaLinha {
  numero: string | null;
  cliente: string | null;
  uf: string;
  etapa: string | null;
  dataPrevista: string | null;
  valor: number;
  atrasado: boolean;
}

/** B2 , Lista da demanda em aberta (cliente, UF, etapa, prazo, valor). */
export async function queryDemandasPendentes(
  prisma: PrismaClient,
  hoje: Date,
  filtros: FiltrosDemandas = {},
): Promise<{ linhas: DemandaLinha[] }> {
  const pedidos = await carregarAbertas(prisma, filtros);
  const ufMap = await ufMapDe(prisma, pedidos);
  const escopo = escopoDe(filtros);

  const linhas: DemandaLinha[] = [];
  for (const p of pedidos) {
    const uf = ufDoPedido(p, ufMap);
    if (escopo && !escopo.has(uf)) continue;
    linhas.push({
      numero: p.numero,
      cliente: p.participanteNome,
      uf,
      etapa: p.etapaNome,
      dataPrevista: p.dataPrevista ? p.dataPrevista.toISOString().slice(0, 10) : null,
      valor: valorDoPedido(p),
      atrasado: p.dataPrevista != null && p.dataPrevista < hoje,
    });
  }
  linhas.sort((a, b) => b.valor - a.valor);
  return { linhas };
}

export interface DemandaEtapa {
  etapaNome: string | null;
  quantidade: number;
  valorTotal: number;
}

/**
 * B6b , Demanda em aberta quebrada por etapa (quantidade e valor). Espelha o
 * `porEtapa` da tool comercial_demanda_em_aberta. Ordena por valor desc.
 */
export async function queryDemandaPorEtapa(
  prisma: PrismaClient,
  filtros: FiltrosDemandas = {},
): Promise<{ linhas: DemandaEtapa[]; total: number; valorGeral: number }> {
  const pedidos = await carregarAbertas(prisma, filtros);
  const ufMap = await ufMapDe(prisma, pedidos);
  const escopo = escopoDe(filtros);

  const map = new Map<string | null, { quantidade: number; valorTotal: number }>();
  let valorGeral = 0;
  let total = 0;
  for (const p of pedidos) {
    if (escopo && !escopo.has(ufDoPedido(p, ufMap))) continue;
    const v = valorDoPedido(p);
    const cur = map.get(p.etapaNome) ?? { quantidade: 0, valorTotal: 0 };
    cur.quantidade += 1;
    cur.valorTotal += v;
    map.set(p.etapaNome, cur);
    valorGeral += v;
    total += 1;
  }
  const linhas = [...map.entries()]
    .map(([etapaNome, v]) => ({ etapaNome, ...v }))
    .sort((a, b) => b.valorTotal - a.valorTotal);
  return { linhas, total, valorGeral };
}

export interface DemandaParada {
  numero: string | null;
  cliente: string | null;
  uf: string;
  etapa: string | null;
  diasParado: number | null;
  valor: number;
}

/**
 * B7 , Demandas mais paradas: dias na etapa ATUAL (última entrada em
 * fato_pedido_historico para a etapa corrente), com fallback data_aprovacao/
 * data_orcamento (pedidos sem histórico). Ordena por dias parado desc.
 */
export async function queryDemandasMaisParadas(
  prisma: PrismaClient,
  hoje: Date,
  filtros: FiltrosDemandas & { limite?: number } = {},
): Promise<{ linhas: DemandaParada[] }> {
  const pedidos = await carregarAbertas(prisma, filtros);
  const ufMap = await ufMapDe(prisma, pedidos);
  const escopo = escopoDe(filtros);
  const limite = Math.min(Math.max(filtros.limite ?? 20, 1), 100);

  // O histórico de etapas é lido APENAS para os pedidos já grampeados acima, então o
  // universo já respeita a data de início das análises. A data de entrada na etapa não leva
  // piso próprio de propósito: ela é o relógio do "parado há N dias" desse pedido, e cortá-la
  // faria o pedido parecer mais novo na etapa do que ele é.
  const ids = pedidos.map((p) => p.odooId);
  const historico = ids.length
    ? await prisma.fatoPedidoHistorico.findMany({
        where: { pedidoId: { in: ids } },
        select: { pedidoId: true, etapaId: true, dataEntrada: true },
      })
    : [];
  // Última entrada por (pedido, etapa).
  const ultimaEntrada = new Map<string, number>();
  for (const h of historico) {
    if (h.pedidoId == null || h.dataEntrada == null) continue;
    const k = `${h.pedidoId}:${h.etapaId}`;
    const t = h.dataEntrada.getTime();
    const cur = ultimaEntrada.get(k);
    if (cur == null || t > cur) ultimaEntrada.set(k, t);
  }

  const linhas: DemandaParada[] = [];
  for (const p of pedidos) {
    const uf = ufDoPedido(p, ufMap);
    if (escopo && !escopo.has(uf)) continue;
    const refMs =
      ultimaEntrada.get(`${p.odooId}:${p.etapaId}`) ??
      (p.dataAprovacao ?? p.dataOrcamento)?.getTime() ??
      null;
    const diasParado =
      refMs != null ? Math.floor((hoje.getTime() - refMs) / 86_400_000) : null;
    linhas.push({
      numero: p.numero,
      cliente: p.participanteNome,
      uf,
      etapa: p.etapaNome,
      diasParado,
      valor: valorDoPedido(p),
    });
  }
  linhas.sort((a, b) => (b.diasParado ?? -1) - (a.diasParado ?? -1));
  return { linhas: linhas.slice(0, limite) };
}
