import type { TourConfig } from "@/components/tour/tour-provider";

export const canaisTour: TourConfig = {
  id: "integracoes-canais-v1",
  title: "Tour dos Canais",
  steps: [
    {
      id: "canais",
      targetSelector: "[data-tour='canais-cards']",
      title: "Canais disponíveis",
      description:
        "Cada cartão é um canal de comunicação da plataforma. Clique para abrir a configuração daquele canal.",
      placement: "bottom",
    },
    {
      id: "instancias",
      targetSelector: "[data-tour='canais-instancias']",
      title: "Instâncias de WhatsApp",
      description:
        "Aqui ficam as instâncias de WhatsApp conectadas. Cada instância liga um número a um fluxo de atendimento.",
      placement: "top",
    },
  ],
};
