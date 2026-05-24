import type { TourConfig } from "@/components/tour/tour-provider";

/**
 * Tour dos Webhooks. O assistente de criação é um modal: ele abre só no passo
 * do assistente (índice 1) e fica fechado nos passos do botão e da lista, para
 * o tour destacar a tela certa em cada passo.
 */
export const webhookTour: TourConfig = {
  id: "integracoes-webhooks-v1",
  title: "Tour dos Webhooks",
  steps: [
    {
      id: "novo",
      targetSelector: "[data-tour='webhooks-novo']",
      title: "Criar um webhook",
      description:
        "Comece por aqui. O botão Novo webhook abre o assistente de criação num modal. Vamos abri-lo agora.",
      placement: "bottom",
    },
    {
      id: "assistente",
      targetSelector: "[data-tour='webhook-wizard-modal']",
      title: "O assistente de criação",
      description:
        "Em três passos: escolha o tipo (Receber eventos faz a plataforma escutar um endereço; Enviar faz a plataforma disparar uma chamada externa), defina os métodos HTTP e o caminho ou a URL de destino, e conclua. Ao concluir, a plataforma gera um token de assinatura exibido uma única vez.",
      placement: "right",
    },
    {
      id: "lista",
      targetSelector: "[data-tour='webhooks-lista']",
      title: "Seus webhooks",
      description:
        "Cada webhook aparece aqui com o caminho e os métodos HTTP em tags. Use o interruptor para habilitar ou desabilitar, o lápis para editar (alterar métodos, caminho ou rotacionar o token) e a lixeira para remover.",
      placement: "top",
    },
  ],
};
