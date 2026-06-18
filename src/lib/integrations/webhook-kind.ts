/**
 * Dados puros do "tipo de webhook" (F5.1), compartilhados entre Server e Client
 * Components. Fica fora de qualquer módulo "use client" para que páginas de
 * servidor (ex.: tela de editar) possam usar rótulo/cor sem o erro de chamar
 * função de client a partir do servidor.
 */

/** Tipo de webhook escolhido (cada um com experiência própria). */
export type WebhookKind = "whatsapp" | "inbound_generic" | "outbound";

const LABELS: Record<WebhookKind, string> = {
  whatsapp: "Receber mensagens do WhatsApp",
  inbound_generic: "Receber eventos",
  outbound: "Enviar eventos",
};

/** Classes da tag/pílula do tipo (segue a cor do tipo: verde/azul/roxo). */
const BADGES: Record<WebhookKind, string> = {
  whatsapp: "bg-green-500/15 text-green-700 dark:text-green-400",
  inbound_generic: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  outbound: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
};

/** Rótulo curto do tipo (navegação/cabeçalho). */
export function webhookKindLabel(kind: WebhookKind): string {
  return LABELS[kind];
}

/** Classes da tag do tipo (cabeçalho/navegação). */
export function webhookKindBadgeClass(kind: WebhookKind): string {
  return BADGES[kind];
}

/** Subtítulo personalizado por tipo (cabeçalho da tela). */
export function webhookKindSubtitle(kind: WebhookKind | null): string {
  if (kind === "whatsapp") return "Configure um webhook para receber mensagens do WhatsApp.";
  if (kind === "inbound_generic") return "Configure um webhook para receber eventos de outros sistemas.";
  if (kind === "outbound") return "Configure um webhook para enviar eventos para outros sistemas.";
  return "Escolha o tipo de webhook que você quer criar.";
}
