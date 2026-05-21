import type { TourConfig } from "@/components/tour/tour-provider";

export const servidorMcpTour: TourConfig = {
  id: "integracoes-servidor-mcp-v1",
  title: "Tour do Servidor MCP",
  steps: [
    {
      id: "abas",
      targetSelector: "[data-tour='mcp-nav']",
      title: "As quatro áreas do painel",
      description:
        "Visão Geral mostra a saúde e o uso. Chaves de Acesso é onde você cria as chaves de API. Logs registra cada chamada. Documentação explica como integrar.",
      placement: "bottom",
    },
    {
      id: "status",
      targetSelector: "[data-tour='mcp-status']",
      title: "O servidor está no ar?",
      description:
        "Este bloco diz se o endpoint MCP está respondendo e mostra a URL pública para você copiar e usar nas integrações.",
      placement: "bottom",
    },
    {
      id: "uso",
      targetSelector: "[data-tour='mcp-uso']",
      title: "Uso nas últimas 24 horas",
      description:
        "Acompanhe o número de chamadas, a taxa de erro e a latência típica. É o jeito rápido de saber se as integrações estão saudáveis.",
      placement: "top",
    },
  ],
};

/** Mini-tour da aba Chaves de Acesso. */
export const servidorMcpChavesTour: TourConfig = {
  id: "integracoes-servidor-mcp-chaves-v1",
  title: "Tour das Chaves de Acesso",
  steps: [
    {
      id: "nova",
      targetSelector: "[data-tour='mcp-chaves-nova']",
      title: "Crie uma chave de API",
      description:
        "Clique em Nova chave para gerar um token. Você define o rótulo, o que a chave pode fazer em cada módulo e o limite de chamadas por minuto.",
      placement: "bottom",
    },
    {
      id: "lista",
      targetSelector: "[data-tour='mcp-chaves-cabecalho']",
      title: "Suas chaves",
      description:
        "Cada chave aparece abaixo com o resumo de acessos e o último uso. Pelo menu de cada uma você edita, rotaciona o token ou revoga.",
      placement: "bottom",
    },
  ],
};

/** Mini-tour da aba Logs / Audit. */
export const servidorMcpLogsTour: TourConfig = {
  id: "integracoes-servidor-mcp-logs-v1",
  title: "Tour dos Logs",
  steps: [
    {
      id: "filtros",
      targetSelector: "[data-tour='mcp-logs-filtros']",
      title: "Filtre as chamadas",
      description:
        "Busque por tool, filtre por status (Sucesso, Erro, Negado, Inválido) e por período. Dá para exportar o resultado filtrado.",
      placement: "bottom",
    },
    {
      id: "lista",
      targetSelector: "[data-tour='mcp-logs-lista']",
      title: "Cada chamada registrada",
      description:
        "Toda chamada ao servidor MCP vira uma linha aqui. Clique para expandir e ver duração, parâmetros e o que aquela tool faz.",
      placement: "top",
    },
  ],
};

/** Mini-tour da aba Documentação. */
export const servidorMcpDocsTour: TourConfig = {
  id: "integracoes-servidor-mcp-docs-v1",
  title: "Tour da Documentação",
  steps: [
    {
      id: "passos",
      targetSelector: "[data-tour='mcp-docs-passos']",
      title: "Comece por aqui",
      description:
        "Os quatro passos resumem como integrar: gerar a chave, autenticar, encontrar a tool certa e copiar um exemplo pronto.",
      placement: "bottom",
    },
    {
      id: "tools",
      targetSelector: "[data-tour='mcp-docs-tools']",
      title: "O catálogo de tools",
      description:
        "Todas as tools disponíveis, agrupadas por módulo, com os argumentos de cada uma e exemplos prontos em curl, JSON-RPC e n8n.",
      placement: "top",
    },
  ],
};
