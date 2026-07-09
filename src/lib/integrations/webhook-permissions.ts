/**
 * Quem pode fazer o quê com webhooks. Funções PURAS, sem prisma: valem tanto na
 * tela (esconder o card) quanto no servidor (recusar a ação).
 *
 * Regras (decisão do usuário, 2026-07-09):
 *  - "Receber mensagens do WhatsApp" é EXCLUSIVO do super_admin. Não é
 *    configurável por perfil, ao contrário dos menus: é uma trava fixa.
 *  - Os outros dois tipos ("Receber eventos" e "Enviar eventos") ficam
 *    disponíveis para quem enxerga o menu Integrações, cujo nível é configurado
 *    na tela de Configuração (`menu_access`).
 *
 * A tela esconde o que não pode; o servidor recusa de novo. Esconder sem recusar
 * é o que já nos mordeu duas vezes hoje (gate de menus e gate da bolha).
 */
import { menuEntry, podeVerMenu } from "@/lib/nav/menu-catalog";
import type { ChannelAccessLevel, PlatformRole } from "@/generated/prisma/client";
import type { WebhookKind } from "./webhook-kind";

/** Ordem canônica dos tipos no passo 1 do assistente. */
const TODOS: readonly WebhookKind[] = ["whatsapp", "inbound_generic", "outbound"];

/** O receptor de WhatsApp alimenta o Agente Nex: trava fixa em super_admin. */
export function podeGerenciarWhatsappWebhook(role: PlatformRole): boolean {
  return role === "super_admin";
}

/** Tipos de webhook que o perfil pode ver/criar no assistente. */
export function kindsVisiveis(role: PlatformRole): WebhookKind[] {
  return TODOS.filter((k) => k !== "whatsapp" || podeGerenciarWhatsappWebhook(role));
}

/**
 * Pode criar/editar/apagar um webhook?
 *
 * @param role        perfil do usuário
 * @param nivelMenu   nível configurado do menu Integrações (`menu_access`)
 * @param ehWhatsapp  a operação é sobre um receptor de WhatsApp?
 */
export function podeGerenciarWebhooks(
  role: PlatformRole,
  nivelMenu: ChannelAccessLevel,
  ehWhatsapp: boolean,
): boolean {
  if (ehWhatsapp) return podeGerenciarWhatsappWebhook(role);
  return podeVerMenu(menuEntry("integracoes")!, nivelMenu, role);
}
