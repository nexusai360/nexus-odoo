/**
 * Registry de formatadores canonicos (_RESPOSTA) e calculos canonicos
 * (consumidos pelo AutoValidator V2) por tool.
 *
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §4.5
 *
 * NOTE: PR1 implementa estrutura + 3 formatadores reais (financeiro a_receber,
 * a_pagar e registrar_lacuna). Demais 22 ferramentas tem fallback generico
 * com TODO marker; serao preenchidas no PR2 conforme cada tool e adaptada.
 */

import type { ToolEnvelope } from "./envelope";

export type FormatadorCanonico = (
  env: Omit<ToolEnvelope, "_RESPOSTA">,
) => string;

export interface CalculoCanonico<TLinha = unknown> {
  nome: string;
  computar: (linhas: TLinha[]) => number;
}

// HIGH-H v1: tipo exportado para reuso em PR2.
export interface LinhaFinanceira {
  vrSaldo?: number | null;
  participanteNome?: string | null;
  diasAtraso?: number;
}

export function formatBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// ---------------------------------------------------------------------------
// Formatadores reais (3 no PR1; demais no PR2)
// ---------------------------------------------------------------------------

const fmtContasAReceber: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.totalAReceber ?? 0);
  const n = Number(env._DESTAQUE?.contagem ?? env.linhas.length);
  const top = env.topPorParticipante?.[0];
  const cabeca = `Total em aberto a receber: ${formatBRL(total)} em ${n} titulos.`;
  const topStr = top
    ? ` Maior cliente: ${top.nome} (${formatBRL(top.soma)}).`
    : "";
  return cabeca + topStr;
};

const fmtContasAPagar: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.totalAPagar ?? 0);
  const n = Number(env._DESTAQUE?.contagem ?? env.linhas.length);
  const top = env.topPorParticipante?.[0];
  const cabeca = `Total em aberto a pagar: ${formatBRL(total)} em ${n} titulos.`;
  const topStr = top
    ? ` Maior fornecedor: ${top.nome} (${formatBRL(top.soma)}).`
    : "";
  return cabeca + topStr;
};

const fmtSaldoProduto: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.totalProdutos ?? 0);
  const valor = Number(env._DESTAQUE?.valorTotal ?? 0);
  const neg = Number(env._DESTAQUE?.produtosNegativos ?? 0);
  if (total === 0) {
    return "Nenhum produto encontrado para esse criterio.";
  }
  const partes: string[] = [];
  partes.push(`${total} produto(s) encontrado(s), valor total ${formatBRL(valor)}.`);
  if (neg > 0) partes.push(`${neg} com saldo negativo.`);
  return partes.join(" ");
};

const fmtRegistrarLacuna: FormatadorCanonico = (env) => {
  const resp = String(env._DESTAQUE?.respostaSugerida ?? "");
  const dest = env._DESTAQUE as
    | (Record<string, unknown> & { sugestoesRelacionadas?: unknown })
    | undefined;
  const sugs = dest?.["sugestoesRelacionadas"];
  let sugStr = "";
  if (Array.isArray(sugs) && sugs.length > 0) {
    sugStr = ` [[suggestions]]:${sugs.join("|")}`;
  }
  return resp + sugStr;
};

// ---------------------------------------------------------------------------
// Fallback generico (sera trocado no PR2)
// ---------------------------------------------------------------------------

const fmtGenerico: FormatadorCanonico = (env) => {
  const partes: string[] = ["Resultado obtido."];
  if (env._DESTAQUE && Object.keys(env._DESTAQUE).length > 0) {
    partes.push(`(${JSON.stringify(env._DESTAQUE)})`);
  }
  partes.push(`(atualizado ha ${env.atualizadoHa})`);
  return partes.join(" ");
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

// Formatador comum aos 3 financeiros vencidos/receber/pagar pode reaproveitar
// padroes — mas como cada um tem mensagem propria (cliente/fornecedor/etc),
// mantemos especificos. Para titulos_vencidos, mensagem usa "vencido".
const fmtTitulosVencidos: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.totalVencido ?? 0);
  const n = Number(env._DESTAQUE?.contagem ?? env.linhas.length);
  const top = env.topPorParticipante?.[0];
  const cabeca = `Total vencido: ${formatBRL(total)} em ${n} titulos.`;
  const topStr = top
    ? ` Maior atraso por participante: ${top.nome} (${formatBRL(top.soma)}).`
    : "";
  return cabeca + topStr;
};

const fmtFluxoCaixa: FormatadorCanonico = (env) => {
  const real = Number(env._DESTAQUE?.realizadoTotal ?? 0);
  const prev = Number(env._DESTAQUE?.previstoTotal ?? 0);
  const n = Number(env._DESTAQUE?.contagemPeriodos ?? 0);
  return `Fluxo de caixa (${n} periodos): realizado ${formatBRL(real)}, previsto ${formatBRL(prev)}.`;
};

const FORMATADORES: Record<string, FormatadorCanonico> = {
  financeiro_contas_a_receber: fmtContasAReceber,
  financeiro_contas_a_pagar: fmtContasAPagar,
  financeiro_titulos_vencidos: fmtTitulosVencidos,
  financeiro_fluxo_caixa: fmtFluxoCaixa,
  estoque_saldo_produto: fmtSaldoProduto,
  registrar_lacuna: fmtRegistrarLacuna,
  // PR2/3+: demais tools.
};

/**
 * CRIT-B v1 endereçado: lista hard-coded das tools que DEVEM ter formatador
 * real (nao-fallback) ao final do PR2. Teste de contrato falha se alguma
 * dessas tools ainda usa fmtGenerico ao final do PR2.
 */
export const TOOLS_QUE_PRECISAM_FORMATADOR: string[] = [
  // financeiro
  "financeiro_contas_a_pagar",
  "financeiro_contas_a_receber",
  "financeiro_titulos_vencidos",
  "financeiro_fluxo_caixa",
  "financeiro_saldo_contas",
  "financeiro_caixa_periodo",
  // fiscal
  "fiscal_faturamento_periodo",
  "fiscal_faturamento_por_cliente",
  "fiscal_notas_emitidas",
  "fiscal_notas_recebidas",
  "fiscal_notas_recebidas_por_fornecedor",
  "fiscal_apuracao",
  "fiscal_produtos_faturados",
  "fiscal_impostos_periodo",
  // estoque
  "estoque_saldo_produto",
  "estoque_top_movimentados",
  "estoque_produtos_parados",
  "estoque_produtos_saldo_zero",
  "estoque_concentracao",
  "estoque_valor_armazem",
  "estoque_entradas_saidas",
  // comercial
  "comercial_pedidos_periodo",
  "comercial_pedidos_por_etapa",
  "comercial_pedidos_atrasados",
  "comercial_parcelas_a_vencer",
  "comercial_pedidos_por_vendedor",
  "comercial_pedidos_listar_top_valor",
  // cadastros
  "cadastro_buscar_parceiro",
  "cadastro_parceiros_por_uf",
  "cadastro_contar_parceiros",
  // contabil
  "contabil_plano_de_contas",
  "contabil_estrutura_conta",
  // sistema
  "registrar_lacuna",
  "bi_consulta_avancada",
];

export function formatadorPorTool(toolName: string): FormatadorCanonico {
  return FORMATADORES[toolName] ?? fmtGenerico;
}

/** PR2 usa para verificar contrato (vide describe.skip em responder.test.ts). */
export function ehFormatadorGenerico(fmt: FormatadorCanonico): boolean {
  return fmt === fmtGenerico;
}

// ---------------------------------------------------------------------------
// Calculos canonicos
// ---------------------------------------------------------------------------

const CALCS_FINANCEIRO: CalculoCanonico<LinhaFinanceira>[] = [
  {
    nome: "soma_vrSaldo",
    computar: (l) => l.reduce((s, r) => s + Number(r.vrSaldo ?? 0), 0),
  },
  { nome: "contagem", computar: (l) => l.length },
  {
    nome: "media_vrSaldo",
    computar: (l) => {
      if (l.length === 0) return 0;
      return l.reduce((s, r) => s + Number(r.vrSaldo ?? 0), 0) / l.length;
    },
  },
  {
    nome: "max_vrSaldo",
    computar: (l) =>
      l.length === 0 ? 0 : Math.max(...l.map((r) => Number(r.vrSaldo ?? 0))),
  },
  {
    nome: "min_vrSaldo",
    computar: (l) =>
      l.length === 0 ? 0 : Math.min(...l.map((r) => Number(r.vrSaldo ?? 0))),
  },
  {
    nome: "soma_vrSaldo_vencidos",
    computar: (l) =>
      l
        .filter((r) => Number(r.diasAtraso ?? 0) > 0)
        .reduce((s, r) => s + Number(r.vrSaldo ?? 0), 0),
  },
  {
    nome: "contagem_distinct_participante",
    computar: (l) =>
      new Set(
        l.map((r) => r.participanteNome).filter((v): v is string => Boolean(v)),
      ).size,
  },
  {
    nome: "soma_top5_vrSaldo",
    computar: (l) =>
      [...l]
        .sort((a, b) => Number(b.vrSaldo ?? 0) - Number(a.vrSaldo ?? 0))
        .slice(0, 5)
        .reduce((s, r) => s + Number(r.vrSaldo ?? 0), 0),
  },
  {
    nome: "soma_top10_vrSaldo",
    computar: (l) =>
      [...l]
        .sort((a, b) => Number(b.vrSaldo ?? 0) - Number(a.vrSaldo ?? 0))
        .slice(0, 10)
        .reduce((s, r) => s + Number(r.vrSaldo ?? 0), 0),
  },
];

const CALCS: Record<string, CalculoCanonico<LinhaFinanceira>[]> = {
  financeiro_contas_a_receber: CALCS_FINANCEIRO,
  financeiro_contas_a_pagar: CALCS_FINANCEIRO,
  financeiro_titulos_vencidos: CALCS_FINANCEIRO,
  // PR2/PR3+ adicionarao calculos para outras tools.
};

export function calculosCanonicosPorTool(
  toolName: string,
): CalculoCanonico<LinhaFinanceira>[] {
  return CALCS[toolName] ?? [];
}
