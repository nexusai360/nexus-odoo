import type { TourConfig } from "@/components/tour/tour-provider";

/** Tour da aba Visão Geral do Servidor MCP. */
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
    {
      id: "top-tools",
      targetSelector: "[data-tour='mcp-top-tools']",
      title: "Tools mais usadas",
      description:
        "Quando há chamadas no período, este bloco lista as tools mais acionadas e quantos erros cada uma teve, ajudando a achar gargalos.",
      placement: "top",
    },
  ],
};

/** Mini-tour da aba Chaves de Acesso. Abre o assistente de criação. */
export const servidorMcpChavesTour: TourConfig = {
  id: "integracoes-servidor-mcp-chaves-v1",
  title: "Tour das Chaves de Acesso",
  steps: [
    {
      id: "lista",
      targetSelector: "[data-tour='mcp-chaves-cabecalho']",
      title: "Suas chaves de acesso",
      description:
        "Cada chave de API criada aparece abaixo, com o resumo de acessos e o último uso. Por ela você edita, rotaciona o token ou revoga.",
      placement: "bottom",
    },
    {
      id: "nova",
      targetSelector: "[data-tour='mcp-chaves-nova']",
      title: "Criar uma chave",
      description:
        "Use Nova chave para abrir o assistente de criação. Vamos abri-lo agora para conhecer os passos.",
      placement: "bottom",
    },
    {
      id: "wizard",
      targetSelector: "[data-tour='mcp-chaves-wizard']",
      title: "Assistente em cinco passos",
      description:
        "Identificação dá nome à chave; Acessos define, módulo a módulo, o nível de leitura ou escrita; Limites ajusta o rate limit e a validade; Origens restringe de onde a chave pode ser usada; Resumo confirma tudo. Ao criar, o token é exibido uma única vez.",
      placement: "top",
    },
  ],
};

/** Mini-tour da aba Logs / Audit. Expande a primeira linha de log. */
export const servidorMcpLogsTour: TourConfig = {
  id: "integracoes-servidor-mcp-logs-v1",
  title: "Tour dos Logs",
  steps: [
    {
      id: "filtros",
      targetSelector: "[data-tour='mcp-logs-filtros']",
      title: "Filtre as chamadas",
      description:
        "Busque por tool, filtre por status (Sucesso, Erro, Negado, Inválido) e por período. O botão Exportar baixa o resultado filtrado.",
      placement: "bottom",
    },
    {
      id: "lista",
      targetSelector: "[data-tour='mcp-logs-lista']",
      title: "Cada chamada registrada",
      description:
        "Toda chamada ao servidor MCP vira uma linha aqui. Abrimos a primeira para você ver o detalhe: duração, parâmetros, módulo e, quando a chamada falha, o código e o motivo do erro.",
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
      id: "auth",
      targetSelector: "#auth",
      title: "Autenticação",
      description:
        "Explica como gerar a chave de API e enviá-la no header Authorization. Toda requisição é autenticada de forma independente.",
      placement: "bottom",
    },
    {
      id: "tools",
      targetSelector: "[data-tour='mcp-docs-tools-head']",
      title: "O catálogo de tools",
      description:
        "Logo abaixo, as tools são agrupadas por módulo. As de leitura aparecem em verde, as de escrita em violeta; abra qualquer uma para ver os argumentos e exemplos.",
      placement: "bottom",
    },
    {
      id: "errors",
      targetSelector: "#errors",
      title: "Códigos de erro",
      description:
        "A tabela lista cada código de erro, o status HTTP e quando acontece, para a integração tratar as falhas corretamente.",
      placement: "top",
    },
    {
      id: "rate-limits",
      targetSelector: "#rate-limits",
      title: "Rate limits",
      description:
        "Cada chave tem um limite de chamadas por minuto. Quando atingido, a resposta traz o tempo a aguardar antes de tentar de novo.",
      placement: "top",
    },
  ],
};
