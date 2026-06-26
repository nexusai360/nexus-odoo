// src/lib/reports/builder/agent/builder-progress-labels.ts
// F6 (chat = Nex) , rotulo humanizado de cada tool do construtor para a trilha
// "Raciocinio" da bolha. Diferente do Nex (so leituras, "Consultou X"), o
// construtor mistura leitura e mutacao, entao os rotulos sao frases de acao
// renderizadas verbatim (ProgressStep.raw=true), sem o prefixo "Consultou".

const LABELS: Record<string, string> = {
  listar_componentes: "Vendo os componentes",
  descrever_componente: "Detalhando o componente",
  listar_fontes: "Vendo as fontes de dado",
  prever_dado: "Conferindo o formato do dado",
  criar_relatorio: "Criando o relatorio",
  adicionar_secao: "Adicionando uma secao",
  editar_secao: "Ajustando uma secao",
  remover_secao: "Removendo uma secao",
  definir_filtro: "Aplicando um filtro",
  validar: "Validando o relatorio",
};

/** Rotulo neutro quando a tool nao esta no mapa (tool nova). */
const FALLBACK = "Montando o relatorio";

/** Devolve a frase de acao de uma tool do construtor. Nunca devolve o id cru. */
export function builderProgressLabel(toolName: string): string {
  return LABELS[toolName] ?? FALLBACK;
}
