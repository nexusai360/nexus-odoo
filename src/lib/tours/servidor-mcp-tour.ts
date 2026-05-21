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
