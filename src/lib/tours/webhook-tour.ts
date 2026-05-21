import type { TourConfig } from "@/components/tour/tour-provider";

export const webhookTour: TourConfig = {
  id: "integracoes-webhooks-v1",
  title: "Tour dos Webhooks",
  steps: [
    {
      id: "novo",
      targetSelector: "[data-tour='webhooks-novo']",
      title: "Criar um webhook",
      description:
        "Comece por aqui para registrar um endpoint de entrada ou de saída. Cada webhook recebe um secret próprio, exibido uma única vez no momento da criação.",
      placement: "bottom",
    },
    {
      id: "lista",
      targetSelector: "[data-tour='webhooks-lista']",
      title: "Seus webhooks",
      description:
        "Cada cartão mostra a direção, a URL e a data de criação. Use o botão para habilitar ou desabilitar, rotacionar o secret quando precisar, ou remover o webhook.",
      placement: "top",
    },
  ],
};
