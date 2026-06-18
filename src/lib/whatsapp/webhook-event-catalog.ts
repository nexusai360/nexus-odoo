import { Bot, type LucideIcon } from "lucide-react";
import type { WebhookEventName } from "@/lib/actions/webhooks";

/**
 * Catálogo dos eventos que a NOSSA plataforma EMITE em webhooks de saída,
 * organizado em blocos (grupos) por domínio. NÃO são eventos do WhatsApp/Meta:
 * são os eventos da plataforma. Hoje só existe o bloco "Agente Nex" com a
 * resposta do agente; novos eventos (prompt, consumo, monitoramento) e novos
 * blocos (ex.: "Usuários") entram aqui sem mexer na UI.
 *
 * `value` é o valor do enum Prisma `WebhookEvent` (gravado no banco e usado no
 * filtro do emissor). `code` é o nome amigável exibido (ex.: "agent.reply").
 */
export interface WebhookEventDef {
  value: WebhookEventName;
  code: string;
  label: string;
  description: string;
}

export interface WebhookEventGroupAccent {
  icon: string;
  border: string;
  bg: string;
}

export interface WebhookEventGroup {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Cores do bloco quando ativo (>= 1 evento selecionado). */
  accent: WebhookEventGroupAccent;
  events: WebhookEventDef[];
}

export const WEBHOOK_EVENT_GROUPS: WebhookEventGroup[] = [
  {
    id: "agente-nex",
    label: "Agente Nex",
    description: "Eventos do Agente Nex enviados pela plataforma.",
    icon: Bot,
    accent: {
      icon: "text-violet-400",
      border: "border-violet-500/30",
      bg: "bg-violet-500/10",
    },
    events: [
      {
        value: "agent_reply",
        code: "agent.reply",
        label: "Resposta do agente",
        description: "Disparado quando o agente responde uma mensagem.",
      },
    ],
  },
];

/** Todos os valores de evento do catálogo (flat). */
export const ALL_WEBHOOK_EVENT_VALUES: WebhookEventName[] =
  WEBHOOK_EVENT_GROUPS.flatMap((g) => g.events.map((e) => e.value));

export const TOTAL_WEBHOOK_EVENTS = ALL_WEBHOOK_EVENT_VALUES.length;
