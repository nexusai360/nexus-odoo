// src/lib/reports/queries/financeiro.ts
//
// Núcleo de agregação de financeiro, framework-neutro. Cada função recebe `prisma`
// + filtros e devolve dado de agregação cru — **sem `estado`, sem `freshness`,
// sem shaping de serialização**. **Não captura exceção** (deixa propagar — quem
// trata é o wrapper/handler). `estadoDoFato`/`withFreshness` vivem no handler
// MCP, não aqui.
//
// Campos monetários são `Decimal` no Prisma — converter via `Number()` no shaping.
// `diasAtraso` é calculado NA QUERY (não materializado) — usa `mcp/lib/dias-atraso.ts`.
// Funções implementadas nas tasks 4d.1-q … 4d.7-q (sequenciais — mesmo arquivo).

import type { PrismaClient } from "@/generated/prisma/client";
import { diasAtraso as calcDiasAtraso } from "../../../../mcp/lib/dias-atraso";

// ---------------------------------------------------------------------------
// querySaldoContas — fato_financeiro_saldo (task 4d.1-q)
// ---------------------------------------------------------------------------

export async function querySaldoContas(
  prisma: PrismaClient,
): Promise<{ contas: { bancoNome: string | null; tipo: string | null; saldo: number }[]; saldoTotal: number }> {
  const rows = await prisma.fatoFinanceiroSaldo.findMany({
    select: { bancoNome: true, tipo: true, saldo: true },
  });
  const contas = rows.map((r) => ({
    bancoNome: r.bancoNome,
    tipo: r.tipo,
    saldo: Number(r.saldo),
  }));
  const saldoTotal = contas.reduce((acc, c) => acc + c.saldo, 0);
  return { contas, saldoTotal };
}

// ---------------------------------------------------------------------------
// queryCaixaPeriodo — fato_financeiro_movimento (task 4d.2-q)
// ---------------------------------------------------------------------------

export async function queryCaixaPeriodo(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ entrada: number; saida: number; saldo: number }> {
  const where =
    filtros.periodoDe && filtros.periodoAte
      ? { data: { gte: new Date(filtros.periodoDe), lte: new Date(filtros.periodoAte) } }
      : {};

  const rows = await prisma.fatoFinanceiroMovimento.findMany({
    where,
    select: { entrada: true, saida: true },
  });

  let entrada = 0;
  let saida = 0;
  for (const r of rows) {
    entrada += Number(r.entrada);
    saida += Number(r.saida);
  }
  const saldo = entrada - saida;
  return { entrada, saida, saldo };
}

// ---------------------------------------------------------------------------
// queryFluxoCaixa — fato_financeiro_movimento (task 4d.3-q)
// ---------------------------------------------------------------------------

export async function queryFluxoCaixa(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string },
): Promise<{ serie: { periodo: string; realizado: number; previsto: number }[] }> {
  const where =
    filtros.periodoDe && filtros.periodoAte
      ? { data: { gte: new Date(filtros.periodoDe), lte: new Date(filtros.periodoAte) } }
      : {};

  const rows = await prisma.fatoFinanceiroMovimento.findMany({
    where,
    select: { data: true, valor: true, valorPrevisto: true },
  });

  const mapa = new Map<string, { realizado: number; previsto: number }>();
  for (const r of rows) {
    if (!r.data) continue; // linha sem data — ignorar na série
    const periodo = r.data.toISOString().slice(0, 7); // YYYY-MM
    const existing = mapa.get(periodo) ?? { realizado: 0, previsto: 0 };
    existing.realizado += Number(r.valor);
    existing.previsto += Number(r.valorPrevisto);
    mapa.set(periodo, existing);
  }

  const serie = [...mapa.entries()]
    .map(([periodo, v]) => ({ periodo, realizado: v.realizado, previsto: v.previsto }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  return { serie };
}

// ---------------------------------------------------------------------------
// Tipo compartilhado de título (a receber / a pagar)
// ---------------------------------------------------------------------------

export interface TituloRow {
  participanteNome: string | null;
  numeroDocumento: string | null;
  dataVencimento: Date | null;
  vrSaldo: number;
  diasAtraso: number;
}

// ---------------------------------------------------------------------------
// queryContasAReceber — fato_financeiro_titulo (task 4d.5-q)
// CRITERIO_ABERTO: { situacaoSimples: 'aberto' } — corrigido 2026-05-18.
//   dataPagamento nunca é null (finan.pagamento.divida é registro de pagamento).
//   situacao_divida_simples é o oráculo: aberto|quitado|baixado|provisorio.
// tipo "a_receber" — derivado do campo raw.tipo === "recebimento" pelo builder.
// ---------------------------------------------------------------------------

export async function queryContasAReceber(
  prisma: PrismaClient,
  filtros: { participanteId?: number },
  hoje: Date,
): Promise<{ titulos: TituloRow[]; totalAReceber: number }> {
  const rows = await prisma.fatoFinanceiroTitulo.findMany({
    where: {
      tipo: "a_receber",
      situacaoSimples: "aberto",
      ...(filtros.participanteId ? { participanteId: filtros.participanteId } : {}),
    },
    select: {
      participanteNome: true,
      numeroDocumento: true,
      dataVencimento: true,
      vrSaldo: true,
    },
  });

  const titulos: TituloRow[] = rows.map((r) => ({
    participanteNome: r.participanteNome,
    numeroDocumento: r.numeroDocumento,
    dataVencimento: r.dataVencimento,
    vrSaldo: Number(r.vrSaldo),
    diasAtraso: calcDiasAtraso(r.dataVencimento, hoje),
  }));

  const totalAReceber = titulos.reduce((acc, t) => acc + t.vrSaldo, 0);
  return { titulos, totalAReceber };
}

// ---------------------------------------------------------------------------
// queryContasAPagar — fato_financeiro_titulo (task 4d.6-q)
// CRITERIO_ABERTO: { situacaoSimples: 'aberto' } — corrigido 2026-05-18.
//   dataPagamento nunca é null (finan.pagamento.divida é registro de pagamento).
// tipo "a_pagar" — derivado do campo raw.tipo === "pagamento" pelo builder.
// ---------------------------------------------------------------------------

export async function queryContasAPagar(
  prisma: PrismaClient,
  filtros: { participanteId?: number },
  hoje: Date,
): Promise<{ titulos: TituloRow[]; totalAPagar: number }> {
  const rows = await prisma.fatoFinanceiroTitulo.findMany({
    where: {
      tipo: "a_pagar",
      situacaoSimples: "aberto",
      ...(filtros.participanteId ? { participanteId: filtros.participanteId } : {}),
    },
    select: {
      participanteNome: true,
      numeroDocumento: true,
      dataVencimento: true,
      vrSaldo: true,
    },
  });

  const titulos: TituloRow[] = rows.map((r) => ({
    participanteNome: r.participanteNome,
    numeroDocumento: r.numeroDocumento,
    dataVencimento: r.dataVencimento,
    vrSaldo: Number(r.vrSaldo),
    diasAtraso: calcDiasAtraso(r.dataVencimento, hoje),
  }));

  const totalAPagar = titulos.reduce((acc, t) => acc + t.vrSaldo, 0);
  return { titulos, totalAPagar };
}

// ---------------------------------------------------------------------------
// TituloVencidoRow — inclui tipo (task 4d.7-q)
// ---------------------------------------------------------------------------

export interface TituloVencidoRow {
  tipo: string;
  participanteNome: string | null;
  numeroDocumento: string | null;
  dataVencimento: Date | null;
  vrSaldo: number;
  diasAtraso: number;
}

// ---------------------------------------------------------------------------
// queryTitulosVencidos — fato_financeiro_titulo (task 4d.7-q)
// CRITERIO_ABERTO: { situacaoSimples: 'aberto' } — corrigido 2026-05-18.
//   dataPagamento nunca é null (finan.pagamento.divida é registro de pagamento).
//   Só títulos abertos E com dataVencimento < início do dia de hoje estão vencidos.
// ---------------------------------------------------------------------------

export async function queryTitulosVencidos(
  prisma: PrismaClient,
  hoje: Date,
): Promise<{ titulos: TituloVencidoRow[]; totalVencido: number }> {
  // Normaliza para início do dia local — reutiliza o mesmo padrão de
  // dias-atraso.ts — para que um título que vence HOJE (gravado como
  // T00:00:00) não seja incluído como vencido. Só está vencido quem venceu
  // ANTES de hoje, i.e. diasAtraso > 0.
  const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  const rows = await prisma.fatoFinanceiroTitulo.findMany({
    where: {
      situacaoSimples: "aberto",
      dataVencimento: { lt: inicioDoDia },
    },
    select: {
      tipo: true,
      participanteNome: true,
      numeroDocumento: true,
      dataVencimento: true,
      vrSaldo: true,
    },
  });

  const titulos: TituloVencidoRow[] = rows.map((r) => ({
    tipo: r.tipo,
    participanteNome: r.participanteNome,
    numeroDocumento: r.numeroDocumento,
    dataVencimento: r.dataVencimento,
    vrSaldo: Number(r.vrSaldo),
    diasAtraso: calcDiasAtraso(r.dataVencimento, hoje),
  }));

  const totalVencido = titulos.reduce((acc, t) => acc + t.vrSaldo, 0);
  return { titulos, totalVencido };
}
