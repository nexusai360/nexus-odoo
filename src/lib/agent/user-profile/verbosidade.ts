/**
 * Detecta a preferencia de DETALHE do usuario (curto x detalhado) a partir de PEDIDOS EXPLICITOS
 * dele no fluxo de mensagens. Parametro do rastreador continuo (Etapa 1) , deterministico, sem
 * LLM, sem dado pessoal. Stand-by por item: so "forma opiniao" com sinal suficiente e dominante;
 * senao retorna undefined (segue monitorando).
 *
 * Modulo PURO.
 */

/** Ocorrencias minimas de um lado para formar opiniao (volume baixo). */
export const MIN_VERBOSIDADE = 2;
/** Fracao minima do lado vencedor sobre o total de sinais (dominancia). */
export const MIN_VERBOSIDADE_SHARE = 0.6;

export type Verbosidade = "curto" | "detalhado";

const PEDE_DETALHE = [
  "detalhe", "detalhar", "detalhado", "detalhada", "mais detalhe", "mais detalhes",
  "abre isso", "abrir isso", "explica melhor", "explique melhor", "explica direito",
  "completo", "completa", "por extenso", "aprofunda", "aprofundar", "lista tudo",
  "mostra tudo", "quero tudo", "mais informacao", "mais informacoes",
];
const PEDE_CURTO = [
  "resume", "resumir", "resumido", "resumida", "resumo", "curto", "curta", "mais curto",
  "direto ao ponto", "seja objetivo", "objetivo", "so o total", "so o numero", "so o valor",
  "sem detalhe", "sem detalhes", "rapido", "breve", "em uma linha", "resumidamente",
];

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function contar(textoNorm: string, termos: string[]): number {
  let n = 0;
  for (const t of termos) {
    if (textoNorm.includes(t)) n++;
  }
  return n;
}

/**
 * Conta pedidos de detalhe x de concisao nas mensagens do usuario e devolve a preferencia
 * dominante, ou undefined se nao houver sinal suficiente/dominante (stand-by).
 */
export function detectarVerbosidade(mensagensUsuario: string[]): Verbosidade | undefined {
  let detalhe = 0;
  let curto = 0;
  for (const msg of mensagensUsuario) {
    const n = normalizar(msg);
    detalhe += contar(n, PEDE_DETALHE);
    curto += contar(n, PEDE_CURTO);
  }
  const total = detalhe + curto;
  if (total === 0) return undefined;
  if (detalhe >= MIN_VERBOSIDADE && detalhe / total >= MIN_VERBOSIDADE_SHARE) return "detalhado";
  if (curto >= MIN_VERBOSIDADE && curto / total >= MIN_VERBOSIDADE_SHARE) return "curto";
  return undefined;
}
