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
import { humanizeName } from "@/lib/agent/text-normalize.js";

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
// padroes , mas como cada um tem mensagem propria (cliente/fornecedor/etc),
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

// F4 Onda 4 (estoque)
const fmtConcentracao: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const totalFamilias = Number(d.totalFamilias ?? 0);
  const valorTotal = Number(d.valorTotal ?? 0);
  if (totalFamilias === 0 && Number(d.totalMarcas ?? 0) === 0) {
    return "Nao ha saldo em estoque para calcular concentracao.";
  }
  const partes: string[] = [`Concentracao do estoque (valor total ${formatBRL(valorTotal)}).`];
  if (d.topFamilia !== undefined) {
    partes.push(
      `Familia lider: ${humanizeName(String(d.topFamilia))} (${Number(d.pctTopFamilia ?? 0)}%, ${formatBRL(Number(d.valorTopFamilia ?? 0))}).`,
    );
  }
  if (d.topMarca !== undefined) {
    partes.push(
      `Marca lider: ${humanizeName(String(d.topMarca))} (${Number(d.pctTopMarca ?? 0)}%, ${formatBRL(Number(d.valorTopMarca ?? 0))}).`,
    );
  }
  return partes.join(" ");
};

const fmtLocaisPorProduto: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const nome = d.produtoNome ? humanizeName(String(d.produtoNome)) : "";
  const totalLocais = Number(d.totalLocais ?? 0);
  const saldoTotal = Number(d.saldoTotal ?? 0);
  if (totalLocais === 0) {
    return nome
      ? `${nome} nao tem saldo em nenhum local.`
      : "Produto nao encontrado ou sem saldo em estoque.";
  }
  const cab = nome ? `${nome}: ` : "";
  const localTxt = totalLocais === 1 ? "local" : "locais";
  return `${cab}saldo em ${totalLocais} ${localTxt}, total ${saldoTotal} unidades.`;
};

const fmtMinimoMaximo: FormatadorCanonico = (env) => {
  // Tool honesta (makeHonestTool): enquanto a Matrix nao cadastrar min/max no
  // Odoo, o handler ja devolve a mensagem de "nao operado". Este formatador
  // espelha a contagem para satisfazer o contrato de formatador real.
  const n = Number(env._agregado?.contagem ?? env._DESTAQUE?.contagem ?? 0);
  if (n === 0) {
    return "Nao ha parametros de minimo/maximo cadastrados no Odoo ainda.";
  }
  return `${n} parametros de minimo/maximo cadastrados.`;
};

// F4 Onda 4 (financeiro)
// Os 4 handlers custom abaixo passam a delegar o _RESPOSTA a estes formatadores
// (fonte unica): o handler computa _DESTAQUE full-set e chama enriquecerEnvelope.
const fmtSaldoContas: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const saldoTotal = Number(d.saldoTotal ?? 0);
  const totalContas = Number(d.totalContas ?? 0);
  return `Saldo geral: ${formatBRL(saldoTotal)} em ${totalContas} contas/bancos.`;
};

const fmtCaixaPeriodo: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const entrada = Number(d.entradaTotal ?? 0);
  const saida = Number(d.saidaTotal ?? 0);
  const saldo = Number(d.saldo ?? 0);
  if (entrada === 0 && saida === 0) return "Nao ha movimentacao de caixa no periodo.";
  return `Caixa do periodo: entradas ${formatBRL(entrada)}, saidas ${formatBRL(saida)}, saldo ${formatBRL(saldo)}.`;
};

const fmtLiquidez: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const saldo = Number(d.saldoEmCaixa ?? 0);
  const aReceber = Number(d.contasAReceber ?? 0);
  const aPagar = Number(d.contasAPagar ?? 0);
  const imediata = Number(d.liquidezImediata ?? 0);
  const corrente = Number(d.liquidezCorrente ?? 0);
  const status = String(d.status ?? "critico");
  const statusLabel =
    status === "saudavel" ? "saudavel" : status === "atencao" ? "em atencao" : "em situacao critica";
  const fmtRatio = (n: number) => n.toFixed(2);
  return (
    `Liquidez ${statusLabel}: imediata ${fmtRatio(imediata)} ` +
    `(saldo ${formatBRL(saldo)} / a pagar ${formatBRL(aPagar)}), ` +
    `corrente ${fmtRatio(corrente)} ` +
    `(saldo + a receber ${formatBRL(saldo + aReceber)} / a pagar ${formatBRL(aPagar)}).`
  );
};

const fmtResultadoPorConta: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const rec = Number(d.totalReceita ?? 0);
  const desp = Number(d.totalDespesa ?? 0);
  const res = Number(d.resultado ?? 0);
  let tail = "";
  if (d.contaTopNatureza !== undefined) {
    const nome = d.contaTop ? String(d.contaTop) : "(sem conta)";
    tail = ` Maior: ${nome} (${String(d.contaTopNatureza)}, ${formatBRL(Number(d.valorContaTop ?? 0))}).`;
  }
  return `Resultado gerencial: receita ${formatBRL(rec)}, despesa ${formatBRL(desp)}, resultado ${formatBRL(res)}.${tail}`;
};

// F4 Onda 4 (financeiro , cobranca bancaria / honest data-driven)
// O handler (factory makeTool em cobranca-bancaria.ts) ja constroi o _RESPOSTA
// real data-driven (resumoOk/naoOperado). Estes formadores espelham a contagem
// para satisfazer o contrato de formador real (allowlist == genericas).
function fmtContagemSimples(
  resumoOk: (n: number) => string,
  naoOperado: string,
): FormatadorCanonico {
  return (env) => {
    const n = Number(env._agregado?.contagem ?? env._DESTAQUE?.contagem ?? 0);
    return n > 0 ? resumoOk(n) : naoOperado;
  };
}

// === F4 Onda 4 (comercial) ===
// LIVE (handler chama enriquecerEnvelope): vendedores_cadastrados,
// pedidos_sem_vendedor, detalhar_pedido. Os demais sao espelho (handler ja
// monta _RESPOSTA inline / factory), registrados p/ satisfazer o contrato.
const fmtComercialContarPedidos: FormatadorCanonico = (env) => {
  const destaque = env._DESTAQUE ?? {};
  const agregado = env._agregado ?? {};
  const totalRaw =
    destaque.totalPedidos ?? agregado.contagem ?? 0;
  const total =
    typeof totalRaw === "number" ? totalRaw : Number(totalRaw) || 0;

  if (total <= 0) {
    return "Nenhum pedido cadastrado no total.";
  }
  if (total === 1) {
    return "1 pedido cadastrado no total.";
  }
  return `${total} pedidos cadastrados no total.`;
};

const fmtVendedoresCadastrados: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.totalVendedores ?? env._agregado?.contagem ?? env.linhas.length ?? 0);
  if (total === 0) {
    return "Nenhum vendedor encontrado nos pedidos cadastrados.";
  }
  const topRaw = String(env._DESTAQUE?.topVendedor ?? "");
  const pedidosTop = Number(env._DESTAQUE?.pedidosTop ?? 0);
  const cabeca = `${total} vendedor(es) com pedidos cadastrados.`;
  const topStr = topRaw
    ? ` Mais ativo: ${humanizeName(topRaw)} com ${pedidosTop} pedido(s).`
    : "";
  return cabeca + topStr;
};

const fmtPedidosSemVendedor: FormatadorCanonico = (env) => {
  const n = Number(env._DESTAQUE?.totalPedidos ?? env._agregado?.contagem ?? 0);
  const valor = Number(env._DESTAQUE?.valorTotal ?? env._agregado?.soma ?? 0);
  if (n === 0) {
    return "Nenhum pedido sem vendedor atribuido no criterio informado. Todos os pedidos tem responsavel.";
  }
  const plural = n === 1 ? "pedido" : "pedidos";
  return `${n} ${plural} sem vendedor atribuido, totalizando ${formatBRL(valor)}.`;
};

const fmtComercialProdutosPorMargem: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const totalComMargem = Number(d.totalProdutosComMargem ?? env._agregado?.contagem ?? 0);
  const semPreco = Number(d.produtosSemPreco ?? 0);
  const topProduto = String(d.topProduto ?? "");
  const topPct = Number(d.topMargemPercentual ?? 0);

  if (totalComMargem === 0 || !topProduto) {
    return "Nenhum produto com preco de custo e venda cadastrados.";
  }

  const cabeca = `Top produto por margem: ${humanizeName(topProduto)} (margem ${topPct.toFixed(1)}%).`;
  const corpo = ` ${totalComMargem} produtos com preco cadastrado, ${semPreco} sem preco completo.`;
  return cabeca + corpo;
};

const fmtComercialPedidosPorUf: FormatadorCanonico = (env) => {
  const totalPedidos = Number(env._DESTAQUE?.totalPedidos ?? env._agregado?.contagem ?? 0);
  const totalGeral = Number(env._DESTAQUE?.totalGeral ?? env._agregado?.soma ?? 0);
  const totalUfs = Number(env._DESTAQUE?.totalUfs ?? 0);
  const topUf = String(env._DESTAQUE?.topUf ?? "");
  const quantidadeTopUf = Number(env._DESTAQUE?.quantidadeTopUf ?? 0);
  const valorTopUf = Number(env._DESTAQUE?.valorTopUf ?? 0);

  if (totalPedidos === 0 || !topUf) {
    return "Nao ha pedidos no periodo.";
  }

  const ufLabel = humanizeName(topUf);
  return (
    `Pedidos por UF: ${totalPedidos} pedidos (${formatBRL(totalGeral)}) ` +
    `em ${totalUfs} UFs. ` +
    `Estado que mais compra: ${ufLabel} com ${quantidadeTopUf} pedidos (${formatBRL(valorTopUf)}).`
  );
};

const fmtComercialProdutosPorFamilia: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const modo = String(d.modo ?? "agrupado");
  const totalEncontrados = Number(d.totalEncontrados ?? 0);
  const totalFamilias = Number(d.totalFamilias ?? 0);
  const totalProdutosNoCadastro = Number(d.totalProdutosNoCadastro ?? 0);

  if (modo === "filtrado") {
    const termo = d.familiaTermo != null ? String(d.familiaTermo) : "";
    const rotuloFamilia = termo ? humanizeName(termo) : "informada";
    if (totalEncontrados === 0) {
      return `Nao ha produtos da familia '${rotuloFamilia}'.`;
    }
    const exibidos = env.linhas?.length ?? 0;
    const produtoPlural = totalEncontrados === 1 ? "produto" : "produtos";
    if (exibidos > 0 && exibidos < totalEncontrados) {
      return `${totalEncontrados} ${produtoPlural} da familia '${rotuloFamilia}'. Listando ${exibidos}.`;
    }
    return `${totalEncontrados} ${produtoPlural} da familia '${rotuloFamilia}'.`;
  }

  if (totalFamilias === 0 && totalProdutosNoCadastro === 0) {
    return "Nenhuma familia de produtos cadastrada ainda.";
  }
  const familiaPlural = totalFamilias === 1 ? "familia" : "familias";
  const produtoPlural = totalProdutosNoCadastro === 1 ? "produto" : "produtos";
  return `${totalFamilias} ${familiaPlural} no cadastro (${totalProdutosNoCadastro} ${produtoPlural} no total).`;
};

const fmtComercialTempoMedioFechamento: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const totalPedidos = Number(d.totalPedidos ?? 0);
  if (totalPedidos === 0) {
    return "Nao ha pedidos concluidos com data de aprovacao no periodo.";
  }
  const diasMedio = Number(d.diasMedio ?? 0);
  const diasMediano = Number(d.diasMediano ?? 0);
  const diasMinimo = Number(d.diasMinimo ?? 0);
  const diasMaximo = Number(d.diasMaximo ?? 0);
  return `Tempo medio de fechamento: ${diasMedio.toFixed(1)} dias (mediana ${diasMediano.toFixed(1)}, min ${diasMinimo.toFixed(1)}, max ${diasMaximo.toFixed(1)}). Amostra: ${totalPedidos} pedidos concluidos.`;
};

const fmtComercialPedidoHistoricoEtapas: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const totalEventos = Number(d.totalEventos ?? env._agregado?.contagem ?? 0);
  const tempoTotalDias = Number(d.tempoTotalDias ?? env._agregado?.soma ?? 0);
  const etapaMaisLonga = String(d.etapaMaisLonga ?? "");
  const diasEtapaMaisLonga = Number(d.diasEtapaMaisLonga ?? 0);

  if (totalEventos === 0) {
    return "Sem histórico de etapas para este pedido.";
  }

  const nomeEtapa = etapaMaisLonga ? humanizeName(etapaMaisLonga) : "(sem nome)";
  return (
    `Pedido: ${totalEventos} transições, ${tempoTotalDias} dias no total. ` +
    `Etapa com mais tempo: ${nomeEtapa} (${diasEtapaMaisLonga} dias).`
  );
};

const fmtComercialPedidoTravadosPorEtapa: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const total = Number(d.totalTravados ?? env._agregado?.contagem ?? 0);
  const diasMin = Number(d.diasMin ?? 30);

  if (total <= 0) {
    return `Nenhum pedido parado há mais de ${diasMin} dias no fluxo de etapas.`;
  }

  const maisAntigoDias = Number(d.maisAntigoDias ?? 0);
  // A primeira linha da página 0 é o pedido mais antigo (maior diasParado) do conjunto inteiro.
  const top = env.linhas?.[0] as
    | { pedidoId?: number | null; etapaNome?: string | null; diasParado?: number }
    | undefined;
  const pedidoId = top?.pedidoId ?? null;
  const etapa = top?.etapaNome ? humanizeName(String(top.etapaNome)) : "(sem etapa)";
  const dias = Number(top?.diasParado ?? maisAntigoDias);

  const plural = total === 1 ? "pedido parado" : "pedidos parados";
  let texto = `${total} ${plural} há mais de ${diasMin} dias no fluxo de etapas.`;
  if (pedidoId != null) {
    texto += ` Mais antigo: pedido ${pedidoId} (${dias} dias em ${etapa}).`;
  } else if (maisAntigoDias > 0) {
    texto += ` Mais antigo parado há ${maisAntigoDias} dias.`;
  }
  texto +=
    " Travamento de processo (etapa sem avançar), não inadimplência financeira.";
  return texto;
};

const fmtComercialCotacoes: FormatadorCanonico = (env) => {
  // Espelho da factory honest-tool (comercial_cotacoes). Le _agregado.contagem.
  const contagem = Number(env._agregado?.contagem ?? env.linhas.length);
  if (!Number.isFinite(contagem) || contagem <= 0) {
    return "As cotacoes/propostas ainda nao sao operadas no Odoo da Matrix (sem cotacoes).";
  }
  return `${contagem} cotações no recorte.`;
};

const fmtComercialComissoes: FormatadorCanonico = (env) => {
  // Espelho da factory honest-tool (comercial_comissoes). Le _agregado.contagem.
  const contagem = Number(env._agregado?.contagem ?? 0);
  if (contagem === 0) {
    return "As comissoes ainda nao sao operadas no Odoo da Matrix (sem comissoes).";
  }
  return `${contagem} comissoes no recorte.`;
};

const fmtComercialDetalharPedido: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  // Estado nao encontrado: o handler poe { encontrado: "nao" } e nenhuma das
  // chaves de detalhe. Mensagem honesta.
  if (d.encontrado === "nao" || (d.numero === undefined && d.participante === undefined)) {
    return "Nao encontrei nenhum pedido com esse identificador no cache.";
  }

  const numeroRaw = String(d.numero ?? "").trim();
  const numero = numeroRaw.length > 0 ? numeroRaw : "(sem numero)";
  const tipoRaw = String(d.tipo ?? "").trim();
  const etapaRaw = String(d.etapa ?? "").trim();
  const participanteRaw = String(d.participante ?? "").trim();
  const vendedorRaw = String(d.vendedor ?? "").trim();
  const vrProdutos = Number(d.vrProdutos ?? 0);
  const vrNf = Number(d.vrNf ?? 0);

  const partes: string[] = [];
  let cabeca = `Pedido ${numero}`;
  if (tipoRaw.length > 0) cabeca += ` (${tipoRaw})`;
  cabeca += ".";
  partes.push(cabeca);

  if (participanteRaw.length > 0) {
    partes.push(`Participante: ${humanizeName(participanteRaw)}.`);
  }
  if (vendedorRaw.length > 0) {
    partes.push(`Vendedor: ${humanizeName(vendedorRaw)}.`);
  }
  if (etapaRaw.length > 0) {
    partes.push(`Etapa: ${etapaRaw}.`);
  }
  partes.push(
    `Valor dos produtos ${formatBRL(vrProdutos)}, valor da nota ${formatBRL(vrNf)}.`,
  );

  return partes.join(" ");
};

// === F4 Onda 4 (fiscal , 16 full-set; os 5 page-scoped entram apos fix de handler) ===
const fmtFiscalImpostosPeriodo: FormatadorCanonico = (env) => {
  const totalNotas = Number(env._DESTAQUE?.totalNotas ?? 0);
  const somaIbpt = Number(env._DESTAQUE?.somaIbpt ?? 0);
  const somaIcmsProprio = Number(env._DESTAQUE?.somaIcmsProprio ?? 0);
  if (totalNotas === 0) {
    return "Nenhuma nota fiscal encontrada para esse periodo.";
  }
  return `Impostos no periodo (${totalNotas} notas): IBPT (estimativa) ${formatBRL(somaIbpt)}, ICMS proprio ${formatBRL(somaIcmsProprio)}.`;
};

const fmtFiscalProdutosFaturados: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const totalProdutos = Number(d.totalProdutos ?? env._agregado?.contagem ?? 0);
  const totalGeral = Number(d.totalGeral ?? env._agregado?.soma ?? 0);
  const totalQuantidade = Number(d.totalQuantidade ?? 0);
  const topProduto = String(d.topProduto ?? "");
  const valorTopProduto = Number(d.valorTopProduto ?? 0);

  if (totalProdutos <= 0 && !topProduto) {
    return "Nao ha produtos faturados no periodo.";
  }

  const nomeTop = topProduto ? humanizeName(topProduto) : "(sem nome)";
  const qtd = totalQuantidade.toLocaleString("pt-BR");
  return (
    "Top produto faturado: " +
    nomeTop +
    " (" +
    formatBRL(valorTopProduto) +
    "). Total: " +
    totalProdutos +
    " produtos, " +
    formatBRL(totalGeral) +
    ", " +
    qtd +
    " unidades."
  );
};

const fmtFiscalContarNotas: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const total = Number(d.totalNotas ?? env._agregado?.contagem ?? 0);
  const saida = Number(d.totalSaida ?? 0);
  const entrada = Number(d.totalEntrada ?? 0);
  if (total === 0) {
    return "Nenhuma nota fiscal encontrada no cache.";
  }
  return `${total} notas fiscais no total: ${saida} emitidas (saída) e ${entrada} recebidas (entrada).`;
};

const fmtFaturamentoMensalSerie: FormatadorCanonico = (env) => {
  const ano = Number(env._DESTAQUE?.ano ?? 0);
  const totalAno = Number(env._DESTAQUE?.totalAno ?? env._agregado?.soma ?? 0);
  const totalNotasAno = Number(env._DESTAQUE?.totalNotasAno ?? env._agregado?.contagem ?? 0);
  const meses = Number(env._DESTAQUE?.mesesConsultados ?? 0);
  if (totalNotasAno === 0 || totalAno === 0) {
    return ano > 0
      ? `Nenhum faturamento de venda registrado em ${ano} (${meses} meses consultados).`
      : "Nenhum faturamento de venda no periodo consultado.";
  }
  const mediaMensal = meses > 0 ? totalAno / meses : 0;
  const cabeca = `Faturamento de ${ano}: ${formatBRL(totalAno)} em ${totalNotasAno} notas, ao longo de ${meses} ${meses === 1 ? "mes" : "meses"}.`;
  const tail = meses > 0 ? ` Media mensal: ${formatBRL(mediaMensal)}.` : "";
  return cabeca + tail;
};

const fmtFiscalNotasEmitidasPorCliente: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const clienteTermo = String(d.clienteTermo ?? "");
  const totalNotas = Number(d.totalNotas ?? env._agregado?.contagem ?? 0);
  const valorTotal = Number(d.valorTotal ?? env._agregado?.soma ?? 0);
  const linhasExibidas = Number(d.linhasExibidas ?? (env.linhas?.length ?? 0));
  if (totalNotas === 0) {
    return `Nao ha notas emitidas para '${clienteTermo}' no periodo.`;
  }
  return `${totalNotas} notas emitidas para '${clienteTermo}', total ${formatBRL(valorTotal)}. Listando ${linhasExibidas}.`;
};

const fmtFiscalNotasEmitidasPorProduto: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const ag = env._agregado ?? {};
  const produtoTermo = String(d.produtoTermo ?? "");
  const totalNotas = Number(d.totalNotas ?? ag.contagem ?? 0);
  const quantidadeTotal = Number(d.quantidadeTotal ?? 0);
  const valorTotal = Number(d.valorTotal ?? ag.soma ?? 0);
  const linhasExibidas = Number(d.linhasExibidas ?? (env.linhas ? env.linhas.length : 0));

  if (totalNotas === 0) {
    return `Nao ha notas emitidas com o produto '${produtoTermo}' no periodo.`;
  }

  const palavraNotas = totalNotas === 1 ? "nota" : "notas";
  const palavraUnid = quantidadeTotal === 1 ? "unidade" : "unidades";
  return `${totalNotas} ${palavraNotas} com '${produtoTermo}', ${quantidadeTotal} ${palavraUnid}, ${formatBRL(valorTotal)}. Listando ${linhasExibidas}.`;
};

const fmtFiscalDfeImportadosPeriodo: FormatadorCanonico = (env) => {
  const n = Number(env._DESTAQUE?.totalDfe ?? env._agregado?.contagem ?? 0);
  const valor = Number(env._DESTAQUE?.valorTotal ?? env._agregado?.soma ?? 0);
  if (n === 0) {
    return "Nenhum DF-e importado no periodo.";
  }
  return `DF-e importados no periodo: ${n} notas (valor declarado ${formatBRL(valor)}, pode estar 0 nesta base).`;
};

const fmtFiscalDfePorFornecedor: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const totalDfe = Number(d.totalDfe ?? 0);
  const totalFornecedores = Number(d.totalFornecedores ?? 0);
  const topRaw = String(d.topFornecedor ?? "").trim();
  const notasTop = Number(d.notasTopFornecedor ?? 0);

  if (totalDfe <= 0 || totalFornecedores <= 0) {
    return "Nenhum DF-e no período.";
  }

  const notaPalavra = totalDfe === 1 ? "nota" : "notas";
  const fornPalavra = totalFornecedores === 1 ? "fornecedor" : "fornecedores";
  let texto = `DF-e por fornecedor: ${totalDfe} ${notaPalavra} em ${totalFornecedores} ${fornPalavra}.`;

  if (topRaw) {
    const nomeTop = humanizeName(topRaw);
    const notaTopPalavra = notasTop === 1 ? "nota" : "notas";
    texto += ` Top: ${nomeTop} com ${notasTop} ${notaTopPalavra}.`;
  }

  return texto;
};

const fmtFiscalDfePendentesManifestacao: FormatadorCanonico = (env) => {
  const dest = (env._DESTAQUE ?? {}) as Record<string, string | number>;
  const pendentes = Number(dest.pendentes ?? env._agregado?.contagem ?? 0);
  if (!Number.isFinite(pendentes) || pendentes <= 0) {
    return "Nenhum DF-e pendente de manifestacao no periodo.";
  }
  return `${pendentes} DF-e pendentes de manifestacao no periodo.`;
};

const fmtFiscalReinfEventos: FormatadorCanonico = (env) => {
  const totalEventos = Number(env._DESTAQUE?.totalEventos ?? env._agregado?.contagem ?? 0);
  if (!totalEventos || totalEventos <= 0) {
    return (
      "O REINF (eventos de obrigação acessória) ainda não é operado no Odoo da Matrix (sem eventos). " +
      "Esta consulta passa a responder quando os eventos REINF forem gerados no ERP."
    );
  }
  return `${totalEventos} eventos REINF no período.`;
};

const fmtFiscalFaturamentoPorEmpresa: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const total = Number(d.totalGrupo ?? env._agregado?.soma ?? 0);
  const empresas = Number(d.empresasComFaturamento ?? env._agregado?.contagem ?? 0);
  if (empresas === 0 || total === 0) {
    return "Nenhuma empresa do grupo teve faturamento de venda autorizado no periodo.";
  }
  const plural = empresas === 1 ? "empresa" : "empresas";
  return `Faturamento de venda autorizado do grupo: ${formatBRL(total)} em ${empresas} ${plural} com faturamento.`;
};

const fmtFiscalFaturamentoPorOperacao: FormatadorCanonico = (env) => {
  const valorGeral = Number(env._DESTAQUE?.valorGeral ?? env._agregado?.soma ?? 0);
  const valorVenda = Number(env._DESTAQUE?.valorVenda ?? 0);
  const valorNaoVenda = valorGeral - valorVenda;
  const totalNaturezas = Number(env._agregado?.contagem ?? env.linhas.length);

  if (totalNaturezas === 0 || valorGeral === 0) {
    return "Nenhuma nota fiscal de saida autorizada encontrada para o periodo e a empresa informados.";
  }

  const partes: string[] = [];
  partes.push(
    `Faturamento de saida autorizado por natureza de operacao: ${formatBRL(valorGeral)} em ${totalNaturezas} natureza(s).`,
  );
  partes.push(
    `Sendo ${formatBRL(valorVenda)} em operacoes de venda e ${formatBRL(valorNaoVenda)} em operacoes que nao sao venda (transferencias, devolucoes e afins).`,
  );

  const linhas = Array.isArray(env.linhas) ? env.linhas : [];
  if (linhas.length > 0) {
    const top = linhas[0] as {
      naturezaOperacaoNome?: string | null;
      ehVenda?: boolean;
      valor?: number;
      totalNotas?: number;
    };
    const nome = top.naturezaOperacaoNome
      ? humanizeName(String(top.naturezaOperacaoNome))
      : "Natureza nao informada";
    const flag = top.ehVenda ? "venda" : "nao venda";
    partes.push(
      `Maior natureza: ${nome} (${flag}), ${formatBRL(Number(top.valor ?? 0))} em ${Number(top.totalNotas ?? 0)} nota(s).`,
    );
  }

  return partes.join(" ");
};

const fmtFaturamentoPorCfop: FormatadorCanonico = (env) => {
  const valorGeral = Number(env._DESTAQUE?.valorGeral ?? env._agregado?.soma ?? 0);
  const cfops = Number(env._DESTAQUE?.cfops ?? env._agregado?.contagem ?? 0);
  if (cfops === 0 || valorGeral === 0) {
    return "Nenhum faturamento de saida autorizado por CFOP no periodo.";
  }
  const sufixo = cfops === 1 ? "CFOP" : "CFOPs";
  return `Faturamento de saida autorizado por CFOP: ${formatBRL(valorGeral)} distribuido em ${cfops} ${sufixo}. Valor rateado pelo item da nota; o fechamento com o total bate por tolerancia, nao exato.`;
};

const fmtFaturamentoNaoAutorizado: FormatadorCanonico = (env) => {
  const totalNotas = Number(env._DESTAQUE?.totalNotas ?? env._agregado?.contagem ?? 0);
  const valor = Number(env._DESTAQUE?.valor ?? env._agregado?.soma ?? 0);
  if (totalNotas === 0) {
    return "Nenhuma nota de saida pendente de autorizacao no periodo. Todas estao autorizadas ou canceladas.";
  }
  const plural = totalNotas === 1 ? "nota" : "notas";
  return `Faturamento nao autorizado: ${totalNotas} ${plural} de saida (denegada, rejeitada, em processamento ou sem situacao definida) somando ${formatBRL(valor)}, fora do total autorizado ou cancelado.`;
};

const fmtFaturamentoRecebido: FormatadorCanonico = (env) => {
  const recebido = Number(env._DESTAQUE?.recebido ?? 0);
  const aReceber = Number(env._DESTAQUE?.aReceber ?? 0);
  const pedidos = Number(env._agregado?.contagem ?? 0);

  if (recebido === 0 && aReceber === 0 && pedidos === 0) {
    return "Nenhum lancamento financeiro vinculado a pedido foi encontrado para o periodo e a empresa informados.";
  }

  const total = recebido + aReceber;
  const pctRecebido = total > 0 ? Math.round((recebido / total) * 100) : 0;
  const pedidoLabel = pedidos === 1 ? "pedido" : "pedidos";

  return (
    `Faturamento recebido (pago): ${formatBRL(recebido)}. ` +
    `Ainda a receber: ${formatBRL(aReceber)}. ` +
    `Base: ${pedidos} ${pedidoLabel} com lancamento financeiro, ` +
    `${pctRecebido}% do total ja recebido.`
  );
};

const fmtFiscalDetalharNota: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  // Estado nao-encontrado: o handler injeta { encontrado: "nao" } quando a nota nao existe.
  if (String(d.encontrado ?? "") === "nao") {
    return "Nenhuma nota fiscal encontrada para o odooId informado.";
  }
  const chave = String(d.chave ?? "").trim();
  const participanteRaw = String(d.participante ?? "").trim();
  const situacaoRaw = String(d.situacao ?? "").trim();
  const vrNf = Number(d.vrNf ?? 0);

  const partes: string[] = [];
  if (participanteRaw) {
    partes.push(`Nota fiscal de ${humanizeName(participanteRaw)}`);
  } else {
    partes.push("Nota fiscal");
  }
  partes.push(`no valor de ${formatBRL(vrNf)}`);
  if (situacaoRaw) {
    partes.push(`situacao ${situacaoRaw}`);
  }
  let texto = partes.join(", ") + ".";
  if (chave) {
    texto += ` Chave de acesso: ${chave}.`;
  }
  return texto;
};

// === F4 Onda 4 (preco/servico/cadastros/contabil/status , 19 seguros) ===
const fmtPrecoContarRegras: FormatadorCanonico = (env) => {
  const destaque = (env._DESTAQUE ?? {}) as Record<string, string | number>;
  const totalRaw = destaque.totalRegras;
  const total = typeof totalRaw === "number" ? totalRaw : Number(totalRaw ?? 0);
  if (!Number.isFinite(total) || total <= 0) {
    return "Nenhuma regra de preco cadastrada no momento.";
  }
  const plural = total === 1 ? "regra de preco cadastrada" : "regras de preco cadastradas";
  return `${total.toLocaleString("pt-BR")} ${plural} (todas as tabelas).`;
};

const fmtServicoContar: FormatadorCanonico = (env) => {
  const destaque = (env._DESTAQUE ?? {}) as Record<string, string | number>;
  const agregado = (env._agregado ?? {}) as { soma?: number; contagem?: number; media?: number };
  const bruto = destaque.totalServicos ?? agregado.contagem;
  const total = typeof bruto === "number" ? bruto : Number(bruto ?? 0);
  if (!Number.isFinite(total) || total <= 0) {
    return "Nenhum servico cadastrado no catalogo.";
  }
  const palavra = total === 1 ? "servico cadastrado" : "servicos cadastrados";
  return `${total} ${palavra} no catalogo.`;
};

const fmtCadastroParceirosPorCidade: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const total = Number(d.totalEncontrados ?? env._agregado?.contagem ?? 0);
  const exibidas = Number(d.linhasExibidas ?? (env.linhas?.length ?? 0));
  const uf = String(d.uf ?? "").trim();
  const cidade = String(d.cidade ?? "").trim();
  const zona = String(d.zona ?? "todas").trim();

  const ufLabel = uf ? uf.toUpperCase() : "todas as UFs";
  const zonaLabel = zona === "capital" ? "na capital" : zona === "interior" ? "no interior" : "";
  const cidadeLabel = cidade ? `em ${humanizeName(cidade)}` : "";
  const ondeLabel = [zonaLabel, cidadeLabel, `de ${ufLabel}`].filter(Boolean).join(" ");

  if (total === 0) {
    return `Nao ha parceiros ${ondeLabel}.`;
  }

  let texto = `${total} parceiros ${ondeLabel}. Listando ${exibidas}.`;

  const linhas = Array.isArray(env.linhas) ? env.linhas : [];
  if (linhas.length > 0) {
    const amostra = linhas.slice(0, 5).map((l) => {
      const reg = l as Record<string, unknown>;
      const nome = reg.nome ? humanizeName(String(reg.nome)) : "(sem nome)";
      const cid = reg.cidade ? String(reg.cidade) : null;
      const u = reg.uf ? String(reg.uf) : null;
      const local = [cid, u].filter(Boolean).join(", ");
      const papeis: string[] = [];
      if (reg.ehCliente) papeis.push("cliente");
      if (reg.ehFornecedor) papeis.push("fornecedor");
      const papelTxt = papeis.length ? ` (${papeis.join(" e ")})` : "";
      return `- ${nome}${local ? `, ${local}` : ""}${papelTxt}`;
    });
    texto += `\n${amostra.join("\n")}`;
    if (total > linhas.length) {
      texto += `\n... e mais ${total - exibidas} parceiros.`;
    }
  }

  return texto;
};

const fmtCadastroCidadesListar: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const totalCidades = Number(d.totalCidadesDistintas ?? 0);
  const totalUfs = Number(d.totalUfs ?? 0);
  const totalParceiros = Number(d.totalParceiros ?? 0);
  const topCidade = String(d.topCidade ?? "");
  const topUf = String(d.topUf ?? "");
  const quantidadeTopCidade = Number(d.quantidadeTopCidade ?? 0);

  const linhas = Array.isArray(env.linhas) ? env.linhas : [];

  if (totalCidades === 0 || !topCidade) {
    return "Nao ha cidades cadastradas no cadastro de parceiros.";
  }

  const cidadeLabel = totalCidades === 1 ? "cidade distinta" : "cidades distintas";
  const ufLabel = totalUfs === 1 ? "UF" : "UFs";
  const cabeca =
    `${totalCidades} ${cidadeLabel} em ${totalUfs} ${ufLabel}, ` +
    `somando ${totalParceiros} parceiros cadastrados.`;

  const topUfTexto = topUf ? ` (${humanizeName(topUf)})` : " (sem UF)";
  const top =
    ` Cidade com mais parceiros: ${humanizeName(topCidade)}${topUfTexto}, ` +
    `com ${quantidadeTopCidade} parceiros.`;

  const listando = linhas.length > 0 ? ` Listando ${linhas.length}.` : "";

  return cabeca + top + listando;
};

const fmtCadastroParceirosNovos: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const total = Number(d.totalEncontrados ?? env._agregado?.contagem ?? 0);
  const exibidas = Number(d.linhasExibidas ?? env.linhas?.length ?? 0);
  const tipoLabel = String(d.tipo ?? "parceiros");
  const nome = String(d.periodoNome ?? "");
  const de = String(d.periodoDe ?? "");
  const ate = String(d.periodoAte ?? "");
  const periodoLabel = nome
    ? nome.replace(/_/g, " ")
    : (de && ate ? `${de} a ${ate}` : "o periodo");

  if (total === 0) {
    return `Nao ha ${tipoLabel} novos cadastrados em ${periodoLabel}.`;
  }

  const top = env.linhas?.[0] as
    | { nome?: string | null; dataCriacao?: string | null }
    | undefined;
  const topNome = top?.nome ? humanizeName(String(top.nome)) : "(sem nome)";
  const topData =
    top?.dataCriacao ? ` (${String(top.dataCriacao).slice(0, 10)})` : "";

  return `${total} ${tipoLabel} novos cadastrados em ${periodoLabel}. Mais recente: ${topNome}${topData}. Listando ${exibidas}.`;
};

const fmtCadastroParceirosSemDocumento: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.totalEncontrados ?? env._agregado?.contagem ?? 0);
  const exibidas = Number(env._DESTAQUE?.linhasExibidas ?? env.linhas.length);
  const tipo = String(env._DESTAQUE?.tipo ?? "parceiros");
  if (total === 0) {
    return `Nao ha ${tipo} ativos sem documento cadastrado.`;
  }
  const cabeca = `${total} ${tipo} ativos sem documento (CNPJ/CPF). Listando ${exibidas}.`;
  const amostra = env.linhas.slice(0, 5).map((l) => {
    const nome = humanizeName(String((l as { nome?: unknown }).nome ?? "(sem nome)"));
    const cidade = (l as { cidade?: unknown }).cidade;
    const uf = (l as { uf?: unknown }).uf;
    const local = cidade || uf ? ` (${[cidade, uf].filter(Boolean).join("/")})` : "";
    return `${nome}${local}`;
  });
  const corpo = amostra.length > 0 ? ` Exemplos: ${amostra.join("; ")}.` : "";
  return cabeca + corpo;
};

const fmtCadastroFiliaisListar: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.totalEncontrados ?? env._agregado?.contagem ?? 0);
  const matrizes = Number(env._DESTAQUE?.totalMatrizes ?? 0);
  const filiais = Number(env._DESTAQUE?.totalFiliais ?? 0);
  const exibidas = Number(env._DESTAQUE?.linhasExibidas ?? env.linhas?.length ?? 0);

  if (total === 0) {
    return "Nao ha empresas do grupo para esse criterio.";
  }

  const cabeca =
    `${matrizes} matriz(es) + ${filiais} filial(is) = ${total} empresas do grupo. ` +
    `Listando ${exibidas}.`;

  const linhas = (env.linhas ?? []) as Array<{
    nome?: string | null;
    uf?: string | null;
    tipo?: string | null;
  }>;
  const primeira = linhas[0];
  const exemplo = primeira?.nome
    ? ` Ex.: ${humanizeName(String(primeira.nome))}` +
      (primeira.uf ? ` (${String(primeira.uf).toUpperCase()})` : "") +
      "."
    : "";

  return cabeca + exemplo;
};

const fmtDetalharParceiro: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  if (d.encontrado === "nao" || (d.nome === undefined && d.documento === undefined)) {
    return "Nenhum parceiro encontrado com esse identificador.";
  }
  const nome = String(d.nome ?? "").trim();
  const documento = String(d.documento ?? "").trim();
  const papel = String(d.papel ?? "").trim();
  const uf = String(d.uf ?? "").trim();
  const ativo = String(d.ativo ?? "").trim();

  const titulo = nome ? humanizeName(nome) : "Parceiro";
  const partes: string[] = [`Cadastro de ${titulo}.`];

  const detalhes: string[] = [];
  if (documento) detalhes.push(`documento ${documento}`);
  if (papel && papel !== "outro") {
    detalhes.push(`papel ${papel}`);
  } else if (papel === "outro") {
    detalhes.push("sem papel comercial definido");
  }
  if (uf) detalhes.push(`UF ${uf}`);
  if (ativo) detalhes.push(ativo === "sim" ? "cadastro ativo" : "cadastro inativo");

  if (detalhes.length > 0) {
    partes.push(`${detalhes.join(", ")}.`);
  }
  return partes.join(" ");
};

const fmtCadastroDetalharProduto: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  if (d.encontrado === "nao" || d.nome === undefined) {
    return "Nenhum produto encontrado para esse identificador.";
  }
  const nome = humanizeName(String(d.nome));
  const codigo = d.codigo !== undefined && String(d.codigo) !== "" ? String(d.codigo) : null;
  const marca = d.marca !== undefined && String(d.marca) !== "" ? humanizeName(String(d.marca)) : null;
  const precoVenda = Number(d.precoVenda ?? 0);
  const ativo = String(d.ativo ?? "nao") === "sim";

  const partes: string[] = [];
  let cabeca = `Produto: ${nome}`;
  if (codigo) cabeca += ` (codigo ${codigo})`;
  partes.push(cabeca + ".");
  if (marca) partes.push(`Marca: ${marca}.`);
  if (precoVenda > 0) partes.push(`Preco de venda: ${formatBRL(precoVenda)}.`);
  partes.push(ativo ? "Cadastro ativo." : "Cadastro inativo.");
  return partes.join(" ");
};

const fmtContabilResultadoPorNatureza: FormatadorCanonico = (env) => {
  const temLinhas = Array.isArray(env.linhas) && env.linhas.length > 0;
  if (!temLinhas) {
    return (
      "Nao encontrei lancamentos contabeis de resultado nesse recorte. " +
      "A contabilidade ainda nao e operada no Odoo da Matrix (sem lancamentos lancados); " +
      "esta consulta passa a responder sozinha assim que os lancamentos existirem."
    );
  }
  const receita = Number(env._DESTAQUE?.receita ?? 0);
  const despesa = Number(env._DESTAQUE?.despesa ?? 0);
  const resultado = Number(env._DESTAQUE?.resultado ?? receita - despesa);
  const palavra = resultado >= 0 ? "lucro" : "prejuizo";
  return (
    `Resultado pelas contas de natureza Resultado: receita ${formatBRL(receita)}, ` +
    `despesa ${formatBRL(despesa)}, resultado ${formatBRL(resultado)} (${palavra}). ` +
    "Recorte por natureza 04, exclui lancamentos de encerramento; nao e uma DRE estruturada."
  );
};

const fmtCentroCusto: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const n = Number(d.contagem ?? env.linhas.length ?? 0);
  if (n === 0) {
    return "Nao ha saldo por centro de custo para esse recorte (a contabilidade ainda nao tem lancamentos ou o periodo nao possui itens com centro de custo).";
  }
  return `Saldo por centro de custo: ${n} centro(s) de custo com movimento no periodo.`;
};

const fmtContabilContaReferencial: FormatadorCanonico = (env) => {
  const total = Number(env._DESTAQUE?.contagem ?? 0);
  const exibidas = Number(env._DESTAQUE?.linhasExibidas ?? env.linhas.length);
  const natureza = String(env._DESTAQUE?.natureza ?? "").trim();
  const termo = String(env._DESTAQUE?.termo ?? "").trim();

  const filtros: string[] = [];
  if (natureza) filtros.push(`natureza ${natureza}`);
  if (termo) filtros.push(`termo "${termo}"`);
  const sufixoFiltro = filtros.length > 0 ? ` (filtro: ${filtros.join(", ")})` : "";

  if (total === 0) {
    return `Nenhuma conta referencial do SPED encontrada${sufixoFiltro}.`;
  }

  const cabeca =
    total === 1
      ? `Encontrei 1 conta referencial do SPED${sufixoFiltro}.`
      : `Encontrei ${total} contas referenciais do SPED${sufixoFiltro}.`;

  const truncado = exibidas < total;
  const listagem = truncado
    ? ` Listando as ${exibidas} primeiras (ordenadas por codigo); refine por natureza/termo ou aumente o limite.`
    : "";

  const primeira = env.linhas?.[0] as
    | { codigo?: string; nome?: string | null }
    | undefined;
  const exemplo =
    primeira && primeira.codigo
      ? ` Primeira: ${primeira.codigo} ${humanizeName(String(primeira.nome ?? ""))}.`.replace(/\s+\./, ".")
      : "";

  return (cabeca + listagem + exemplo).trim();
};

const fmtContabilDetalharConta: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  if (d.encontrado === "nao" || (d.codigo === undefined && d.nome === undefined)) {
    return "Nenhuma conta contabil encontrada para o odooId informado.";
  }
  const codigo = String(d.codigo ?? "").trim();
  const nome = String(d.nome ?? "").trim();
  const tipoRaw = String(d.tipo ?? "").trim().toUpperCase();
  const tipoLabel =
    tipoRaw === "S" ? "sintetica" : tipoRaw === "A" ? "analitica" : tipoRaw;

  const partes: string[] = [];
  const cabeca = [codigo, nome].filter(Boolean).join(" ").trim();
  partes.push(cabeca ? `Conta ${cabeca}.` : "Conta contabil.");

  if (tipoLabel) {
    partes.push(`Tipo: ${tipoLabel}.`);
  }

  const natureza = String(d.natureza ?? "").trim();
  if (natureza) {
    partes.push(`Natureza: ${natureza}.`);
  }

  const nivelRaw = d.nivel;
  if (nivelRaw !== undefined && nivelRaw !== null && String(nivelRaw).trim() !== "") {
    partes.push(`Nivel ${Number(nivelRaw)}.`);
  }

  return partes.join(" ");
};

const fmtRhStatusDominio: FormatadorCanonico = (env) => {
  const registros = Number(
    env._DESTAQUE?.registros ?? env._agregado?.contagem ?? 0,
  );
  if (registros > 0) {
    return `O dominio RH no Odoo da Matrix tem ${registros} registro(s).`;
  }
  return (
    "O dominio RH existe no Odoo da Matrix mas nao e operado, 0 registros. " +
    "Quando a Matrix passar a usar o modulo, este dominio ganha tools de consulta."
  );
};

const fmtCrmStatusDominio: FormatadorCanonico = (env) => {
  const d = env._DESTAQUE ?? {};
  const registros = Number(d.registros ?? 0);
  if (registros > 0) {
    return `O dominio CRM passou a ser operado no Odoo da Matrix: ${registros} registro(s).`;
  }
  return (
    "O dominio CRM existe no Odoo da Matrix mas nao e operado, 0 registros. " +
    "Quando a Matrix passar a usar o modulo, este dominio ganha tools de consulta."
  );
};

const fmtProducaoStatusDominio: FormatadorCanonico = (env) => {
  const registros = Number(env._DESTAQUE?.registros ?? 0);
  const mensagem = env._DESTAQUE?.mensagem
    ? String(env._DESTAQUE.mensagem)
    : "";
  if (mensagem) {
    return mensagem;
  }
  return (
    `O dominio Producao existe no Odoo da Matrix mas nao e operado: ${registros} registros. ` +
    "Quando a Matrix passar a usar o modulo, este dominio ganha tools de consulta."
  );
};

const fmtCrmPipelineFunis: FormatadorCanonico = (env) => {
  const contagem = Number(env._agregado?.contagem ?? env.linhas.length);
  if (!Number.isFinite(contagem) || contagem <= 0) {
    return "O funil de CRM nao e operado no Odoo da Matrix (sem pipelines).";
  }
  const top = env.linhas?.[0] as
    | { numero?: number | null; nome?: string | null; tipo?: string | null; ativo?: boolean }
    | undefined;
  const plural = contagem === 1 ? "funil de CRM cadastrado" : "funis de CRM cadastrados";
  let texto = `${contagem} ${plural}.`;
  if (top && (top.nome || top.numero != null)) {
    const nome = top.nome ? humanizeName(String(top.nome)) : `funil ${top.numero ?? "?"}`;
    const estado = top.ativo === false ? " (inativo)" : "";
    texto += ` Primeiro: ${nome}${estado}.`;
  }
  return texto;
};

const fmtProducaoProcessos: FormatadorCanonico = (env) => {
  const e = env as unknown as {
    estado?: string;
    dados?: {
      linhas?: Array<{ ordem?: number | null; nome?: string | null; descricao?: string | null; tempo?: number | null }>;
      total?: number;
      _RESPOSTA?: string;
      _agregado?: { contagem?: number };
      _listaTruncada?: boolean;
    };
  };

  if (e.estado === "preparando") {
    return "Os dados de producao ainda estao sendo preparados. Tente novamente em instantes.";
  }

  const dados = e.dados ?? {};
  const base = String(dados._RESPOSTA ?? "").trim();
  const linhas = Array.isArray(dados.linhas) ? dados.linhas : [];
  const contagem = dados._agregado?.contagem ?? dados.total ?? linhas.length;

  if (contagem === 0 || linhas.length === 0) {
    return base || "A producao ainda nao e operada no Odoo da Matrix (sem processos cadastrados).";
  }

  const partes: string[] = [];
  partes.push(base || `${contagem} processos de producao cadastrados.`);

  const itens = linhas.slice(0, 15).map((l) => {
    const nome = l.nome ? humanizeName(String(l.nome)) : "Processo sem nome";
    const ordem = l.ordem != null ? `#${l.ordem} ` : "";
    const tempo = typeof l.tempo === "number" && l.tempo > 0 ? ` (tempo padrao ${l.tempo}h)` : "";
    const desc = l.descricao ? `: ${String(l.descricao).trim()}` : "";
    return `${ordem}${nome}${tempo}${desc}`;
  });

  partes.push(itens.join("\n"));

  if (dados._listaTruncada && linhas.length > 15) {
    partes.push(`Mostrando os primeiros ${itens.length} de ${contagem} processos.`);
  }

  return partes.join("\n");
};

const fmtAuditoriaRegras: FormatadorCanonico = (env) => {
  const contagem = Number(env._agregado?.contagem ?? env.linhas.length);
  if (!Number.isFinite(contagem) || contagem <= 0) {
    return "Nao ha regras de auditoria cadastradas no Odoo.";
  }
  const plural = contagem === 1 ? "regra de auditoria cadastrada" : "regras de auditoria cadastradas";
  let texto = `${contagem} ${plural}.`;

  const linhas = (env.linhas ?? []) as Array<{ nome?: string | null; ativa?: boolean }>;
  if (!env._listaTruncada && linhas.length === contagem && linhas.length > 0) {
    const ativas = linhas.filter((l) => l.ativa === true).length;
    if (ativas === contagem) {
      texto += " Todas estao ativas.";
    } else if (ativas === 0) {
      texto += " Nenhuma esta ativa.";
    } else {
      texto += ` ${ativas} ativas, ${contagem - ativas} inativas.`;
    }
    const exemplos = linhas
      .map((l) => String(l.nome ?? "").trim())
      .filter((n) => n.length > 0)
      .slice(0, 3)
      .map((n) => humanizeName(n));
    if (exemplos.length > 0) {
      texto += ` Exemplos: ${exemplos.join(", ")}.`;
    }
  }
  return texto;
};

const FORMATADORES: Record<string, FormatadorCanonico> = {
  // financeiro
  financeiro_contas_a_receber: fmtContasAReceber,
  financeiro_contas_a_pagar: fmtContasAPagar,
  financeiro_titulos_vencidos: fmtTitulosVencidos,
  financeiro_fluxo_caixa: fmtFluxoCaixa,
  financeiro_saldo_contas: fmtSaldoContas,
  financeiro_caixa_periodo: fmtCaixaPeriodo,
  financeiro_liquidez: fmtLiquidez,
  financeiro_resultado_por_conta: fmtResultadoPorConta,
  financeiro_baixas_cobranca: fmtContagemSimples(
    (n) => `${n} baixas de cobranca no periodo.`,
    "A cobranca bancaria (baixas/retornos) ainda nao tem itens processados no Odoo.",
  ),
  financeiro_retornos_processados: fmtContagemSimples(
    (n) => `${n} retornos bancarios no periodo.`,
    "Nao ha retornos bancarios processados no Odoo ainda.",
  ),
  financeiro_remessas_geradas: fmtContagemSimples(
    (n) => `${n} remessas bancarias no periodo.`,
    "Nao ha remessas bancarias geradas no Odoo ainda.",
  ),
  financeiro_carteiras_cobranca: fmtContagemSimples(
    (n) => `${n} carteiras de cobranca cadastradas.`,
    "Nao ha carteiras de cobranca cadastradas no Odoo ainda.",
  ),
  financeiro_cheques: fmtContagemSimples(
    (n) => `${n} cheques no periodo.`,
    "O controle de cheques ainda nao e operado no Odoo da Matrix (sem cheques).",
  ),
  financeiro_pix_recebidos: fmtContagemSimples(
    (n) => `${n} registros de PIX no periodo.`,
    "O PIX ainda nao e operado no Odoo da Matrix (sem registros de PIX).",
  ),
  // fiscal
  fiscal_faturamento_periodo: fmtFaturamentoPeriodo,
  fiscal_faturamento_por_cliente: fmtFaturamentoPorCliente,
  fiscal_notas_emitidas: fmtNotasEmitidas,
  fiscal_notas_recebidas: fmtNotasRecebidas,
  fiscal_notas_recebidas_por_fornecedor: fmtNotasRecebidasPorFornecedor,
  fiscal_apuracao: fmtApuracaoFiscal,
  "fiscal_impostos_periodo": fmtFiscalImpostosPeriodo,
  "fiscal_produtos_faturados": fmtFiscalProdutosFaturados,
  "fiscal_contar_notas": fmtFiscalContarNotas,
  "fiscal_faturamento_mensal_serie": fmtFaturamentoMensalSerie,
  "fiscal_notas_emitidas_por_cliente": fmtFiscalNotasEmitidasPorCliente,
  "fiscal_notas_emitidas_por_produto": fmtFiscalNotasEmitidasPorProduto,
  "fiscal_dfe_importados_periodo": fmtFiscalDfeImportadosPeriodo,
  "fiscal_dfe_por_fornecedor": fmtFiscalDfePorFornecedor,
  "fiscal_dfe_pendentes_manifestacao": fmtFiscalDfePendentesManifestacao,
  "fiscal_reinf_eventos": fmtFiscalReinfEventos,
  "fiscal_faturamento_por_empresa": fmtFiscalFaturamentoPorEmpresa,
  "fiscal_faturamento_por_operacao": fmtFiscalFaturamentoPorOperacao,
  "fiscal_faturamento_por_cfop": fmtFaturamentoPorCfop,
  "fiscal_faturamento_nao_autorizado": fmtFaturamentoNaoAutorizado,
  "fiscal_faturamento_recebido": fmtFaturamentoRecebido,
  "fiscal_detalhar_nota": fmtFiscalDetalharNota,
  // preco / servico / cadastros / contabil / status (Onda 4 resto)
  "preco_contar_regras": fmtPrecoContarRegras,
  "servico_contar": fmtServicoContar,
  "cadastro_parceiros_por_cidade": fmtCadastroParceirosPorCidade,
  "cadastro_cidades_listar": fmtCadastroCidadesListar,
  "cadastro_parceiros_novos": fmtCadastroParceirosNovos,
  "cadastro_parceiros_sem_documento": fmtCadastroParceirosSemDocumento,
  "cadastro_filiais_listar": fmtCadastroFiliaisListar,
  "cadastro_detalhar_parceiro": fmtDetalharParceiro,
  "cadastro_detalhar_produto": fmtCadastroDetalharProduto,
  "contabil_resultado_por_natureza": fmtContabilResultadoPorNatureza,
  "contabil_centro_custo": fmtCentroCusto,
  "contabil_conta_referencial": fmtContabilContaReferencial,
  "contabil_detalhar_conta": fmtContabilDetalharConta,
  "rh_status_dominio": fmtRhStatusDominio,
  "crm_status_dominio": fmtCrmStatusDominio,
  "producao_status_dominio": fmtProducaoStatusDominio,
  "crm_pipeline_funis": fmtCrmPipelineFunis,
  "producao_processos": fmtProducaoProcessos,
  "auditoria_regras": fmtAuditoriaRegras,
  // estoque
  estoque_saldo_produto: fmtSaldoProduto,
  estoque_concentracao: fmtConcentracao,
  estoque_top_movimentados: fmtTopMovimentados,
  estoque_produtos_parados: fmtProdutosParados,
  estoque_produtos_saldo_zero: fmtProdutosSaldoZero,
  estoque_valor_armazem: fmtValorArmazem,
  estoque_entradas_saidas: fmtEntradasSaidas,
  estoque_locais_por_produto: fmtLocaisPorProduto,
  estoque_minimo_maximo: fmtMinimoMaximo,
  // comercial
  comercial_pedidos_periodo: fmtPedidosPeriodo,
  comercial_pedidos_por_etapa: fmtPedidosPorEtapa,
  comercial_pedidos_atrasados: fmtPedidosAtrasados,
  comercial_parcelas_a_vencer: fmtParcelasAVencer,
  comercial_pedidos_por_vendedor: fmtPedidosPorVendedor,
  comercial_pedidos_listar_top_valor: fmtPedidosListarTopValor,
  comercial_contar_pedidos: fmtComercialContarPedidos,
  comercial_vendedores_cadastrados: fmtVendedoresCadastrados,
  comercial_pedidos_sem_vendedor: fmtPedidosSemVendedor,
  comercial_produtos_por_margem: fmtComercialProdutosPorMargem,
  comercial_pedidos_por_uf: fmtComercialPedidosPorUf,
  comercial_produtos_por_familia: fmtComercialProdutosPorFamilia,
  comercial_tempo_medio_fechamento: fmtComercialTempoMedioFechamento,
  comercial_pedido_historico_etapas: fmtComercialPedidoHistoricoEtapas,
  comercial_pedido_travados_por_etapa: fmtComercialPedidoTravadosPorEtapa,
  comercial_cotacoes: fmtComercialCotacoes,
  comercial_comissoes: fmtComercialComissoes,
  comercial_detalhar_pedido: fmtComercialDetalharPedido,
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
  "financeiro_liquidez",
  "financeiro_resultado_por_conta",
  "financeiro_baixas_cobranca",
  "financeiro_retornos_processados",
  "financeiro_remessas_geradas",
  "financeiro_carteiras_cobranca",
  "financeiro_cheques",
  "financeiro_pix_recebidos",
  // fiscal
  "fiscal_faturamento_periodo",
  "fiscal_faturamento_por_cliente",
  "fiscal_notas_emitidas",
  "fiscal_notas_recebidas",
  "fiscal_notas_recebidas_por_fornecedor",
  "fiscal_apuracao",
  "fiscal_produtos_faturados",
  "fiscal_impostos_periodo",
  "fiscal_contar_notas",
  "fiscal_faturamento_mensal_serie",
  "fiscal_notas_emitidas_por_cliente",
  "fiscal_notas_emitidas_por_produto",
  "fiscal_dfe_importados_periodo",
  "fiscal_dfe_por_fornecedor",
  "fiscal_dfe_pendentes_manifestacao",
  "fiscal_reinf_eventos",
  "fiscal_faturamento_por_empresa",
  "fiscal_faturamento_por_operacao",
  "fiscal_faturamento_por_cfop",
  "fiscal_faturamento_nao_autorizado",
  "fiscal_faturamento_recebido",
  "fiscal_detalhar_nota",
  // estoque
  "estoque_saldo_produto",
  "estoque_concentracao",
  "estoque_top_movimentados",
  "estoque_produtos_parados",
  "estoque_produtos_saldo_zero",
  "estoque_valor_armazem",
  "estoque_entradas_saidas",
  "estoque_locais_por_produto",
  "estoque_minimo_maximo",
  // comercial
  "comercial_pedidos_periodo",
  "comercial_pedidos_por_etapa",
  "comercial_pedidos_atrasados",
  "comercial_parcelas_a_vencer",
  "comercial_pedidos_por_vendedor",
  "comercial_pedidos_listar_top_valor",
  "comercial_contar_pedidos",
  "comercial_vendedores_cadastrados",
  "comercial_pedidos_sem_vendedor",
  "comercial_produtos_por_margem",
  "comercial_pedidos_por_uf",
  "comercial_produtos_por_familia",
  "comercial_tempo_medio_fechamento",
  "comercial_pedido_historico_etapas",
  "comercial_pedido_travados_por_etapa",
  "comercial_cotacoes",
  "comercial_comissoes",
  "comercial_detalhar_pedido",
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

/**
 * Allowlist de progresso (F4 Apresentacao, [P]#9). Read-tools que AINDA usam o
 * fmtGenerico e estao temporariamente liberadas do teste de contrato
 * (mcp/__tests__/envelope-contract.test.ts). Cada sub-task da Onda 4 remove o
 * id da sua tool aqui ao escrever o formatador real. **Deve chegar a `[]` na
 * Onda 6** , o teste de contrato exige que este conjunto seja IGUAL ao conjunto
 * de read-tools genericas (sem stale, sem id faltando). Gerada da catalogo real
 * (102 read tools, 29 com formatador real, 73 genericas) em 2026-06-07.
 */
export const TOOLS_SEM_FORMATADOR_REAL: string[] = [
  // RESTAM 13 read-tools , precisam de fix de handler antes de migrar:
  // (a) sem envelope canonico (handler nao monta _RESPOSTA/_DESTAQUE):
  "preco_produto",
  "preco_tabela",
  "referencia_buscar",
  "servico_buscar",
  "servico_listar",
  "crm.res_partner.get",
  // (b) page-scoped (KPI somava a pagina, classe d987060):
  "fiscal_carta_correcao",
  "fiscal_certificados",
  "fiscal_faturamento_por_marca",
  "fiscal_faturamento_por_uf",
  "fiscal_mdfe_manifestos",
  "contabil_saldo_conta",
  "contabil_movimento_conta",
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
