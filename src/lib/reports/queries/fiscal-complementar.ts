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
      // Onda 5: desempate estavel por odooId (apuracoes com mesma dataInicial).
      orderBy: [{ dataInicial: "desc" }, { odooId: "asc" }],
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
  filtros: { documentoId?: number; limit?: number; offset?: number },
): Promise<{ linhas: CartaCorrecaoLinha[]; total: number; truncado: boolean }> {
  const where = filtros.documentoId != null ? { documentoId: filtros.documentoId } : {};
  // Alavanca 2b: paginação via take/skip + desempate estável por odooId.
  const [rows, total] = await Promise.all([
    prisma.fatoCartaCorrecao.findMany({
      where,
      orderBy: [{ dataAutorizacao: "desc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoCartaCorrecao.count({ where }),
  ]);
  const offset = filtros.offset ?? 0;
  return { linhas: rows.map(toCartaLinha), total, truncado: offset + rows.length < total };
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
 * que vence por último. Volume baixo (~11), mas paginado por consistência
 * (alavanca 2b): take/skip + desempate estável por odooId. */
export async function queryCertificados(
  prisma: PrismaClient,
  filtros: { limit?: number; offset?: number } = {},
): Promise<{ linhas: CertificadoLinha[]; total: number; truncado: boolean }> {
  const [rows, total] = await Promise.all([
    prisma.fatoCertificado.findMany({
      orderBy: [{ dataFimValidade: "asc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoCertificado.count(),
  ]);
  const offset = filtros.offset ?? 0;
  return { linhas: rows.map(toCertificadoLinha), total, truncado: offset + rows.length < total };
}

// ---------------------------------------------------------------------------
// MDF-e (manifesto de transporte) , B2 estrutural (fato_mdfe)
// ---------------------------------------------------------------------------

/** Intervalo de datas a partir de "AAAA-MM-DD" (início e fim inclusivos). */
function rangeData(de?: string, ate?: string): { gte?: Date; lte?: Date } | undefined {
  const r: { gte?: Date; lte?: Date } = {};
  if (de) r.gte = new Date(`${de}T00:00:00.000Z`);
  if (ate) r.lte = new Date(`${ate}T23:59:59.999Z`);
  return r.gte || r.lte ? r : undefined;
}

export interface MdfeLinha {
  odooId: number;
  chave: string | null;
  numero: string | null;
  situacaoMdfe: string | null;
  empresaCnpj: string | null;
  dataEmissao: string | null;
  municipioCarregamento: string | null;
  municipioDescarregamento: string | null;
  vrNf: number;
}

/** Conta total de MDF-e no fato (independe de filtro). Serve à resposta
 * honesta "não operado" enquanto o módulo não emite manifestos. */
export async function fatoMdfeCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoMdfe.count();
}

/** Lista MDF-e no período (mais recente primeiro), filtrando por data de
 * emissão e situação. */
export async function queryMdfeManifestos(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; situacao?: string; limit?: number; offset?: number },
): Promise<{ linhas: MdfeLinha[]; total: number; truncado: boolean }> {
  const periodo = rangeData(filtros.periodoDe, filtros.periodoAte);
  const where = {
    ...(periodo ? { dataEmissao: periodo } : {}),
    ...(filtros.situacao ? { situacaoMdfe: filtros.situacao } : {}),
  };
  // Alavanca 2b: paginação via take/skip + desempate estável por odooId.
  const [rows, total] = await Promise.all([
    prisma.fatoMdfe.findMany({
      where,
      orderBy: [{ dataEmissao: "desc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoMdfe.count({ where }),
  ]);
  const offset = filtros.offset ?? 0;
  const linhas: MdfeLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    chave: r.chave,
    numero: r.numero,
    situacaoMdfe: r.situacaoMdfe,
    empresaCnpj: r.empresaCnpj,
    dataEmissao: dia(r.dataEmissao),
    municipioCarregamento: r.municipioCarregamento,
    municipioDescarregamento: r.municipioDescarregamento,
    vrNf: r.vrNf.toNumber(),
  }));
  return { linhas, total, truncado: offset + rows.length < total };
}

// ---------------------------------------------------------------------------
// REINF (eventos de obrigação acessória) , B2 estrutural (fato_reinf_evento)
// ---------------------------------------------------------------------------

export interface ReinfLinha {
  odooId: number;
  chave: string | null;
  tipo: string | null;
  situacao: string | null;
  protocoloTransmissao: string | null;
  empresaCnpjRaiz: string | null;
  dataEvento: string | null;
}

/** Conta total de eventos REINF no fato (independe de filtro). Serve à
 * resposta honesta "não operado". */
export async function fatoReinfCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoReinfEvento.count();
}

/** Lista eventos REINF no período (mais recente primeiro), filtrando por data
 * do evento, tipo e situação. */
export async function queryReinfEventos(
  prisma: PrismaClient,
  filtros: {
    periodoDe?: string;
    periodoAte?: string;
    tipo?: string;
    situacao?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ linhas: ReinfLinha[]; total: number; truncado: boolean }> {
  const periodo = rangeData(filtros.periodoDe, filtros.periodoAte);
  const where = {
    ...(periodo ? { dataEvento: periodo } : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    ...(filtros.situacao ? { situacao: filtros.situacao } : {}),
  };
  // Alavanca 2b: paginação via take/skip + desempate estável por odooId.
  const [rows, total] = await Promise.all([
    prisma.fatoReinfEvento.findMany({
      where,
      orderBy: [{ dataEvento: "desc" }, { odooId: "asc" }],
      take: filtros.limit,
      skip: filtros.offset,
    }),
    prisma.fatoReinfEvento.count({ where }),
  ]);
  const offset = filtros.offset ?? 0;
  const linhas: ReinfLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    chave: r.chave,
    tipo: r.tipo,
    situacao: r.situacao,
    protocoloTransmissao: r.protocoloTransmissao,
    empresaCnpjRaiz: r.empresaCnpjRaiz,
    dataEvento: dia(r.dataEvento),
  }));
  return { linhas, total, truncado: offset + rows.length < total };
}
