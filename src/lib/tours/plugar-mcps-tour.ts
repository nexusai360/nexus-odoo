import type { TourConfig } from "@/components/tour/tour-provider";

/**
 * Tour da tela Plugar MCPs. O assistente de conexão abre em modal enquanto o
 * tour roda.
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
        "Use Conectar MCP para abrir o assistente. Ele tem quatro passos: Identificação, Conexão, Autenticação e Revisão. No passo de Revisão é obrigatório testar a conexão; só depois de um teste com sucesso o botão Conectar libera.",
      placement: "bottom",
    },
    {
      id: "lista",
      targetSelector: "[data-tour='plugar-mcps-lista']",
      title: "Servidores conectados",
      description:
        "Cada servidor cadastrado aparece aqui com o status (Conectado, Sem conexão ou Desativado). Use o interruptor para ativar ou desativar, o lápis para editar e a lixeira para remover.",
      placement: "top",
    },
  ],
};
