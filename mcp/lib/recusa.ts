// mcp/lib/recusa.ts
// Contrato de recusa educada para perguntas fora do escopo de negócio (Caminho 3b).
// Centraliza o texto para garantir consistência em todas as tools e no servidor.

/**
 * Mensagem-padrão de recusa 3b.
 * Usada quando o usuário faz uma pergunta que está completamente fora do
 * escopo de negócio do sistema (ex.: culinária, clima, política).
 */
export const MENSAGEM_RECUSA_3B =
  "Sou especializado na operação da Matrix Fitness Group — estoque, " +
  "financeiro, fiscal e comercial. Sua pergunta está fora desse escopo " +
  "de negócio e não consigo respondê-la. Se quiser informações sobre a " +
  "operação da empresa, estou à disposição.";

/**
 * Formata a recusa 3b, opcionalmente interpolando o assunto da pergunta.
 *
 * @param assunto - Resumo do tema fora do escopo (opcional).
 *   Quando fornecido, a mensagem menciona o assunto para ser mais precisa.
 * @returns Texto de recusa educada pronto para ser devolvido ao agente.
 */
export function montarRecusa(assunto?: string): string {
  if (!assunto) return MENSAGEM_RECUSA_3B;

  return (
    `A pergunta sobre "${assunto}" está fora do escopo de negócio do sistema. ` +
    "Sou especializado na operação da Matrix Fitness Group — estoque, " +
    "financeiro, fiscal e comercial. Se quiser informações sobre a " +
    "operação da empresa, estou à disposição."
  );
}
