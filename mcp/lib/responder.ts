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
  // T-19 (2026-05-27): NAO incluir "[[suggestions]]:" aqui. O canal eh um
  // protocolo entre LLM e UI; quando aparece no _RESPOSTA, o LLM copia
  // literal e o usuario ve o canal cru. As sugestoes ficam disponiveis no
  // campo sugestoesRelacionadas separado e o LLM emite o canal por sua
  // propria conta no fim da resposta (conforme regra do prompt).
  return String(env._DESTAQUE?.respostaSugerida ?? "");
};

// ---------------------------------------------------------------------------
// Fallback generico (sera trocado no PR2)
// ---------------------------------------------------------------------------

const fmtGenerico: FormatadorCanonico = (env) => {
  // T-18 (2026-05-27): freshness textual removida do fallback generico.
  // Era um vetor de vazamento para tools sem formatador real (preco_*,
  // tools de escrita). O LLM nao deve imprimir "(atualizado ha X)" no
  // texto humano.
  const partes: string[] = ["Resultado obtido."];
  if (env._DESTAQUE && Object.keys(env._DESTAQUE).length > 0) {
    partes.push(`(${JSON.stringify(env._DESTAQUE)})`);
  }
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

// ---------------------------------------------------------------------------
// Formatadores expandidos (Onda 1.C)
// ---------------------------------------------------------------------------

const fmtFaturamentoPeriodo: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.valorFaturado ?? env._DESTAQUE?.valorTotal ?? 0);
  const n = Number(env._DESTAQUE?.totalNotas ?? 0);
  if (n === 0) return "Nenhuma nota emitida no periodo.";
  return `Faturamento no periodo: ${formatBRL(total)} em ${n} notas.`;
};

const fmtFaturamentoPorCliente: FormatadorCanonico = (env) => {
  const top = env._DESTAQUE?.topCliente
    ? String(env._DESTAQUE.topCliente)
    : env.topPorParticipante?.[0]?.nome;
  const valorTop = Number(env._DESTAQUE?.valorTopCliente ?? env.topPorParticipante?.[0]?.soma ?? 0);
  const total = Number(env._DESTAQUE?.totalGeral ?? 0);
  if (!top) return "Nenhum cliente com faturamento no periodo.";
  return `Top cliente por faturamento: ${top} com ${formatBRL(valorTop)}. Total no periodo: ${formatBRL(total)}.`;
};

const fmtNotasEmitidas: FormatadorCanonico = (env) => {
  const n = Number(env._DESTAQUE?.totalNotas ?? 0);
  const total = Number(env._DESTAQUE?.valorTotal ?? 0);
  if (n === 0) return "Nenhuma nota emitida no periodo.";
  return `${n} notas emitidas no periodo, total ${formatBRL(total)}.`;
};

const fmtNotasRecebidas: FormatadorCanonico = (env) => {
  const n = Number(env._DESTAQUE?.totalNotas ?? 0);
  const total = Number(env._DESTAQUE?.valorTotal ?? 0);
  if (n === 0) return "Nenhuma nota recebida no periodo.";
  return `${n} notas recebidas no periodo, total ${formatBRL(total)}.`;
};

const fmtNotasRecebidasPorFornecedor: FormatadorCanonico = (env) => {
  const forn = env._DESTAQUE?.fornecedor ?? "fornecedor consultado";
  const n = Number(env._DESTAQUE?.totalNotas ?? 0);
  const total = Number(env._DESTAQUE?.totalAgregado ?? env._DESTAQUE?.valorTotal ?? 0);
  if (n === 0) return `Nenhuma nota recebida de ${forn} no periodo.`;
  return `Do fornecedor ${forn}: ${n} notas totalizando ${formatBRL(total)}.`;
};

const fmtApuracaoFiscal: FormatadorCanonico = (env) => {
  // T-34 (Ronda 2): formatador agora discrimina PIS/COFINS quando o usuario
  // pediu PIS/COFINS especificamente, ou mostra todos os tributos somados.
  const tipo = String(env._DESTAQUE?.tipo ?? "tributo");
  const periodo = String(env._DESTAQUE?.periodo ?? "periodo informado");
  const totalApur = Number(env._DESTAQUE?.totalApuracoes ?? 0);
  const icms = Number(env._DESTAQUE?.icmsARecolher ?? env._DESTAQUE?.aRecolher ?? 0);
  const ipi = Number(env._DESTAQUE?.ipiARecolher ?? 0);
  const pis = Number(env._DESTAQUE?.pisARecolher ?? 0);
  const cofins = Number(env._DESTAQUE?.cofinsARecolher ?? 0);
  const pisCofins = Number(env._DESTAQUE?.pisCofinsARecolher ?? pis + cofins);
  const saldoCredor = Number(env._DESTAQUE?.saldoCredor ?? 0);
  if (totalApur === 0) return "Nao ha apuracao fiscal registrada para o periodo/criterio.";
  // Caso PIS-COFINS: foco no tributo pedido.
  if (/pis|cofins/i.test(tipo)) {
    return `Apuracao PIS/COFINS (${periodo}): PIS a recolher ${formatBRL(pis)}, COFINS a recolher ${formatBRL(cofins)}. Total PIS+COFINS: ${formatBRL(pisCofins)}.`;
  }
  // Caso ICMS-IPI: foco em ICMS+IPI+saldo credor.
  if (/icms|ipi/i.test(tipo)) {
    return `Apuracao ICMS/IPI (${periodo}): ICMS a recolher ${formatBRL(icms)}, IPI a recolher ${formatBRL(ipi)}, saldo credor ${formatBRL(saldoCredor)}.`;
  }
  // Tipo desconhecido: mostra resumo geral.
  return `Apuracao fiscal (${periodo}, ${totalApur} apuracoes): ICMS ${formatBRL(icms)}, IPI ${formatBRL(ipi)}, PIS ${formatBRL(pis)}, COFINS ${formatBRL(cofins)}. Saldo credor: ${formatBRL(saldoCredor)}.`;
};

const fmtPedidosPeriodo: FormatadorCanonico = (env) => {
  const n = Number(env._DESTAQUE?.totalPedidos ?? 0);
  const total = Number(env._DESTAQUE?.valorTotal ?? 0);
  if (n === 0) return "Nenhum pedido no periodo.";
  return `No periodo: ${n} pedidos, valor total ${formatBRL(total)}.`;
};

const fmtPedidosPorEtapa: FormatadorCanonico = (env) => {
  // T-31 (Ronda 2): texto rico com categorias separadas. Resolve confusao
  // do LLM entre "53 etapas" (linhas) e "1.597 pedidos" (quantidade total).
  const total = Number(env._DESTAQUE?.totalPedidos ?? env._DESTAQUE?.totalGeral ?? 0);
  if (total === 0) return "Nenhum pedido encontrado no fluxo comercial.";
  const concluidos = Number(env._DESTAQUE?.pedidosConcluidos ?? 0);
  const cancelados = Number(env._DESTAQUE?.pedidosCancelados ?? 0);
  const rascunho = Number(env._DESTAQUE?.pedidosRascunho ?? 0);
  const aberto = Number(env._DESTAQUE?.pedidosEmAberto ?? 0);
  const valorTotal = Number(env._DESTAQUE?.valorTotal ?? 0);
  const partes: string[] = [`${total} pedidos no fluxo comercial`];
  if (valorTotal > 0) partes.push(`(${formatBRL(valorTotal)})`);
  const detalhes: string[] = [];
  if (concluidos > 0) detalhes.push(`${concluidos} concluidos`);
  if (cancelados > 0) detalhes.push(`${cancelados} cancelados`);
  if (rascunho > 0) detalhes.push(`${rascunho} em rascunho/digitacao`);
  if (aberto > 0) detalhes.push(`${aberto} em aberto`);
  const head = partes.join(" ");
  return detalhes.length > 0 ? `${head}: ${detalhes.join(", ")}.` : `${head}.`;
};

const fmtPedidosAtrasados: FormatadorCanonico = (env) => {
  const n = Number(env._DESTAQUE?.totalAtrasados ?? env._DESTAQUE?.contagem ?? 0);
  const valor = Number(env._DESTAQUE?.valorEmRisco ?? env._DESTAQUE?.valorTotal ?? 0);
  const maxDias = Number(env._DESTAQUE?.maxDias ?? 0);
  if (n === 0) return "Nenhum pedido atrasado no momento.";
  const tail = maxDias > 0 ? ` Maior atraso: ${maxDias} dias.` : "";
  return `${n} pedidos atrasados, ${formatBRL(valor)} em risco.${tail}`;
};

const fmtParcelasAVencer: FormatadorCanonico = (env) => {
  const n = Number(env._DESTAQUE?.totalParcelas ?? 0);
  const total = Number(env._DESTAQUE?.valorTotal ?? 0);
  if (n === 0) return "Nenhuma parcela a vencer na janela consultada.";
  return `${n} parcelas a vencer na janela, total ${formatBRL(total)}.`;
};

const fmtPedidosPorVendedor: FormatadorCanonico = (env) => {
  const top = env._DESTAQUE?.topVendedor;
  const valor = Number(env._DESTAQUE?.valorTopVendedor ?? 0);
  if (!top) return "Nenhum vendedor com pedidos no periodo.";
  return `Top vendedor: ${top} com ${formatBRL(valor)} em pedidos.`;
};

const fmtPedidosListarTopValor: FormatadorCanonico = (env) => {
  const top = env._DESTAQUE?.topPedido;
  const valor = Number(env._DESTAQUE?.valorTopPedido ?? 0);
  const n = Number(env._DESTAQUE?.totalPedidos ?? 0);
  if (!top) return "Nenhum pedido encontrado.";
  return `Top ${n} pedidos por valor. Maior: pedido ${top} com ${formatBRL(valor)}.`;
};

const fmtBuscarParceiro: FormatadorCanonico = (env) => {
  const n = Number(env._DESTAQUE?.totalEncontrados ?? env.linhas.length);
  const termo = env._DESTAQUE?.termo ?? "criterio";
  if (n === 0) return `Nenhum parceiro encontrado com termo '${termo}'.`;
  if (n === 1) {
    const nome = env._DESTAQUE?.parceiroNome ?? "parceiro";
    const doc = env._DESTAQUE?.documento ?? "";
    return `Parceiro: ${nome}${doc ? ` (${doc})` : ""}.`;
  }
  return `${n} parceiros encontrados com termo '${termo}'.`;
};

const fmtParceirosPorUF: FormatadorCanonico = (env) => {
  const totalComUF = Number(env._DESTAQUE?.totalComUF ?? 0);
  const totalSemUF = Number(env._DESTAQUE?.totalSemUF ?? 0);
  const topUF = env._DESTAQUE?.topUF;
  if (totalComUF + totalSemUF === 0) return "Nenhum parceiro cadastrado.";
  const tail = topUF ? ` Top UF: ${topUF}.` : "";
  return `${totalComUF} parceiros com UF informada e ${totalSemUF} sem UF.${tail}`;
};

const fmtContarParceiros: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.total ?? 0);
  const clientes = Number(env._DESTAQUE?.totalClientes ?? 0);
  const fornecedores = Number(env._DESTAQUE?.totalFornecedores ?? 0);
  const ativos = Number(env._DESTAQUE?.totalAtivos ?? 0);
  return `Total: ${total} parceiros (${clientes} clientes, ${fornecedores} fornecedores, ${ativos} ativos).`;
};

const fmtPlanoDeContas: FormatadorCanonico = (env) => {
  // T-25 (Ronda 1): totalContas agora vem do count absoluto do banco
  // (envelope.dados.total), nao do tamanho da fatia. Resolve
  // "Quantas contas temos no plano contabil?" sem inventar.
  const n = Number(env._DESTAQUE?.totalContas ?? env.linhas.length);
  const exibidas = Number(env._DESTAQUE?.linhasExibidas ?? env.linhas.length);
  const termo = env._DESTAQUE?.termo;
  if (n === 0)
    return termo
      ? `Nenhuma conta encontrada com termo '${termo}'.`
      : "Nenhuma conta encontrada.";
  if (n === 1) {
    const codigo = env._DESTAQUE?.codigo ?? "";
    const nome = env._DESTAQUE?.nome ?? "";
    return `Conta ${codigo} ${nome}.`.trim();
  }
  const cabeca = termo
    ? `${n} contas encontradas com termo '${termo}'.`
    : `${n} contas no plano de contas.`;
  if (exibidas > 0 && exibidas < n) {
    return `${cabeca} Listando ${exibidas}.`;
  }
  return cabeca;
};

const fmtEstruturaConta: FormatadorCanonico = (env) => {
  const codigo = env._DESTAQUE?.codigo ?? "";
  const nome = env._DESTAQUE?.nome ?? "";
  const totalFilhos = Number(env._DESTAQUE?.totalFilhos ?? 0);
  return `Conta ${codigo} ${nome}: ${totalFilhos} filhos diretos.`.trim();
};

const fmtBiConsultaAvancada: FormatadorCanonico = (env) => {
  // BI traz _DESTAQUE livre por consulta. Stringfica o que vier.
  const dest = env._DESTAQUE;
  if (!dest || Object.keys(dest).length === 0) {
    return "Consulta executada (resultados nas linhas).";
  }
  const entries = Object.entries(dest)
    .map(([k, v]) => `${k}: ${typeof v === "number" ? formatBRL(v) : v}`)
    .join(", ");
  return `Resultado: ${entries}.`;
};

// Adicionais de estoque
const fmtTopMovimentados: FormatadorCanonico = (env) => {
  const top = env._DESTAQUE?.topProduto;
  const movs = Number(env._DESTAQUE?.movimentosTop ?? 0);
  if (!top) return "Nenhuma movimentacao encontrada no periodo.";
  return `Top produto movimentado: ${top} com ${movs} movimentos.`;
};

const fmtProdutosParados: FormatadorCanonico = (env) => {
  const n = Number(env._DESTAQUE?.totalProdutos ?? 0);
  const valor = Number(env._DESTAQUE?.valorImobilizado ?? 0);
  if (n === 0) return "Nenhum produto parado.";
  return `${n} produtos parados, ${formatBRL(valor)} imobilizados.`;
};

const fmtProdutosSaldoZero: FormatadorCanonico = (env) => {
  const n = Number(env._DESTAQUE?.totalProdutos ?? 0);
  return `${n} produtos com saldo zero.`;
};

const fmtValorArmazem: FormatadorCanonico = (env) => {
  const valor = Number(env._DESTAQUE?.valorTotal ?? 0);
  const n = Number(env._DESTAQUE?.contagemArmazens ?? 0);
  return `Valor total em estoque: ${formatBRL(valor)} em ${n} armazens.`;
};

const fmtEntradasSaidas: FormatadorCanonico = (env) => {
  // T-32 (Ronda 2): texto pronto pro LLM. Quando ambos zero, dispara §10b
  // ("Nao ha entradas/saidas no periodo").
  const entrada = Number(env._DESTAQUE?.totalEntrada ?? 0);
  const saida = Number(env._DESTAQUE?.totalSaida ?? 0);
  const periodos = Number(env._DESTAQUE?.periodos ?? 0);
  if (periodos === 0 || (entrada === 0 && saida === 0)) {
    return "Nao ha entradas nem saidas de estoque no periodo.";
  }
  if (entrada === 0) return `Nao ha entradas no periodo. Saidas: ${saida} unidades.`;
  if (saida === 0) return `Nao ha saidas no periodo. Entradas: ${entrada} unidades.`;
  return `Entradas: ${entrada} unidades. Saidas: ${saida} unidades. Periodo de ${periodos} meses.`;
};

const FORMATADORES: Record<string, FormatadorCanonico> = {
  // financeiro
  financeiro_contas_a_receber: fmtContasAReceber,
  financeiro_contas_a_pagar: fmtContasAPagar,
  financeiro_titulos_vencidos: fmtTitulosVencidos,
  financeiro_fluxo_caixa: fmtFluxoCaixa,
  // fiscal
  fiscal_faturamento_periodo: fmtFaturamentoPeriodo,
  fiscal_faturamento_por_cliente: fmtFaturamentoPorCliente,
  fiscal_notas_emitidas: fmtNotasEmitidas,
  fiscal_notas_recebidas: fmtNotasRecebidas,
  fiscal_notas_recebidas_por_fornecedor: fmtNotasRecebidasPorFornecedor,
  fiscal_apuracao: fmtApuracaoFiscal,
  // estoque
  estoque_saldo_produto: fmtSaldoProduto,
  estoque_top_movimentados: fmtTopMovimentados,
  estoque_produtos_parados: fmtProdutosParados,
  estoque_produtos_saldo_zero: fmtProdutosSaldoZero,
  estoque_valor_armazem: fmtValorArmazem,
  estoque_entradas_saidas: fmtEntradasSaidas,
  // comercial
  comercial_pedidos_periodo: fmtPedidosPeriodo,
  comercial_pedidos_por_etapa: fmtPedidosPorEtapa,
  comercial_pedidos_atrasados: fmtPedidosAtrasados,
  comercial_parcelas_a_vencer: fmtParcelasAVencer,
  comercial_pedidos_por_vendedor: fmtPedidosPorVendedor,
  comercial_pedidos_listar_top_valor: fmtPedidosListarTopValor,
  // cadastros
  cadastro_buscar_parceiro: fmtBuscarParceiro,
  cadastro_parceiros_por_uf: fmtParceirosPorUF,
  cadastro_contar_parceiros: fmtContarParceiros,
  // contabil
  contabil_plano_de_contas: fmtPlanoDeContas,
  contabil_estrutura_conta: fmtEstruturaConta,
  // sistema
  registrar_lacuna: fmtRegistrarLacuna,
  bi_consulta_avancada: fmtBiConsultaAvancada,
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
