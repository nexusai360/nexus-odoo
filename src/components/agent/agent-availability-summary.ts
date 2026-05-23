// Funcao pura de sumarizacao dos 4 estados de disponibilidade do Agente Nex.
// Mantida em arquivo separado da UI para nao puxar dependencias server-side
// nos testes.

export function summarizeAvailability(
  bubble: boolean,
  whatsapp: boolean,
): { title: string; helper: string; tone: "active" | "partial" | "off" } {
  if (bubble && whatsapp) {
    return {
      title: "Ativo no chat in-app e no WhatsApp",
      helper:
        "A bubble aparece nas paginas autenticadas e o agente responde via WhatsApp.",
      tone: "active",
    };
  }
  if (bubble) {
    return {
      title: "Ativo apenas no chat in-app",
      helper:
        "A bubble aparece nas paginas autenticadas. O agente nao responde no WhatsApp.",
      tone: "partial",
    };
  }
  if (whatsapp) {
    return {
      title: "Ativo apenas no WhatsApp",
      helper:
        "A bubble esta oculta na plataforma. O agente responde no WhatsApp quando o webhook estiver no ar.",
      tone: "partial",
    };
  }
  return {
    title: "Desativado em todos os canais",
    helper:
      "Nenhum canal responde. Ligue um dos toggles para reativar o Agente Nex.",
    tone: "off",
  };
}
