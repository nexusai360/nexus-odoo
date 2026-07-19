// src/lib/estoque/serie-historico.ts
// Consulta do historico temporal (as 4 pontas: Diretoria, Relatorios, Nex, BI). Tres funcoes,
// todas fonte unica, todas respeitando a data de inicio das analises com a MESMA regra:
//
// - a JANELA exibida (`de`, `ate`) e grampeada ao corte (clampIsoAoCorte), como toda consulta;
// - o CARRY-FORWARD (o valor vigente no inicio da janela) e leitura de ESTADO, nao de fato
//   analisado, e alcanca ANTES do corte por desenho , senao todo preco estavel ha meses faria
//   o grafico comecar no ar. Isto esta em docs/kpis-diretoria.md, para nao ser "corrigido" de
//   volta em nome da regra do corte.
//
// "Nao mudou" nao e "nao observamos": as consultas devolvem as LACUNAS de observacao do
// periodo (rodadas recusadas + ausencias inferidas de fato_captura_rodada).
import type { PrismaClient } from "@/generated/prisma/client";
import { clampIsoAoCorte, getCorteDados } from "@/lib/corte-dados";

export interface PontoPreco {
  capturadoEm: Date;
  valor: string | null;
  evento: string;
}
export interface Lacuna {
  de: Date;
  ate: Date;
  tipo: "ausencia" | "recusada";
}
export interface SeriePrecoResultado {
  inicial: string | null;
  pontos: PontoPreco[];
  lacunas: Lacuna[];
}

export interface PontoSaldo {
  capturadoEm: Date;
  quantidade: string | null;
  vrSaldo: string | null;
  evento: string;
}
export interface SerieSaldoResultado {
  inicial: { quantidade: string | null; vrSaldo: string | null } | null;
  pontos: PontoSaldo[];
  lacunas: Lacuna[];
}

export interface MovLinha {
  data: Date;
  localId: number | null;
  localNome: string | null;
  quantidade: string | null;
  sentido: string | null;
  origem: string | null;
}
export interface MovimentacaoResultado {
  movimentos: MovLinha[];
  localSemExtrato: boolean;
}

/** Intervalo nominal (ms) por serie, para inferir "ausencia" (gap entre rodadas ok > 2x). */
const INTERVALO_MS: Record<"preco" | "saldo", number> = {
  preco: 10 * 60_000,
  saldo: 30 * 60_000,
};

async function lacunas(
  prisma: PrismaClient,
  serie: "preco" | "saldo",
  de: Date,
  ate: Date,
): Promise<Lacuna[]> {
  const rodadas = await prisma.fatoCapturaRodada.findMany({
    where: { serie, capturadoEm: { gte: de, lte: ate } },
    orderBy: { capturadoEm: "asc" },
    select: { capturadoEm: true, status: true },
  });
  const out: Lacuna[] = [];
  for (const r of rodadas) {
    if (r.status === "recusada") out.push({ de: r.capturadoEm, ate: r.capturadoEm, tipo: "recusada" });
  }
  const oks = rodadas.filter((r) => r.status !== "recusada");
  for (let i = 1; i < oks.length; i++) {
    const gap = oks[i].capturadoEm.getTime() - oks[i - 1].capturadoEm.getTime();
    if (gap > 2 * INTERVALO_MS[serie]) {
      out.push({ de: oks[i - 1].capturadoEm, ate: oks[i].capturadoEm, tipo: "ausencia" });
    }
  }
  return out;
}

export async function serieDePreco(
  prisma: PrismaClient,
  produtoId: number,
  tabelaId: number,
  quantidadeMinima: number | undefined,
  deIso: string,
  ateIso: string,
): Promise<SeriePrecoResultado> {
  const corte = await getCorteDados(prisma);
  const de = new Date(clampIsoAoCorte(deIso, corte)); // janela grampeada ao corte
  const ate = new Date(ateIso);
  const chave = { produtoId, tabelaId, ...(quantidadeMinima !== undefined ? { quantidadeMinima } : {}) };

  // carry-forward: ultimo registro ANTES da janela, SEM clamp (estado, alcanca antes do corte).
  const anterior = await prisma.fatoPrecoHistorico.findFirst({
    where: { ...chave, capturadoEm: { lt: de } },
    orderBy: { capturadoEm: "desc" },
    select: { valor: true },
  });
  const pontos = await prisma.fatoPrecoHistorico.findMany({
    where: { ...chave, capturadoEm: { gte: de, lte: ate } },
    orderBy: { capturadoEm: "asc" },
    select: { capturadoEm: true, valor: true, evento: true },
  });
  return {
    inicial: anterior?.valor?.toString() ?? null,
    pontos: pontos.map((p) => ({ capturadoEm: p.capturadoEm, valor: p.valor?.toString() ?? null, evento: p.evento })),
    lacunas: await lacunas(prisma, "preco", de, ate),
  };
}

export async function serieDeSaldo(
  prisma: PrismaClient,
  produtoId: number,
  localId: number | undefined,
  deIso: string,
  ateIso: string,
): Promise<SerieSaldoResultado> {
  const corte = await getCorteDados(prisma);
  const de = new Date(clampIsoAoCorte(deIso, corte));
  const ate = new Date(ateIso);
  const chave = { produtoId, ...(localId !== undefined ? { localId } : {}) };

  const anterior = await prisma.fatoEstoqueSaldoHistorico.findFirst({
    where: { ...chave, capturadoEm: { lt: de } },
    orderBy: { capturadoEm: "desc" },
    select: { quantidade: true, vrSaldo: true },
  });
  const pontos = await prisma.fatoEstoqueSaldoHistorico.findMany({
    where: { ...chave, capturadoEm: { gte: de, lte: ate } },
    orderBy: { capturadoEm: "asc" },
    select: { capturadoEm: true, quantidade: true, vrSaldo: true, evento: true },
  });
  return {
    inicial: anterior
      ? { quantidade: anterior.quantidade?.toString() ?? null, vrSaldo: anterior.vrSaldo?.toString() ?? null }
      : null,
    pontos: pontos.map((p) => ({
      capturadoEm: p.capturadoEm,
      quantidade: p.quantidade?.toString() ?? null,
      vrSaldo: p.vrSaldo?.toString() ?? null,
      evento: p.evento,
    })),
    lacunas: await lacunas(prisma, "saldo", de, ate),
  };
}

export async function movimentacao(
  prisma: PrismaClient,
  produtoId: number,
  localId: number | undefined,
  deIso: string,
  ateIso: string,
): Promise<MovimentacaoResultado> {
  const corte = await getCorteDados(prisma);
  const de = new Date(clampIsoAoCorte(deIso, corte));
  const ate = new Date(ateIso);
  const chave = { produtoId, ...(localId !== undefined ? { localId } : {}) };

  const movs = await prisma.fatoEstoqueMovimento.findMany({
    where: { ...chave, data: { gte: de, lte: ate } },
    orderBy: { data: "asc" },
    select: { data: true, localId: true, localNome: true, quantidade: true, sentido: true, origem: true },
  });

  // localSemExtrato: ha saldo para (produto[,local]) mas nenhum movimento em TODA a serie do
  // extrato. Distingue "nada se moveu" (que teria movimento antigo) de "o extrato nao cobre
  // este local" , 2 locais fisicos com saldo nao aparecem no extrato (pericia 2026-07-19).
  let localSemExtrato = false;
  if (movs.length === 0) {
    const temSaldo = await prisma.fatoEstoqueSaldo.count({ where: chave });
    const temQualquerMov = await prisma.fatoEstoqueMovimento.count({ where: chave });
    localSemExtrato = temSaldo > 0 && temQualquerMov === 0;
  }

  return {
    movimentos: movs.map((m) => ({
      data: m.data,
      localId: m.localId,
      localNome: m.localNome,
      quantidade: m.quantidade?.toString() ?? null,
      sentido: m.sentido,
      origem: m.origem,
    })),
    localSemExtrato,
  };
}
