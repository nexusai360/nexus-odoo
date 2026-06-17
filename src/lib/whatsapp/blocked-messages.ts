/** Códigos de bloqueio das barreiras de validação (L1/L2/L3 + falha técnica). */
export type BlockReason =
  | "user_not_found"
  | "user_inactive"
  | "channel_disabled"
  | "role_not_allowed"
  | "permission_denied"
  | "technical_error";

/** Catálogo versionado de mensagens padrão por código de bloqueio (pt-br). */
const MESSAGES: Record<BlockReason, string> = {
  user_not_found:
    "Não encontrei seu número na plataforma. Peça ao administrador para cadastrar o seu WhatsApp.",
  user_inactive:
    "Sua conta está desativada no momento. Fale com o administrador para reativar o acesso.",
  channel_disabled:
    "O Agente Nex está desativado para o WhatsApp neste momento.",
  role_not_allowed:
    "Seu perfil ainda não tem acesso ao Agente Nex pelo WhatsApp. Fale com o administrador.",
  permission_denied:
    "Sua pergunta toca em um módulo que o seu acesso na plataforma não cobre hoje.",
  technical_error:
    "Não consegui processar sua mensagem agora. Tente novamente em instantes.",
};

/** Texto fixo da mensagem padrão para um código de bloqueio. */
export function blockedMessageFor(reason: BlockReason): string {
  return MESSAGES[reason];
}
