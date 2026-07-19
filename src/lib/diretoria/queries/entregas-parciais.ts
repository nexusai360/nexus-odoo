// Relatório de Entregas Parciais (sub-aba de Pedidos & Entregas).
//
// Uma linha por ITEM dos pedidos em demanda aberta que ainda têm saldo a entregar, mais três
// KPIs no topo. Reconcilia a estranheza "61 mi × 21 mi": o total do pedido (header, venda),
// o que falta entregar a venda e o que falta entregar a custo convivem, rotulados.
//
// Reconciliação garantida por construção: o "a atender" de cada linha vem da MESMA função
// (`aAtenderDoItem`) que o card "Demandas a entregar" usa. No mesmo escopo (corte + empresa +
// UF), o KPI de custo daqui é idêntico ao card.

import type { PrismaClient } from "@/generated/prisma/client";

import { corteAtualDate, janelaClampada } from "@/lib/corte-dados";
import { aAtenderDoItem } from "@/lib/diretoria/atendimento-item";
import { rotuloModalidadeFrete } from "@/lib/fiscal/regras/modalidade-frete";
import { atendimentoSincronizado } from "@/lib/diretoria/atendimento-status";
import { siglaDeUf } from "@/lib/diretoria/uf";
import { buildEmpresaWhere } from "@/lib/metrics/_shared/empresa";
import { filtrarTitulosExternos } from "@/lib/reports/queries/financeiro";

export interface FiltrosEntregasParciais {
  ufs?: string[];
  periodoDe?: string;
  periodoAte?: string;
  empresaId?: number;
  /**
   * Quando true, ignora a data de início das análises e traz todo pedido em aberto (o range
   * amplo que o time usa no Odoo). Default false = respeita o corte (bate com o card).
   */
  ignorarCorteDados?: boolean;
}

export interface LinhaEntregaParcial {
  pedidoId: number;
  numero: string | null;
  /** Número de referência do pedido no Mercos (CRM externo), parseado do obs. */
  numeroMercos: string | null;
  uf: string;
  cidade: string | null;
  cliente: string | null;
  produto: string | null;
  familia: string | null;
  marca: string | null;
  /** Operação FISCAL do pedido (natureza da operação por CFOP). Distinta da modalidade de frete. */
  operacao: string | null;
  /** Modalidade de frete (CIF/FOB/terceiros/próprio), rótulo do código NF-e modFrete. */
  modalidade: string | null;
  etapa: string | null;
  qtdAAtender: number;
  valorVendaAAtender: number;
  valorCustoAAtender: number;
  statusFinanceiro: "liberado" | "bloqueado";
  formaPagamento: string | null;
}

export interface IndicadoresEntregasParciais {
  /** Pedidos em aberta distintos no escopo. */
  qtdPedidos: number;
  /** Σ do valor cheio dos pedidos (header, a venda). Inclui o já entregue. */
  totalPedido: number;
  /** Σ do que falta entregar, a preço de venda. */
  aAtenderVenda: number;
  /** Σ do que falta entregar, a custo. Bate com o card no mesmo escopo. */
  aAtenderCusto: number;
}

export interface EntregasParciaisData {
  indicadores: IndicadoresEntregasParciais;
  linhas: LinhaEntregaParcial[];
  /** false = job de atendimento não rodou; a tela avisa que usa a quantidade cheia. */
  atendimentoSincronizado: boolean;
}

// REGRA_BLOQUEIO (D-b, versão SIMPLES, pendente de veredito do dono , 2026-07-18):
// REGRA_BLOQUEIO (decisão do dono, 2026-07-19): segue a fonte da verdade, o ERP Odoo. No Odoo,
// "conta a receber" é o título FATURADO (nota emitida OU pedido já faturado, que gerou a
// duplicata); a carteira (pedido confirmado ainda não faturado) NÃO é conta a receber, é receita
// contratada. Então um cliente fica "bloqueado" quando tem título a_receber FATURADO vencido em
// aberto , exatamente o que o menu Contas a Receber do Odoo lista como em atraso.

/**
 * Clientes bloqueados: os que têm conta a receber (faturada) vencida em aberto, como o ERP Odoo
 * define. Mesmo predicado dos Títulos Vencidos (`vrSaldo>0`, vencimento antes de hoje, documento
 * pós-corte, intragrupo fora), numa única query batched por participante (sem N+1).
 */
export async function statusBloqueioPorCliente(
  prisma: PrismaClient,
  participanteIds: number[],
  hoje: Date,
): Promise<Set<number>> {
  if (!participanteIds.length) return new Set();
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const rows = await prisma.fatoFinanceiroTitulo.findMany({
    where: {
      tipo: "a_receber",
      participanteId: { in: participanteIds },
      vrSaldo: { gt: 0 },
      dataVencimento: { lt: inicioDoDia },
      dataDocumento: { gte: corteAtualDate() },
      // Faturado = conta a receber no Odoo: tem nota OU o pedido já foi faturado (gerou duplicata).
      OR: [{ notaFiscalId: { not: null } }, { pedidoFaturado: true }],
    },
    select: { participanteId: true, participanteNome: true },
  });

  const externos = await filtrarTitulosExternos(prisma, rows);
  return new Set(
    externos.map((r) => r.participanteId).filter((x): x is number => x != null),
  );
}

/**
 * Forma(s) de pagamento por pedido, da PARCELA do pedido (`fato_pedido_parcela`).
 *
 * Medido no cache: pedido em demanda aberta é pré-nota, então o título financeiro dele é
 * carteira e vem SEM forma de pagamento (0% preenchido). A forma mora na parcela do pedido
 * (251 dos 342 pedidos abertos têm). Um pedido pode ter mais de uma forma (entrada + saldo);
 * juntamos as distintas.
 */
async function formaPagamentoPorPedido(
  prisma: PrismaClient,
  pedidoIds: number[],
): Promise<Map<number, string>> {
  if (!pedidoIds.length) return new Map();
  const parcelas = await prisma.fatoPedidoParcela.findMany({
    where: { pedidoId: { in: pedidoIds }, formaPagamentoNome: { not: null } },
    select: { pedidoId: true, formaPagamentoNome: true },
  });
  const setDe = new Map<number, Set<string>>();
  for (const pc of parcelas) {
    if (pc.pedidoId == null || !pc.formaPagamentoNome) continue;
    const s = setDe.get(pc.pedidoId) ?? new Set<string>();
    s.add(pc.formaPagamentoNome);
    setDe.set(pc.pedidoId, s);
  }
  const map = new Map<number, string>();
  for (const [id, s] of setDe) map.set(id, [...s].join(", "));
  return map;
}

export async function queryEntregasParciais(
  prisma: PrismaClient,
  hoje: Date,
  filtros: FiltrosEntregasParciais = {},
): Promise<EntregasParciaisData> {
  // Corte: por default grampeado na data de início das análises; ignorarCorteDados usa um piso
  // antigo (2000) que na prática abre a janela inteira.
  const janela = janelaClampada(
    filtros.periodoDe,
    filtros.periodoAte,
    filtros.ignorarCorteDados ? "2000-01-01" : undefined,
  );

  const pedidos = await prisma.fatoPedido.findMany({
    where: {
      bucketDemanda: "ABERTA",
      ...buildEmpresaWhere(filtros.empresaId),
      dataOrcamento: { gte: janela.gte, lt: janela.lt },
    },
    select: {
      odooId: true,
      numero: true,
      numeroMercos: true,
      participanteId: true,
      participanteNome: true,
      operacaoNome: true,
      modalidadeFrete: true,
      etapaNome: true,
      vrProdutos: true,
    },
  });

  const ids = pedidos.map((p) => p.odooId);
  const participanteIds = [
    ...new Set(pedidos.map((p) => p.participanteId).filter((x): x is number => x != null)),
  ];

  const [itens, produtos, status, parceiros, bloqueados, formaDe] = await Promise.all([
    prisma.fatoPedidoItem.findMany({
      where: { pedidoId: { in: ids } },
      select: {
        pedidoId: true,
        produtoId: true,
        produtoNome: true,
        familiaNome: true,
        marcaNome: true,
        quantidade: true,
        quantidadeAAtender: true,
        vrProdutos: true,
      },
    }),
    prisma.fatoProduto.findMany({ select: { odooId: true, precoCusto: true } }),
    atendimentoSincronizado(prisma),
    prisma.fatoParceiro.findMany({
      where: { odooId: { in: participanteIds } },
      select: { odooId: true, uf: true, cidade: true },
    }),
    statusBloqueioPorCliente(prisma, participanteIds, hoje),
    formaPagamentoPorPedido(prisma, ids),
  ]);

  const custoMap = new Map(produtos.map((p) => [p.odooId, Number(p.precoCusto ?? 0)]));
  const custoDe = (id: number): number | undefined => custoMap.get(id);
  const ufDe = new Map(parceiros.map((p) => [p.odooId, siglaDeUf(p.uf) ?? "??"]));
  const cidadeDe = new Map(parceiros.map((p) => [p.odooId, p.cidade]));

  const escopo = filtros.ufs && filtros.ufs.length ? new Set(filtros.ufs) : null;
  const ufDoPedido = (participanteId: number | null): string =>
    participanteId != null ? ufDe.get(participanteId) ?? "??" : "??";

  // Pedidos dentro do escopo de UF (mesmo recorte do card: sigla via siglaDeUf, "??" fora).
  const pedidosEscopo = pedidos.filter(
    (p) => !escopo || escopo.has(ufDoPedido(p.participanteId)),
  );
  const idsEscopo = new Set(pedidosEscopo.map((p) => p.odooId));
  const pedidoDe = new Map(pedidosEscopo.map((p) => [p.odooId, p]));

  let totalPedido = 0;
  for (const p of pedidosEscopo) totalPedido += Number(p.vrProdutos ?? 0);

  let aAtenderVenda = 0;
  let aAtenderCusto = 0;
  const linhas: LinhaEntregaParcial[] = [];

  for (const it of itens) {
    if (!idsEscopo.has(it.pedidoId)) continue;
    const p = pedidoDe.get(it.pedidoId);
    if (!p) continue;

    const linha = aAtenderDoItem(it, custoDe, status.ok);
    // KPIs a-atender somam TODOS os itens do escopo (inclusive os já entregues, que valem 0),
    // garantindo a igualdade com o card. A TABELA só mostra o que de fato falta entregar.
    aAtenderVenda += linha.vendaLinha;
    aAtenderCusto += linha.custoLinha;
    if (linha.aAtender <= 0) continue;

    linhas.push({
      pedidoId: it.pedidoId,
      numero: p.numero,
      numeroMercos: p.numeroMercos ?? null,
      uf: ufDoPedido(p.participanteId),
      cidade: p.participanteId != null ? cidadeDe.get(p.participanteId) ?? null : null,
      cliente: p.participanteNome,
      produto: it.produtoNome,
      familia: it.familiaNome,
      marca: it.marcaNome,
      operacao: p.operacaoNome,
      modalidade: rotuloModalidadeFrete(p.modalidadeFrete),
      etapa: p.etapaNome,
      qtdAAtender: linha.aAtender,
      valorVendaAAtender: linha.vendaLinha,
      valorCustoAAtender: linha.custoLinha,
      statusFinanceiro:
        p.participanteId != null && bloqueados.has(p.participanteId)
          ? "bloqueado"
          : "liberado",
      formaPagamento: formaDe.get(it.pedidoId) ?? null,
    });
  }

  linhas.sort((a, b) => b.valorCustoAAtender - a.valorCustoAAtender);

  return {
    indicadores: {
      qtdPedidos: pedidosEscopo.length,
      totalPedido,
      aAtenderVenda,
      aAtenderCusto,
    },
    linhas,
    atendimentoSincronizado: status.ok,
  };
}
