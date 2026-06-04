// src/lib/reports/queries/cobranca-bancaria.ts
//
// Consultas de cobrança bancária (B3). Framework-neutro: recebe `prisma` +
// filtros, devolve dados crus. `withFreshness` vive no handler MCP.
// Fontes: fato_retorno_item, fato_retorno_bancario, fato_remessa_bancaria,
// fato_carteira_cobranca, fato_cheque, fato_pix.
import type { PrismaClient } from "@/generated/prisma/client";

function dia(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
function rangeData(de?: string, ate?: string): { gte?: Date; lte?: Date } | undefined {
  const r: { gte?: Date; lte?: Date } = {};
  if (de) r.gte = new Date(`${de}T00:00:00.000Z`);
  if (ate) r.lte = new Date(`${ate}T23:59:59.999Z`);
  return r.gte || r.lte ? r : undefined;
}

// ── Baixas de cobrança (finan.retorno.item) , o grão rico ───────────────────
export interface BaixaLinha {
  odooId: number;
  situacao: string | null;
  nossoNumero: string | null;
  dataPagamento: string | null;
  participante: string | null;
  vrDocumento: number;
  vrJuros: number;
  vrMulta: number;
  vrDesconto: number;
  vrTarifas: number;
  vrBaixado: number;
  vrTotal: number;
}
export async function fatoBaixaCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoRetornoItem.count();
}
export async function queryBaixasCobranca(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; situacao?: string; limit: number; offset: number },
): Promise<{ linhas: BaixaLinha[]; total: number; truncado: boolean }> {
  const { limit, offset } = filtros;
  const periodo = rangeData(filtros.periodoDe, filtros.periodoAte);
  const where = {
    ...(periodo ? { dataPagamento: periodo } : {}),
    ...(filtros.situacao ? { situacao: filtros.situacao } : {}),
  };
  const [rows, total] = await Promise.all([
    // Ordenacao estavel + desempate por odooId: "os proximos" nao repetem
    // nem pulam item entre paginas (alavanca 2b).
    prisma.fatoRetornoItem.findMany({
      where,
      orderBy: [{ dataPagamento: "desc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoRetornoItem.count({ where }),
  ]);
  const linhas: BaixaLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    situacao: r.situacao,
    nossoNumero: r.nossoNumero,
    dataPagamento: dia(r.dataPagamento),
    participante: r.dividaParticipanteNome,
    vrDocumento: r.vrDocumento.toNumber(),
    vrJuros: r.vrJuros.toNumber(),
    vrMulta: r.vrMulta.toNumber(),
    vrDesconto: r.vrDesconto.toNumber(),
    vrTarifas: r.vrTarifas.toNumber(),
    vrBaixado: r.vrBaixado.toNumber(),
    vrTotal: r.vrTotal.toNumber(),
  }));
  return { linhas, total, truncado: offset + rows.length < total };
}

// ── Retornos bancários (finan.retorno) ──────────────────────────────────────
export interface RetornoLinha {
  odooId: number;
  tipo: string | null;
  banco: string | null;
  numero: string | null;
  data: string | null;
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
}
export async function fatoRetornoCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoRetornoBancario.count();
}
export async function queryRetornosProcessados(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limit: number; offset: number },
): Promise<{ linhas: RetornoLinha[]; total: number; truncado: boolean }> {
  const { limit, offset } = filtros;
  const periodo = rangeData(filtros.periodoDe, filtros.periodoAte);
  const where = periodo ? { data: periodo } : {};
  const [rows, total] = await Promise.all([
    prisma.fatoRetornoBancario.findMany({
      where,
      orderBy: [{ data: "desc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoRetornoBancario.count({ where }),
  ]);
  const linhas: RetornoLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    tipo: r.tipo,
    banco: r.bancoNome,
    numero: r.numero,
    data: dia(r.data),
    totalEntradas: r.totalEntradas.toNumber(),
    totalSaidas: r.totalSaidas.toNumber(),
    saldo: r.saldo.toNumber(),
  }));
  return { linhas, total, truncado: offset + rows.length < total };
}

// ── Remessas geradas (finan.remessa) ────────────────────────────────────────
export interface RemessaLinha {
  odooId: number;
  tipo: string | null;
  banco: string | null;
  numero: string | null;
  data: string | null;
  confirmada: boolean;
}
export async function fatoRemessaCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoRemessaBancaria.count();
}
export async function queryRemessasGeradas(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limit: number; offset: number },
): Promise<{ linhas: RemessaLinha[]; total: number; truncado: boolean }> {
  const { limit, offset } = filtros;
  const periodo = rangeData(filtros.periodoDe, filtros.periodoAte);
  const where = periodo ? { data: periodo } : {};
  const [rows, total] = await Promise.all([
    prisma.fatoRemessaBancaria.findMany({
      where,
      orderBy: [{ data: "desc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoRemessaBancaria.count({ where }),
  ]);
  const linhas: RemessaLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    tipo: r.tipo,
    banco: r.bancoNome,
    numero: r.numero,
    data: dia(r.data),
    confirmada: r.confirmada,
  }));
  return { linhas, total, truncado: offset + rows.length < total };
}

// ── Carteiras de cobrança (finan.carteira) ──────────────────────────────────
export interface CarteiraLinha {
  odooId: number;
  nome: string | null;
  banco: string | null;
  carteira: string | null;
  tipoCarteira: string | null;
  beneficiario: string | null;
  convenio: string | null;
}
export async function fatoCarteiraCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoCarteiraCobranca.count();
}
export async function queryCarteirasCobranca(
  prisma: PrismaClient,
  filtros: { limit: number; offset: number },
): Promise<{ linhas: CarteiraLinha[]; total: number; truncado: boolean }> {
  const { limit, offset } = filtros;
  const [rows, total] = await Promise.all([
    prisma.fatoCarteiraCobranca.findMany({
      orderBy: [{ nome: "asc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoCarteiraCobranca.count(),
  ]);
  const linhas: CarteiraLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    nome: r.nome,
    banco: r.bancoNome ?? r.banco,
    carteira: r.carteira,
    tipoCarteira: r.tipoCarteira,
    beneficiario: r.beneficiario,
    convenio: r.convenio,
  }));
  return { linhas, total, truncado: offset + rows.length < total };
}

// ── Cheques (finan.cheque) , estrutural ─────────────────────────────────────
export interface ChequeLinha {
  odooId: number;
  numero: string | null;
  banco: string | null;
  titular: string | null;
  data: string | null;
  valor: number;
}
export async function fatoChequeCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoCheque.count();
}
export async function queryCheques(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limit: number; offset: number },
): Promise<{ linhas: ChequeLinha[]; total: number; truncado: boolean }> {
  const { limit, offset } = filtros;
  const periodo = rangeData(filtros.periodoDe, filtros.periodoAte);
  const where = periodo ? { data: periodo } : {};
  const [rows, total] = await Promise.all([
    prisma.fatoCheque.findMany({
      where,
      orderBy: [{ data: "desc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoCheque.count({ where }),
  ]);
  const linhas: ChequeLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    numero: r.numero,
    banco: r.banco,
    titular: r.titularNome,
    data: dia(r.data),
    valor: r.valor.toNumber(),
  }));
  return { linhas, total, truncado: offset + rows.length < total };
}

// ── PIX (finan.pix) , estrutural ────────────────────────────────────────────
export interface PixLinha {
  odooId: number;
  txid: string | null;
  metodo: string | null;
  status: string | null;
  data: string | null;
  vrTarifas: number;
}
export async function fatoPixCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoPix.count();
}
export async function queryPixRecebidos(
  prisma: PrismaClient,
  filtros: { periodoDe?: string; periodoAte?: string; limit: number; offset: number },
): Promise<{ linhas: PixLinha[]; total: number; truncado: boolean }> {
  const { limit, offset } = filtros;
  const periodo = rangeData(filtros.periodoDe, filtros.periodoAte);
  const where = periodo ? { data: periodo } : {};
  const [rows, total] = await Promise.all([
    prisma.fatoPix.findMany({
      where,
      orderBy: [{ data: "desc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoPix.count({ where }),
  ]);
  const linhas: PixLinha[] = rows.map((r) => ({
    odooId: r.odooId,
    txid: r.txid,
    metodo: r.metodo,
    status: r.status,
    data: dia(r.data),
    vrTarifas: r.vrTarifas.toNumber(),
  }));
  return { linhas, total, truncado: offset + rows.length < total };
}
