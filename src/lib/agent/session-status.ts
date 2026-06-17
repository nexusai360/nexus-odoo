/**
 * Status de atividade de uma sessão do Agente Nex por canal (F5 E).
 *
 * - in_app (bubble): ativa enquanto não encerrada (`endedAt === null`).
 * - whatsapp: ativa só dentro da janela de 24h (a sessão WhatsApp expira lazy
 *   pela janela da Meta); encerrada explícita também desativa.
 */

const WHATSAPP_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isSessionActive(s: {
  channel: string;
  endedAt: Date | null;
  updatedAt: Date;
}): boolean {
  if (s.endedAt !== null) return false;
  if (s.channel === "whatsapp") {
    return +s.updatedAt >= Date.now() - WHATSAPP_ACTIVE_WINDOW_MS;
  }
  return true; // in_app e demais: ativa enquanto não encerrada
}
