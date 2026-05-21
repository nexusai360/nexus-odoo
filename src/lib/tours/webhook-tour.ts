import type { TourConfig } from "@/components/tour/tour-provider";

/**
 * Tour dos Webhooks. O assistente de criação fica aberto enquanto o tour roda,
 * para os passos apontarem para ele.
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
        "Comece por aqui. O assistente de criação já está aberto abaixo para conhecermos os passos.",
      placement: "bottom",
    },
    {
      id: "tipo",
      targetSelector: "[data-tour='webhook-wizard-tipo']",
      title: "Receber ou enviar",
      description:
        "Primeiro escolha o tipo: Receber eventos faz a plataforma escutar um endereço; Enviar eventos faz a plataforma disparar uma chamada externa. Depois você define os métodos HTTP e o caminho ou a URL de destino; ao concluir, a plataforma gera um secret de assinatura exibido uma única vez.",
      placement: "top",
    },
    {
      id: "lista",
      targetSelector: "[data-tour='webhooks-lista']",
      title: "Seus webhooks",
      description:
        "Cada webhook criado aparece aqui com o tipo, o endereço e os métodos. Use o interruptor para habilitar ou desabilitar, rotacione o secret quando precisar, ou remova o webhook.",
      placement: "top",
    },
  ],
};
