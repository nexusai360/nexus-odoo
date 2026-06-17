// Funcao pura de sumarizacao da disponibilidade do Agente Nex por canal.
// Recebe os niveis minimos de acesso (com heranca) de cada canal e deriva
// tom, titulo e helper. Mantida separada da UI para nao puxar dependencias
// server-side nos testes.

import type { ChannelAccessLevel } from "@/generated/prisma/client";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";

/** Descreve o nivel de um canal: "todos" (viewer) ou "a partir de <role>". */
function levelPhrase(level: ChannelAccessLevel): string {
  if (level === "off") return "desativado";
  if (level === "viewer") return "todos os perfis";
  return `a partir de ${PLATFORM_ROLE_LABELS[level]}`;
}

export function summarizeAvailability(
  bubbleLevel: ChannelAccessLevel,
  whatsappLevel: ChannelAccessLevel,
): { title: string; helper: string; tone: "active" | "partial" | "off" } {
  const bubbleOn = bubbleLevel !== "off";
  const whatsappOn = whatsappLevel !== "off";

  if (bubbleOn && whatsappOn) {
    return {
      title: "Ativo no chat in-app e no WhatsApp",
      helper: `Bubble: ${levelPhrase(bubbleLevel)}. WhatsApp: ${levelPhrase(whatsappLevel)}.`,
      tone: "active",
    };
  }
  if (bubbleOn) {
    return {
      title: "Ativo apenas no chat in-app",
      helper: `Bubble: ${levelPhrase(bubbleLevel)}. O agente nao responde no WhatsApp.`,
      tone: "partial",
    };
  }
  if (whatsappOn) {
    return {
      title: "Ativo apenas no WhatsApp",
      helper: `WhatsApp: ${levelPhrase(whatsappLevel)}. A bubble esta oculta na plataforma.`,
      tone: "partial",
    };
  }
  return {
    title: "Desativado em todos os canais",
    helper:
      "Nenhum canal responde. Escolha um nivel para reativar o Agente Nex em um dos canais.",
    tone: "off",
  };
}
