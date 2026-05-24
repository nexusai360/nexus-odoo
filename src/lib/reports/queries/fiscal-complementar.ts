// src/lib/reports/queries/fiscal-complementar.ts
//
// Consultas fiscais complementares (F4 L1a Onda 4): apurações fiscais e cartas
// de correção. Framework-neutro: recebe `prisma` + filtros, devolve dados
// crus. `withFreshness` vive no handler MCP.
// Fontes: fato_apuracao, fato_carta_correcao.

import type { PrismaClient } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Apuração fiscal
// ---------------------------------------------------------------------------

export interface ApuracaoLinha {
  odooId: number;
  empresaNome: string | null;
  dataInicial: string | null;
  dataFinal: string | null;
  tipo: string | null;
  entregue: boolean;
  regimeTributario: string | null;
  vrIcmsARecolher: number;
  vrIcmsSaldoCredor: number;
  vrIpiARecolher: number;
  vrPisARecolher: number;
  vrCofinsARecolher: number;
}

type ApuracaoRow = {
  odooId: number;
  empresaNome: string | null;
  dataInicial: Date | null;
  dataFinal: Date | null;
  tipo: string | null;
  entregue: boolean;
  regimeTributario: string | null;
  vrIcmsARecolher: { toNumber(): number };
  vrIcmsSaldoCredor: { toNumber(): number };
  vrIpiARecolher: { toNumber(): number };
  vrPisARecolher: { toNumber(): number };
  vrCofinsARecolher: { toNumber(): number };
};

function dia(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function toApuracaoLinha(r: ApuracaoRow): ApuracaoLinha {
  return {
    odooId: r.odooId,
    empresaNome: r.empresaNome,
    dataInicial: dia(r.dataInicial),
    dataFinal: dia(r.dataFinal),
    tipo: r.tipo,
    entregue: r.entregue,
    regimeTributario: r.regimeTributario,
    vrIcmsARecolher: r.vrIcmsARecolher.toNumber(),
    vrIcmsSaldoCredor: r.vrIcmsSaldoCredor.toNumber(),
    vrIpiARecolher: r.vrIpiARecolher.toNumber(),
    vrPisARecolher: r.vrPisARecolher.toNumber(),
    vrCofinsARecolher: r.vrCofinsARecolher.toNumber(),
  };
}

/** Lista apurações fiscais, opcionalmente filtrando por `tipo`
 * ("ICMS-IPI" ou "PIS-COFINS"). Ordena da mais recente para a mais antiga. */
export async function queryApuracaoFiscal(
  prisma: PrismaClient,
  filtros: { tipo?: string; limite?: number },
): Promise<{ linhas: ApuracaoLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 50;
  const where = filtros.tipo ? { tipo: filtros.tipo } : {};
  const [rows, total] = await Promise.all([
    prisma.fatoApuracao.findMany({
      where,
      orderBy: { dataInicial: "desc" },
      take: limite,
    }),
    prisma.fatoApuracao.count({ where }),
  ]);
  return { linhas: rows.map(toApuracaoLinha), total, truncado: total > rows.length };
}

// ---------------------------------------------------------------------------
// Cartas de correção
// ---------------------------------------------------------------------------

export interface CartaCorrecaoLinha {
  odooId: number;
  descricao: string | null;
  correcao: string | null;
  documentoId: number | null;
  dataAutorizacao: string | null;
  protocoloAutorizacao: string | null;
  sequencia: number | null;
}

type CartaRow = Omit<CartaCorrecaoLinha, "dataAutorizacao"> & {
  dataAutorizacao: Date | null;
};

function toCartaLinha(r: CartaRow): CartaCorrecaoLinha {
  return { ...r, dataAutorizacao: dia(r.dataAutorizacao) };
}

/** Lista cartas de correção, opcionalmente filtrando por `documentoId` (o
 * documento fiscal corrigido). Ordena da mais recente para a mais antiga. */
export async function queryCartaCorrecao(
  prisma: PrismaClient,
  filtros: { documentoId?: number; limite?: number },
): Promise<{ linhas: CartaCorrecaoLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 100;
  const where = filtros.documentoId != null ? { documentoId: filtros.documentoId } : {};
  const [rows, total] = await Promise.all([
    prisma.fatoCartaCorrecao.findMany({
      where,
      orderBy: { dataAutorizacao: "desc" },
      take: limite,
    }),
    prisma.fatoCartaCorrecao.count({ where }),
  ]);
  return { linhas: rows.map(toCartaLinha), total, truncado: total > rows.length };
}

// ---------------------------------------------------------------------------
// Certificados digitais
// ---------------------------------------------------------------------------

export interface CertificadoLinha {
  odooId: number;
  tipo: string | null;
  numeroSerie: string | null;
  proprietario: string | null;
  cnpjCpf: string | null;
  dataInicioValidade: string | null;
  dataFimValidade: string | null;
  dataVencimentoUtil: string | null;
  nomeArquivo: string | null;
}

type CertificadoRow = {
  odooId: number;
  tipo: string | null;
  numeroSerie: string | null;
  proprietario: string | null;
  cnpjCpf: string | null;
  dataInicioValidade: Date | null;
  dataFimValidade: Date | null;
  dataVencimentoUtil: Date | null;
  nomeArquivo: string | null;
};

function toCertificadoLinha(r: CertificadoRow): CertificadoLinha {
  return {
    odooId: r.odooId,
    tipo: r.tipo,
    numeroSerie: r.numeroSerie,
    proprietario: r.proprietario,
    cnpjCpf: r.cnpjCpf,
    dataInicioValidade: dia(r.dataInicioValidade),
    dataFimValidade: dia(r.dataFimValidade),
    dataVencimentoUtil: dia(r.dataVencimentoUtil),
    nomeArquivo: r.nomeArquivo,
  };
}

/** Lista os certificados digitais cadastrados, do que vence primeiro para o
 * que vence por último. Volume baixo (~11): sem paginação. */
export async function queryCertificados(
  prisma: PrismaClient,
): Promise<{ linhas: CertificadoLinha[]; total: number }> {
  const [rows, total] = await Promise.all([
    prisma.fatoCertificado.findMany({ orderBy: { dataFimValidade: "asc" } }),
    prisma.fatoCertificado.count(),
  ]);
  return { linhas: rows.map(toCertificadoLinha), total };
}
