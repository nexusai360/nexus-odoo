// src/worker/fatos/captura-pedido-valor.ts
// Captura append-por-mudanca dos VALORES do pedido, acoplada ao ciclo incremental (junto de
// capturarPreco), gate fato_pedido.ok. Le fato_pedido + raw_pedido_documento (jsonb, via os
// extratores da tela) + agrega o saldo a atender por pedido; grava uma linha nova quando o
// NUCLEO muda (etapa, saldo a atender venda, margem, desconto, CBS, IBS). Os demais valores sao
// snapshotados junto. evento='baixa' com valores NULL quando o pedido sai do escopo de fato_pedido.
//
// INVARIANTES:
// - Valores vem PRONTOS do Odoo (raw), margem/imposto NUNCA recalculados (INV-2).
// - So captura com jobOk=true (senao o saldo a atender cai na quantidade cheia e poluiria a
//   serie, INV-8); com jobOk=false a rodada e ADIADA.
// - Herda o escopo ja recortado de fato_pedido (nao aplica corte de leitura, INV-3).
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client";
import { calcularDelta, type LinhaSerie } from "../../lib/estoque/delta-serie";
import { decidirRodada, TETO_BAIXAS_PEDIDO } from "../../lib/estoque/guarda-sanidade";
import { aAtenderDoItem, type ItemAtendimento } from "../../lib/diretoria/atendimento-item";
import { atendimentoSincronizado } from "../../lib/diretoria/atendimento-status";
import { extrairRentabilidade, extrairDesconto } from "../../lib/diretoria/pedido-extratores";
import {
  LOTE_INSERT,
  LOTE_UPDATE,
  emLotes,
  recusadasSeguidas,
  temBaseAnterior,
} from "./captura-serie";

const SERIE = "pedido_valor";

/** Snapshot completo dos valores de um pedido num instante (numeros; vem prontos do Odoo). */
export interface SnapshotPedido {
  pedidoId: number;
  etapaId: number | null;
  etapaNome: string | null;
  vrProdutos: number;
  vrOperacaoTributacao: number;
  vrDesconto: number;
  vrCustoComercial: number;
  vrComissao: number;
  alMargem: number;
  vrLiquido: number;
  vrIcmsProprio: number;
  vrDifal: number;
  vrFcp: number;
  vrPisProprio: number;
  vrCofinsProprio: number;
  vrIrpj: number;
  vrCsll: number;
  vrCbs: number;
  vrIbs: number;
  saldoAtenderCusto: number;
  saldoAtenderVenda: number;
  dataPrevista: Date | null;
}

const f2 = (n: number): string => n.toFixed(2);
const f4 = (n: number): string => n.toFixed(4);

/**
 * NUCLEO que dispara nova linha (comparado como string exata pelo delta): etapa, saldo a atender
 * (venda), margem, desconto, CBS e IBS. CBS/IBS entram individuais (nao so a soma de impostos)
 * porque a rampa da reforma precisa da granularidade (spec 5.2 / review A2). O resto e snapshotado
 * junto quando algum destes muda.
 */
export function nucleoDe(s: {
  etapaId: number | null;
  saldoAtenderVenda: number;
  alMargem: number;
  vrDesconto: number;
  vrCbs: number;
  vrIbs: number;
}): (string | null)[] {
  return [
    s.etapaId == null ? null : String(s.etapaId),
    f2(s.saldoAtenderVenda),
    f4(s.alMargem),
    f2(s.vrDesconto),
    f2(s.vrCbs),
    f2(s.vrIbs),
  ];
}

/** Mesma formatacao do nucleo, a partir dos valores Decimal|Int|null lidos do vigente no banco. */
export function nucleoDeVigente(v: {
  etapaId: number | null;
  saldoAtenderVenda: unknown;
  alMargem: unknown;
  vrDesconto: unknown;
  vrCbs: unknown;
  vrIbs: unknown;
}): (string | null)[] {
  const num = (x: unknown): number => (x == null ? 0 : Number(x));
  return [
    v.etapaId == null ? null : String(v.etapaId),
    f2(num(v.saldoAtenderVenda)),
    f4(num(v.alMargem)),
    f2(num(v.vrDesconto)),
    f2(num(v.vrCbs)),
    f2(num(v.vrIbs)),
  ];
}

/**
 * Agrega o saldo a atender (venda e custo) por pedido, somando `aAtenderDoItem` dos itens. Puro
 * e testavel. Chamador garante jobOk=true (senao a captura e adiada antes de chegar aqui).
 */
export function agregarSaldoAtender(
  itens: (ItemAtendimento & { pedidoId: number })[],
  custoDe: (produtoId: number) => number | undefined,
  jobOk: boolean,
): Map<number, { custo: number; venda: number }> {
  const out = new Map<number, { custo: number; venda: number }>();
  for (const it of itens) {
    const { custoLinha, vendaLinha } = aAtenderDoItem(it, custoDe, jobOk);
    const ex = out.get(it.pedidoId) ?? { custo: 0, venda: 0 };
    ex.custo += custoLinha;
    ex.venda += vendaLinha;
    out.set(it.pedidoId, ex);
  }
  return out;
}

/** Monta o snapshot completo por pedido a partir do fato + raw jsonb + saldo agregado. Puro. */
export function montarSnapshots(
  pedidos: { odooId: number; etapaId: number | null; etapaNome: string | null; vrProdutos: unknown; dataPrevista: Date | null }[],
  rawPorId: Map<number, unknown>,
  saldoPorPedido: Map<number, { custo: number; venda: number }>,
): Map<number, SnapshotPedido> {
  const out = new Map<number, SnapshotPedido>();
  for (const p of pedidos) {
    const r = extrairRentabilidade(rawPorId.get(p.odooId) ?? null);
    const d = extrairDesconto(rawPorId.get(p.odooId) ?? null);
    const saldo = saldoPorPedido.get(p.odooId) ?? { custo: 0, venda: 0 };
    out.set(p.odooId, {
      pedidoId: p.odooId,
      etapaId: p.etapaId,
      etapaNome: p.etapaNome,
      vrProdutos: p.vrProdutos == null ? 0 : Number(p.vrProdutos),
      vrOperacaoTributacao: r.subtotal,
      vrDesconto: d.descontoValor,
      vrCustoComercial: r.custoComercial,
      vrComissao: r.comissaoValor,
      alMargem: r.margemPct,
      vrLiquido: r.liquido,
      vrIcmsProprio: r.icms,
      vrDifal: r.difal,
      vrFcp: r.fcp,
      vrPisProprio: r.pis,
      vrCofinsProprio: r.cofins,
      vrIrpj: r.irpj,
      vrCsll: r.csll,
      vrCbs: r.cbs,
      vrIbs: r.ibs,
      saldoAtenderCusto: saldo.custo,
      saldoAtenderVenda: saldo.venda,
      dataPrevista: p.dataPrevista,
    });
  }
  return out;
}

export interface ResultadoCapturaPedido {
  rodadaId: string;
  status: "base" | "ok" | "recusada" | "adiada";
  gravadas: number;
}

export async function capturarPedidoValor(
  prisma: PrismaClient,
  agora: Date = new Date(),
): Promise<ResultadoCapturaPedido> {
  // 0) Guarda de timing: sem o job de atendimento fresco, o saldo a atender cai na quantidade
  //    cheia e injetaria mudancas falsas na serie. Adia a rodada (INV-8).
  const job = await atendimentoSincronizado(prisma);
  if (!job.ok) {
    const rodadaId = randomUUID();
    await prisma.fatoCapturaRodada.create({
      data: { id: rodadaId, serie: SERIE, capturadoEm: agora, linhasObservadas: 0, linhasGravadas: 0, status: "adiada", motivo: "job de atendimento nao sincronizado (jobOk=false)" },
    });
    return { rodadaId, status: "adiada", gravadas: 0 };
  }

  // 1) Estado atual: pedidos (escopo do fato), itens, custo por produto, raw jsonb.
  const [pedidos, itens, produtos] = await Promise.all([
    prisma.fatoPedido.findMany({ select: { odooId: true, etapaId: true, etapaNome: true, vrProdutos: true, dataPrevista: true } }),
    prisma.fatoPedidoItem.findMany({ select: { pedidoId: true, produtoId: true, quantidade: true, quantidadeAAtender: true, vrProdutos: true } }),
    prisma.fatoProduto.findMany({ select: { odooId: true, precoCusto: true } }),
  ]);
  const custoMap = new Map<number, number>(produtos.map((p) => [p.odooId, Number(p.precoCusto ?? 0)]));
  const custoDe = (produtoId: number): number | undefined => custoMap.get(produtoId);

  const pedidoIds = pedidos.map((p) => p.odooId);
  const rawDocs = await prisma.rawPedidoDocumento.findMany({
    where: { odooId: { in: pedidoIds }, rawDeleted: false },
    select: { odooId: true, data: true },
  });
  const rawPorId = new Map<number, unknown>(rawDocs.map((r) => [r.odooId, r.data]));

  const saldoPorPedido = agregarSaldoAtender(
    itens.map((it) => ({ pedidoId: it.pedidoId, produtoId: it.produtoId, quantidade: it.quantidade, quantidadeAAtender: it.quantidadeAAtender, vrProdutos: it.vrProdutos })),
    custoDe,
    true,
  );

  const snapshots = montarSnapshots(pedidos, rawPorId, saldoPorPedido);

  // 2) linhas atuais (chave=pedidoId, valores=nucleo).
  const atuais: LinhaSerie[] = [...snapshots.values()].map((s) => ({ chave: String(s.pedidoId), valores: nucleoDe(s) }));

  // 3) vigente anterior.
  const vigentesRows = await prisma.fatoPedidoValorHistorico.findMany({
    where: { vigente: true },
    select: { pedidoId: true, etapaId: true, saldoAtenderVenda: true, alMargem: true, vrDesconto: true, vrCbs: true, vrIbs: true },
  });
  const vigentes: LinhaSerie[] = vigentesRows.map((v) => ({ chave: String(v.pedidoId), valores: nucleoDeVigente(v) }));

  // 4) delta.
  const delta = calcularDelta(atuais, vigentes);
  const baixas = delta.filter((d) => d.evento === "baixa").length;

  // 5) guarda (teto proprio da serie de pedido).
  const decisao = decidirRodada(
    {
      baixasNestaRodada: baixas,
      temBaseAnterior: await temBaseAnterior(prisma, SERIE),
      recusadasSeguidas: await recusadasSeguidas(prisma, SERIE),
    },
    TETO_BAIXAS_PEDIDO,
  );

  const rodadaId = randomUUID();

  if (decisao.status === "recusada" || delta.length === 0) {
    await prisma.fatoCapturaRodada.create({
      data: { id: rodadaId, serie: SERIE, capturadoEm: agora, linhasObservadas: atuais.length, linhasGravadas: 0, status: decisao.status, motivo: decisao.motivo },
    });
    return { rodadaId, status: decisao.status, gravadas: 0 };
  }

  const afetadas = delta.map((d) => Number(d.chave));
  const linhasNovas = delta.map((d) => {
    const pedidoId = Number(d.chave);
    if (d.evento === "baixa") {
      return { rodadaId, capturadoEm: agora, pedidoId, etapaId: null, etapaNome: null, evento: "baixa", vigente: true } as const;
    }
    const s = snapshots.get(pedidoId)!;
    return {
      rodadaId,
      capturadoEm: agora,
      pedidoId,
      etapaId: s.etapaId,
      etapaNome: s.etapaNome,
      vrProdutos: s.vrProdutos,
      vrOperacaoTributacao: s.vrOperacaoTributacao,
      vrDesconto: s.vrDesconto,
      vrCustoComercial: s.vrCustoComercial,
      vrComissao: s.vrComissao,
      alMargem: s.alMargem,
      vrLiquido: s.vrLiquido,
      vrIcmsProprio: s.vrIcmsProprio,
      vrDifal: s.vrDifal,
      vrFcp: s.vrFcp,
      vrPisProprio: s.vrPisProprio,
      vrCofinsProprio: s.vrCofinsProprio,
      vrIrpj: s.vrIrpj,
      vrCsll: s.vrCsll,
      vrCbs: s.vrCbs,
      vrIbs: s.vrIbs,
      saldoAtenderCusto: s.saldoAtenderCusto,
      saldoAtenderVenda: s.saldoAtenderVenda,
      dataPrevista: s.dataPrevista,
      evento: "mudanca",
      vigente: true,
    };
  });

  await prisma.$transaction(
    async (tx) => {
      if (vigentes.length > 0) {
        for (const lote of emLotes(afetadas, LOTE_UPDATE)) {
          await tx.fatoPedidoValorHistorico.updateMany({
            where: { vigente: true, pedidoId: { in: lote } },
            data: { vigente: false },
          });
        }
      }
      for (const lote of emLotes(linhasNovas, LOTE_INSERT)) {
        await tx.fatoPedidoValorHistorico.createMany({ data: lote });
      }
      await tx.fatoCapturaRodada.create({
        data: { id: rodadaId, serie: SERIE, capturadoEm: agora, linhasObservadas: atuais.length, linhasGravadas: delta.length, status: decisao.status, motivo: decisao.motivo },
      });
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  return { rodadaId, status: decisao.status, gravadas: delta.length };
}
