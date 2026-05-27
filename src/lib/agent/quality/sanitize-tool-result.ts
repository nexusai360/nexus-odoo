/**
 * Sanitização de tool results antes de mandar pro LLM.
 *
 * Onda 2 do plano de melhoria do Agente Nex (rodadas 4/5 mostraram que o
 * LLM erra em agregação de listas , soma valores errados, conta errado,
 * lista mais do que cabe na bolha). Mover essa lógica do prompt pro
 * código é mais confiável: código é exato, LLM é interpretativo.
 *
 * Camadas (todas atrás de feature flag, ativadas individualmente):
 *
 * 1. APPEND_AGGREGATES (default ON quando flag SANITIZE_TOOL_RESULTS=on):
 *    Se o tool result tem `dados.linhas` array com campos numéricos
 *    reconhecidos (valor, vrSaldo, valorTotal, qtd, quantidade, saldo),
 *    anexa `dados._agregado: { soma_X, contagem, media_X, max_X, min_X }`.
 *    NÃO modifica linhas originais , só adiciona campo novo.
 *
 * 2. (futuro) FILTER_NULLS: separar linhas com campo principal null,
 *    deixar agente decidir se quer ver. Risco médio, deferido.
 *
 * 3. (futuro) TRUNCATE_LIST: se linhas.length > 50, truncar pra top 50,
 *    marcar _totalItems + _truncated. Risco baixo mas REGRA #2 do prompt
 *    já cobre limite de 10 visíveis.
 *
 * Feature flag por ENV:
 *   SANITIZE_TOOL_RESULTS=off|aggregates_only|full
 *   Default: off (não-bloqueante até validação)
 */

const NUMERIC_FIELD_NAMES = [
  "valor",
  "valorTotal",
  "vrSaldo",
  "vrTotal",
  "qtd",
  "quantidade",
  "qtdEstoque",
  "saldo",
  "saldoTotal",
  "totalNotas",
  "valorFaturado",
  "valorPago",
  "valorAberto",
  "diasAtraso",
  "diasParado",
  "count",
] as const;

export type SanitizationMode = "off" | "aggregates_only" | "full";

export function getSanitizationMode(): SanitizationMode {
  const raw = (process.env.SANITIZE_TOOL_RESULTS ?? "off").toLowerCase();
  if (raw === "full") return "full";
  if (raw === "aggregates_only" || raw === "on") return "aggregates_only";
  return "off";
}

/**
 * Sanitiza um tool result JSON string conforme o modo configurado.
 * Retorna a string sanitizada (ou a original se sanitização desabilitada,
 * ou se o input não é JSON parseável).
 */
export function sanitizeToolResult(
  raw: string,
  mode: SanitizationMode = getSanitizationMode(),
): string {
  if (mode === "off") return raw;
  if (!raw || raw.length === 0) return raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Não é JSON; deixar como está (texto livre, MCP erro, etc).
    return raw;
  }

  if (!parsed || typeof parsed !== "object") return raw;

  const root = parsed as Record<string, unknown>;
  const dados = root.dados;
  if (!dados || typeof dados !== "object") return raw;

  const dadosObj = dados as Record<string, unknown>;

  // ONDA F1: aceita array em multiplas chaves (nao so `linhas`). Resolve
  // tools financeiras (titulos), fluxo_caixa (serie), saldo_contas (contas),
  // top_movimentados (top). Antes o sanitizer saia early se nao houvesse
  // `linhas`, deixando _DESTAQUE sem aplicar em metade dos casos.
  const ARRAY_KEYS = ["linhas", "titulos", "serie", "contas", "top"] as const;
  let arr: unknown[] | null = null;
  for (const k of ARRAY_KEYS) {
    if (Array.isArray(dadosObj[k]) && (dadosObj[k] as unknown[]).length > 0) {
      arr = dadosObj[k] as unknown[];
      break;
    }
  }

  // Calcula agregados se houver array de objetos
  let aggregates: Record<string, unknown> = { contagem: 0 };
  if (arr && typeof arr[0] === "object" && arr[0] !== null) {
    aggregates = computeAggregates(arr as Array<Record<string, unknown>>);
    if (Object.keys(aggregates).some((k) => k.startsWith("agregado_"))) {
      dadosObj._agregado = aggregates;
    }
  }

  // ONDA E2+F1: promove totais agregados pro TOPO do JSON via _DESTAQUE.
  // Mini ignorava campos enterrados (totalAPagar, totalAReceber, etc).
  // Com _DESTAQUE + _INSTRUCAO no topo, LLM atende.
  const destaque: Record<string, unknown> = {};
  const PROMOTE = [
    "totalAPagar", "totalAReceber", "totalVencido", "totalAgregado",
    "totalProdutos", "totalUnidades", "totalPedidos", "valorTotal",
    "totalNotas", "totalEmpresas", "totalClientes", "totalFornecedores",
    "totalAtivos", "totalInativos", "totalParceiros", "totalPessoasFisicas",
    "totalClientesAtivos", "totalFornecedoresAtivos",
    "totalZerados", "totalNegativos",
  ];
  for (const k of PROMOTE) {
    if (k in dadosObj && dadosObj[k] != null) destaque[k] = dadosObj[k];
  }
  for (const [k, v] of Object.entries(aggregates)) {
    if (k === "contagem") destaque.contagemLinhas = v;
    else if (k.startsWith("agregado_soma_")) destaque[k] = v;
  }
  if (Object.keys(destaque).length > 0) {
    root._DESTAQUE = destaque;
    root._INSTRUCAO = "Use os valores em _DESTAQUE como totais autoritativos. NUNCA declare 'lista veio cortada/incompleta/sem somatorio' se _DESTAQUE tem o total.";
  }

  try {
    return JSON.stringify(root);
  } catch {
    return raw;
  }
}

interface AggregateForField {
  soma: number;
  media: number;
  min: number;
  max: number;
  contagemValidos: number;
}

function computeAggregates(
  linhas: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    contagem: linhas.length,
  };

  for (const fieldName of NUMERIC_FIELD_NAMES) {
    let soma = 0;
    let count = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const linha of linhas) {
      const value = linha[fieldName];
      if (typeof value === "number" && !Number.isNaN(value)) {
        soma += value;
        count++;
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }

    if (count > 0) {
      const agg: AggregateForField = {
        soma: round2(soma),
        media: round2(soma / count),
        min: round2(min),
        max: round2(max),
        contagemValidos: count,
      };
      result[`agregado_${fieldName}`] = agg;
    }
  }

  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
