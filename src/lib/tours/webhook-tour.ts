import type { TourConfig } from "@/components/tour/tour-provider";

/**
 * Tour dos Webhooks. Ensina a criar um webhook campo a campo: o formulário de
 * criação fica aberto enquanto o tour roda, para os passos apontarem para
 * cada campo.
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
        "Comece por aqui para registrar um endpoint de entrada ou de saída. O formulário de criação já está aberto abaixo para percorrermos cada campo.",
      placement: "bottom",
    },
    {
      id: "direcao",
      targetSelector: "[data-tour='webhooks-form-direcao']",
      title: "Direção",
      description:
        "Entrada recebe eventos de sistemas externos na plataforma. Saída envia eventos da plataforma para um sistema externo. Escolha conforme o fluxo que você precisa.",
      placement: "bottom",
    },
    {
      id: "url",
      targetSelector: "[data-tour='webhooks-form-url']",
      title: "URL de destino",
      description:
        "Para um webhook de saída, informe o endereço que vai receber os eventos. Para um webhook de entrada a URL é opcional, a plataforma gera o caminho de recepção.",
      placement: "bottom",
    },
    {
      id: "criar",
      targetSelector: "[data-tour='webhooks-form-criar']",
      title: "Confirmar a criação",
      description:
        "Ao criar, a plataforma gera um secret de assinatura exibido uma única vez. Copie na hora: ele não aparece de novo, depois só é possível rotacioná-lo.",
      placement: "top",
    },
    {
      id: "lista",
      targetSelector: "[data-tour='webhooks-lista']",
      title: "Seus webhooks",
      description:
        "Cada cartão mostra a direção, a URL e a data de criação. Use o interruptor para habilitar ou desabilitar, rotacione o secret quando precisar, ou remova o webhook.",
      placement: "top",
    },
  ],
};
