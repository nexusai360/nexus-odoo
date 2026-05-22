/**
 * Rótulos humanizados dos módulos de negócio do MCP.
 *
 * O catálogo guarda o módulo em minúsculas ("crm", "estoque"). A UI exibe o
 * rótulo correto, com siglas em caixa alta ("CRM").
 */

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  vendas: "Vendas",
  comercial: "Comercial",
  estoque: "Estoque",
  compras: "Compras",
  financeiro: "Financeiro",
  fiscal: "Fiscal",
  contabil: "Contábil",
  cadastros: "Cadastros",
  producao: "Produção",
  rh: "RH",
  projeto: "Projeto",
  outros: "Outros",
};

/** Retorna o rótulo do módulo; faz fallback capitalizando o código cru. */
export function moduleLabel(module: string): string {
  return (
    MODULE_LABELS[module] ?? module.charAt(0).toUpperCase() + module.slice(1)
  );
}
