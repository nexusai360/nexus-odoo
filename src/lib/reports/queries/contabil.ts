// src/lib/reports/queries/contabil.ts
//
// Núcleo de agregação contábil, framework-neutro. Recebe `prisma` + filtros,
// devolve dados crus , sem `estado`/`freshness`/shaping. Não captura exceção.
// `withFreshness` vive no handler MCP, não aqui.
// Fonte primária: fato_conta_contabil (plano de contas hierárquico).
//
// NOTA: não há lançamento/movimento contábil no Odoo da Matrix Fitness Group
// , apenas a estrutura do plano de contas (tipo S=sintética, A=analítica).

import type { PrismaClient } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// queryPlanoDeContas
// ---------------------------------------------------------------------------

/** Lista contas do plano, opcionalmente filtrando por termo (ILIKE em codigo/nome).
 * Devolve até `limite` (padrão 250) resultados ordenados por codigo, junto com
 * `total` (contagem completa do filtro) e `truncado` , para a resposta nunca
 * ocultar silenciosamente que há mais contas do que as retornadas. */
export async function queryPlanoDeContas(
  prisma: PrismaClient,
  filtros: { termo?: string; limit: number; offset: number },
): Promise<{
  linhas: {
    odooId: number;
    codigo: string;
    nome: string;
    tipo: string;
    contaPaiNome: string | null;
  }[];
  total: number;
  truncado: boolean;
}> {
  const { limit, offset } = filtros;
  // F5 FIX: busca tokenizada (AND de palavras). Antes "impostos a recolher"
  // nao achava "OUTROS IMPOSTOS E TAXAS A RECOLHER" porque contains literal.
  const STOPWORDS = new Set(["a", "as", "de", "do", "da", "dos", "das", "e", "o", "os", "para", "pra", "no", "na", "nos", "nas", "que", "por"]);
  let where: Record<string, unknown> = {};
  if (filtros.termo) {
    const tokens = filtros.termo
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
    where = {
      OR: [
        { codigo: { contains: filtros.termo, mode: "insensitive" as const } },
        tokens.length > 0
          ? { AND: tokens.map((tk) => ({ nome: { contains: tk, mode: "insensitive" as const } })) }
          : { nome: { contains: filtros.termo, mode: "insensitive" as const } },
      ],
    };
  }

  const [linhas, total] = await Promise.all([
    prisma.fatoContaContabil.findMany({
      where,
      select: {
        odooId: true,
        codigo: true,
        nome: true,
        tipo: true,
        contaPaiNome: true,
      },
      // Ordenacao estavel + desempate por odooId para paginacao (alavanca 2b).
      orderBy: [{ codigo: "asc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoContaContabil.count({ where }),
  ]);
  return { linhas, total, truncado: offset + linhas.length < total };
}

// ---------------------------------------------------------------------------
// queryEstruturaConta
// ---------------------------------------------------------------------------

/** Retorna a conta pelo odooId e suas contas filhas diretas.
 * Casos: (a) conta com filhas; (b) conta-folha sem filhas; (c) conta inexistente. */
export async function queryEstruturaConta(
  prisma: PrismaClient,
  filtros: { odooId: number },
): Promise<{
  conta: {
    odooId: number;
    codigo: string;
    nome: string;
    tipo: string;
    contaPaiNome: string | null;
  } | null;
  filhas: {
    odooId: number;
    codigo: string;
    nome: string;
    tipo: string;
  }[];
}> {
  const [conta, filhas] = await Promise.all([
    prisma.fatoContaContabil.findUnique({
      where: { odooId: filtros.odooId },
      select: {
        odooId: true,
        codigo: true,
        nome: true,
        tipo: true,
        contaPaiNome: true,
      },
    }),
    prisma.fatoContaContabil.findMany({
      where: { contaPaiId: filtros.odooId },
      select: {
        odooId: true,
        codigo: true,
        nome: true,
        tipo: true,
      },
      orderBy: { codigo: "asc" },
    }),
  ]);
  return { conta: conta ?? null, filhas };
}

// ===========================================================================
// B1 (onda contábil , movimento): saldo / razão / resultado / centro de custo
// ---------------------------------------------------------------------------
// Todas leem de `fato_contabil_lancamento_item`, que hoje tem 0 linhas (a
// contabilidade ainda não é operada no Odoo). Por isso retornam listas vazias
// agora; o handler MCP traduz isso numa resposta honesta (ver
// `mensagemContabilGestaoVazia`). Quando os lançamentos forem lançados, estas
// queries passam a responder sozinhas , nenhuma mudança de código é necessária.
// Campos de semântica incerta marcados com `// CONFIRMAR na ativação` (SPEC §3).
// ===========================================================================

/** Converte Decimal/number/null do Prisma para `number` seguro (0 em null). */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v as never);
  return Number.isFinite(n) ? n : 0;
}

/** Monta o filtro de período sobre `dataLancamento` (gte/lte), só quando há datas. */
function periodoWhere(filtros: { dataInicio?: string; dataFim?: string }): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filtros.dataInicio || filtros.dataFim) {
    const range: Record<string, Date> = {};
    if (filtros.dataInicio) range.gte = new Date(filtros.dataInicio);
    if (filtros.dataFim) range.lte = new Date(filtros.dataFim);
    where.dataLancamento = range;
  }
  return where;
}

/**
 * Mensagem honesta para as tools de gestão contábil quando a lista vem vazia.
 * Distingue os dois casos (SPEC §2.3): fato globalmente vazio (contabilidade
 * não operada) × filtro sem retorno (recorte sem lançamentos). Nunca devolve
 * "R$ 0,00" como se fosse fato.
 */
export function mensagemContabilGestaoVazia(totalItensNoFato: number): string {
  return totalItensNoFato === 0
    ? "A contabilidade ainda não é operada no Odoo da Matrix (não há lançamentos contábeis lançados). Esta consulta passa a responder automaticamente assim que os lançamentos começarem a existir."
    : "Não encontrei lançamentos contábeis nesse recorte (conta ou período). Ajuste o filtro e consulte de novo.";
}

/** Contagem barata do fato de itens , usada pelo handler para escolher a mensagem honesta. */
export async function fatoContabilItemCount(prisma: PrismaClient): Promise<number> {
  return prisma.fatoContabilLancamentoItem.count();
}

// ---------------------------------------------------------------------------
// querySaldoConta , saldo (Σdébito − Σcrédito) por conta no período
// ---------------------------------------------------------------------------

export interface SaldoContaLinha {
  contaId: number | null;
  contaCodigo: string | null;
  contaNome: string | null;
  contaNatureza: string | null;
  debito: number;
  credito: number;
  saldo: number;
}

/** Saldo por conta no período (balancete). Agrupa o item por conta e soma os
 * lados. `saldo = débito − crédito` (sinal de apresentação por natureza fica
 * para a ativação , SPEC §3.2 `// CONFIRMAR`). */
export async function querySaldoConta(
  prisma: PrismaClient,
  filtros: { termo?: string; dataInicio?: string; dataFim?: string; limite?: number },
): Promise<{ linhas: SaldoContaLinha[]; total: number }> {
  const where = periodoWhere(filtros);
  if (filtros.termo) {
    where.OR = [
      { contaCodigo: { contains: filtros.termo, mode: "insensitive" as const } },
      { contaNome: { contains: filtros.termo, mode: "insensitive" as const } },
    ];
  }
  const grupos = await prisma.fatoContabilLancamentoItem.groupBy({
    by: ["contaId", "contaCodigo", "contaNome", "contaNatureza"],
    where,
    _sum: { valorDebito: true, valorCredito: true },
    orderBy: { contaCodigo: "asc" },
    take: filtros.limite ?? 250,
  });
  const linhas: SaldoContaLinha[] = grupos.map((g) => {
    const debito = num(g._sum?.valorDebito);
    const credito = num(g._sum?.valorCredito);
    return {
      contaId: g.contaId,
      contaCodigo: g.contaCodigo,
      contaNome: g.contaNome,
      contaNatureza: g.contaNatureza,
      debito,
      credito,
      saldo: debito - credito,
    };
  });
  return { linhas, total: linhas.length };
}

// ---------------------------------------------------------------------------
// queryMovimentoConta , razão: partidas individuais de 1 conta no período
// ---------------------------------------------------------------------------

export interface MovimentoContaLinha {
  odooId: number;
  lancamentoId: number | null;
  dataLancamento: Date | null;
  contaCodigo: string | null;
  contaNome: string | null;
  centroCustoNome: string | null;
  historico: string | null;
  debito: number;
  credito: number;
}

/** Razão de uma conta: lista as partidas (itens) de uma conta no período,
 * ordenadas por data. Aceita `contaId` (preferencial) ou `contaCodigo`. */
export async function queryMovimentoConta(
  prisma: PrismaClient,
  filtros: { contaId?: number; contaCodigo?: string; dataInicio?: string; dataFim?: string; limit: number; offset: number },
): Promise<{ linhas: MovimentoContaLinha[]; total: number; truncado: boolean }> {
  const where = periodoWhere(filtros);
  if (filtros.contaId != null) where.contaId = filtros.contaId;
  else if (filtros.contaCodigo) where.contaCodigo = filtros.contaCodigo;
  const { limit, offset } = filtros;
  const [partidas, total] = await Promise.all([
    prisma.fatoContabilLancamentoItem.findMany({
      where,
      select: {
        odooId: true,
        lancamentoId: true,
        dataLancamento: true,
        contaCodigo: true,
        contaNome: true,
        centroCustoNome: true,
        historico: true,
        valorDebito: true,
        valorCredito: true,
      },
      // Ordenacao estavel + desempate por odooId para paginacao (alavanca 2b).
      orderBy: [{ dataLancamento: "asc" }, { odooId: "asc" }],
      take: limit,
      skip: offset,
    }),
    prisma.fatoContabilLancamentoItem.count({ where }),
  ]);
  const linhas: MovimentoContaLinha[] = partidas.map((p) => ({
    odooId: p.odooId,
    lancamentoId: p.lancamentoId,
    dataLancamento: p.dataLancamento,
    contaCodigo: p.contaCodigo,
    contaNome: p.contaNome,
    centroCustoNome: p.centroCustoNome,
    historico: p.historico,
    debito: num(p.valorDebito),
    credito: num(p.valorCredito),
  }));
  return { linhas, total, truncado: filtros.offset + linhas.length < total };
}

// ---------------------------------------------------------------------------
// queryResultadoPorNatureza , resultado das contas de natureza 04 (Resultado)
// ---------------------------------------------------------------------------

export interface ResultadoLinha {
  grupo: string;
  receita: number;
  despesa: number;
  resultado: number;
}

/** Resultado por natureza: nas contas de `contaNatureza='04'` (Resultado),
 * crédito=receita e débito=despesa (SPEC §3.4 `// CONFIRMAR`). Exclui
 * lançamentos de Encerramento (`lancamentoTipo='E'`, SPEC §3.3) para não zerar
 * o resultado do exercício. Não é uma DRE estruturada (fica para a ativação). */
export async function queryResultadoPorNatureza(
  prisma: PrismaClient,
  filtros: { dataInicio?: string; dataFim?: string },
): Promise<{ linhas: ResultadoLinha[]; receitaTotal: number; despesaTotal: number; resultado: number }> {
  const where = periodoWhere(filtros);
  where.contaNatureza = "04";
  // CONFIRMAR na ativação: excluir Encerramento (E); Extemporâneo (X) entra.
  where.NOT = { lancamentoTipo: "E" };
  const [agg, n] = await Promise.all([
    prisma.fatoContabilLancamentoItem.aggregate({
      where,
      _sum: { valorCredito: true, valorDebito: true },
    }),
    prisma.fatoContabilLancamentoItem.count({ where }),
  ]);
  const receita = num(agg._sum?.valorCredito);
  const despesa = num(agg._sum?.valorDebito);
  const resultado = receita - despesa;
  const linhas: ResultadoLinha[] = n > 0 ? [{ grupo: "Resultado", receita, despesa, resultado }] : [];
  return { linhas, receitaTotal: receita, despesaTotal: despesa, resultado };
}

// ---------------------------------------------------------------------------
// queryCentroCusto , saldo por centro de custo no período
// ---------------------------------------------------------------------------

export interface CentroCustoLinha {
  centroCustoId: number | null;
  centroCustoNome: string | null;
  debito: number;
  credito: number;
  saldo: number;
}

/** Saldo por centro de custo no período. Agrupa o item por centro de custo
 * (denormalizado em `centro_custo_id`/`centro_custo_nome`) e soma os lados.
 * Rateio multi-centro fica fora do escopo (SPEC §6). */
export async function queryCentroCusto(
  prisma: PrismaClient,
  filtros: { dataInicio?: string; dataFim?: string; limite?: number },
): Promise<{ linhas: CentroCustoLinha[]; total: number }> {
  const where = periodoWhere(filtros);
  where.centroCustoId = { not: null };
  const grupos = await prisma.fatoContabilLancamentoItem.groupBy({
    by: ["centroCustoId", "centroCustoNome"],
    where,
    _sum: { valorDebito: true, valorCredito: true },
    orderBy: { centroCustoNome: "asc" },
    take: filtros.limite ?? 250,
  });
  const linhas: CentroCustoLinha[] = grupos.map((g) => {
    const debito = num(g._sum?.valorDebito);
    const credito = num(g._sum?.valorCredito);
    return {
      centroCustoId: g.centroCustoId,
      centroCustoNome: g.centroCustoNome,
      debito,
      credito,
      saldo: debito - credito,
    };
  });
  return { linhas, total: linhas.length };
}

// ---------------------------------------------------------------------------
// queryContaReferencial , de-para SPED (DADO REAL: 2216 contas referenciais)
// ---------------------------------------------------------------------------

export interface ContaReferencialLinha {
  odooId: number;
  codigo: string;
  nome: string | null;
  natureza: string | null;
  nivel: number | null;
}

/** Lista o plano referencial SPED (`fato_contabil_conta_referencial`), filtrável
 * por `natureza` (01..09) e/ou `termo` (código/nome). Diferente das tools de
 * gestão, esta responde com DADO REAL hoje. */
export async function queryContaReferencial(
  prisma: PrismaClient,
  filtros: { natureza?: string; termo?: string; limite?: number },
): Promise<{ linhas: ContaReferencialLinha[]; total: number; truncado: boolean }> {
  const limite = filtros.limite ?? 250;
  const where: Record<string, unknown> = {};
  if (filtros.natureza) where.natureza = filtros.natureza;
  if (filtros.termo) {
    where.OR = [
      { codigo: { contains: filtros.termo, mode: "insensitive" as const } },
      { nome: { contains: filtros.termo, mode: "insensitive" as const } },
    ];
  }
  const [linhas, total] = await Promise.all([
    prisma.fatoContabilContaReferencial.findMany({
      where,
      select: { odooId: true, codigo: true, nome: true, natureza: true, nivel: true },
      orderBy: { codigo: "asc" },
      take: limite,
    }),
    prisma.fatoContabilContaReferencial.count({ where }),
  ]);
  return { linhas, total, truncado: total > linhas.length };
}
