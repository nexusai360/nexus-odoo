import type { TourConfig } from "@/components/tour/tour-provider";

/**
 * Tour da tela Plugar MCPs. O formulário de cadastro fica aberto enquanto o
 * tour roda, para os passos poderem apontar para os campos.
 */
export const plugarMcpsTour: TourConfig = {
  id: "agente-plugar-mcps-v1",
  title: "Tour do Plugar MCPs",
  steps: [
    {
      id: "novo",
      targetSelector: "[data-tour='plugar-mcps-novo']",
      title: "Conecte um MCP externo",
      description:
        "Comece por aqui para registrar um servidor MCP de terceiros (Slack, GitHub, Notion). O formulário abaixo já está aberto para acompanharmos juntos.",
      placement: "bottom",
    },
    {
      id: "form",
      targetSelector: "[data-tour='plugar-mcps-form']",
      title: "O que preencher",
      description:
        "Dê um nome ao servidor, escolha o transporte (Streamable HTTP é o padrão) e informe a URL do endpoint MCP. Se o serviço exigir autenticação, preencha o header e o token; ambos ficam cifrados.",
      placement: "top",
    },
    {
      id: "lista",
      targetSelector: "[data-tour='plugar-mcps-lista']",
      title: "Servidores conectados",
      description:
        "Cada servidor cadastrado aparece aqui. Use Testar conexão para conferir se está alcançável, e o interruptor para habilitar ou desabilitar sem remover.",
      placement: "top",
    },
  ],
};
