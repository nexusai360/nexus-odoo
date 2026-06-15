// Payload de lacuna de ambiguidade. Funcao PURA, sem efeito colateral: nao toca Prisma
// nem grava nada. Quem registra a lacuna e o agente (Fase 3), chamando registrar_lacuna.

/** Monta o resumo de uma ambiguidade para log. Trunca o termo a 80 caracteres (spec secao 8). */
export function formatarLacunaAmbiguidade(entidade: string, termo: string, qtd: number): string {
  const t = termo.length > 80 ? termo.slice(0, 80) : termo;
  return `ambiguidade:${entidade}:"${t}" (${qtd} candidatas)`;
}
