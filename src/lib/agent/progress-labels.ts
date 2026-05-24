/**
 * Tradução de um id de tool do MCP para um rótulo curto, humanizado e
 * GENÉRICO, exibido na trilha de progresso do Agente Nex.
 *
 * Regra: a UI nunca mostra o id técnico da tool (ex.: `fiscal_faturamento_periodo`);
 * mostra só o domínio em linguagem de operação (ex.: "faturamento"). O casamento
 * é por prefixo de domínio, com um fallback neutro para qualquer tool nova.
 */

const DOMAIN_LABEL: Array<[RegExp, string]> = [
  [/^estoque_/, "estoque"],
  [/^financeiro_/, "financeiro"],
  [/^fiscal_/, "faturamento"],
  [/^comercial_/, "pedidos"],
  [/^(cadastro|cadastros)_/, "cadastros"],
  [/^(preco|precos)_/, "preços"],
  [/^contabil_/, "contábil"],
  [/^servico_/, "serviços"],
  [/^(crm|producao|rh)_/, "dados da operação"],
  [/^bi_/, "consulta avançada"],
  [/^registrar_lacuna/, "registro de solicitação"],
];

/** Rótulo neutro usado quando nenhum domínio casa. */
const FALLBACK_LABEL = "dados da operação";

/**
 * Devolve o rótulo genérico de uma tool. Nunca devolve o id cru.
 */
export function progressLabel(toolId: string): string {
  for (const [re, label] of DOMAIN_LABEL) {
    if (re.test(toolId)) return label;
  }
  return FALLBACK_LABEL;
}
