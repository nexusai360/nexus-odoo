// Queries de Pedidos & Entregas (módulo B do HTML) , demandas pendentes de
// entrega. "Pendente" = pedido cuja etapa não finaliza (etapaFinaliza = false).
// UF do cliente vem de fato_parceiro.uf (normalizado por siglaDeUf).

import type { PrismaClient } from "@/generated/prisma/client";

import { siglaDeUf } from "@/lib/diretoria/uf";

export interface FiltrosDemandas {
  ufs?: string[];
}

async function ufPorParticipante(
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

interface PedidoPendenteRow {
  numero: string | null;
  participanteId: number | null;
  participanteNome: string | null;
  etapaNome: string | null;
  dataPrevista: Date | null;
  vrProdutos: unknown;
  vrNf: unknown;
}

async function carregarPendentes(
  prisma: PrismaClient,
): Promise<PedidoPendenteRow[]> {
  return prisma.fatoPedido.findMany({
    where: { etapaFinaliza: false },
    select: {
      numero: true,
      participanteId: true,
      participanteNome: true,
      etapaNome: true,
      dataPrevista: true,
      vrProdutos: true,
      vrNf: true,
    },
  });
}

export interface DemandaUf {
  uf: string;
  quantidade: number;
  valorTotal: number;
}

/** B4 , Demandas (pedidos pendentes) por estado. Valor = total dos produtos. */
export async function queryDemandasPorUf(
  prisma: PrismaClient,
  filtros: FiltrosDemandas = {},
): Promise<{ linhas: DemandaUf[]; valorGeral: number }> {
  const pedidos = await carregarPendentes(prisma);
  const ufMap = await ufPorParticipante(
    prisma,
    [...new Set(pedidos.map((p) => p.participanteId).filter((x): x is number => x != null))],
  );
  const escopo = filtros.ufs && filtros.ufs.length ? new Set(filtros.ufs) : null;

  const map = new Map<string, { quantidade: number; valorTotal: number }>();
  let valorGeral = 0;
  for (const p of pedidos) {
    const uf = p.participanteId != null ? ufMap.get(p.participanteId) ?? "??" : "??";
    if (escopo && !escopo.has(uf)) continue;
    const v = Number(p.vrProdutos);
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

/** B6 , Indicadores das demandas. Atrasada = data prevista já passou. */
export async function queryIndicadoresDemandas(
  prisma: PrismaClient,
  hoje: Date,
): Promise<IndicadoresDemandas> {
  const pedidos = await carregarPendentes(prisma);
  let valorAEntregar = 0;
  let atrasadas = 0;
  for (const p of pedidos) {
    valorAEntregar += Number(p.vrProdutos);
    if (p.dataPrevista && p.dataPrevista < hoje) atrasadas += 1;
  }
  return { totalPendentes: pedidos.length, valorAEntregar, atrasadas };
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

/** B2 , Lista de pedidos pendentes (cliente, UF, etapa, prazo, valor). */
export async function queryDemandasPendentes(
  prisma: PrismaClient,
  hoje: Date,
  filtros: FiltrosDemandas = {},
): Promise<{ linhas: DemandaLinha[] }> {
  const pedidos = await carregarPendentes(prisma);
  const ufMap = await ufPorParticipante(
    prisma,
    [...new Set(pedidos.map((p) => p.participanteId).filter((x): x is number => x != null))],
  );
  const escopo = filtros.ufs && filtros.ufs.length ? new Set(filtros.ufs) : null;

  const linhas: DemandaLinha[] = [];
  for (const p of pedidos) {
    const uf = p.participanteId != null ? ufMap.get(p.participanteId) ?? "??" : "??";
    if (escopo && !escopo.has(uf)) continue;
    linhas.push({
      numero: p.numero,
      cliente: p.participanteNome,
      uf,
      etapa: p.etapaNome,
      dataPrevista: p.dataPrevista ? p.dataPrevista.toISOString().slice(0, 10) : null,
      valor: Number(p.vrProdutos),
      atrasado: p.dataPrevista != null && p.dataPrevista < hoje,
    });
  }
  linhas.sort((a, b) => b.valor - a.valor);
  return { linhas };
}
