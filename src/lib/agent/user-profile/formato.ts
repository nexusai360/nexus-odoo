/**
 * Detecta a preferencia de FORMATO de resposta (lista x tabela x texto) a partir de PEDIDOS
 * EXPLICITOS do usuario no fluxo de mensagens. Parametro do rastreador continuo (Etapa 1),
 * deterministico, sem LLM, sem dado pessoal. Stand-by por dominancia.
 *
 * Modulo PURO.
 */

export const MIN_FORMATO = 2;
export const MIN_FORMATO_SHARE = 0.6;

export type Formato = "lista" | "tabela" | "texto";

const PEDE: ReadonlyArray<readonly [Formato, readonly string[]]> = [
  ["tabela", ["em tabela", "tabela", "planilha", "em colunas", "formato de tabela"]],
  ["lista", ["em lista", "lista", "em topicos", "topicos", "bullet", "bullets", "em itens", "itemizado", "lista os"]],
  ["texto", ["texto corrido", "em texto", "escrito", "em paragrafo", "de forma narrativa", "redigido"]],
];

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Conta pedidos por formato e devolve o dominante, ou undefined (stand-by). */
export function detectarFormato(mensagensUsuario: string[]): Formato | undefined {
  const cont: Record<Formato, number> = { lista: 0, tabela: 0, texto: 0 };
  for (const msg of mensagensUsuario) {
    const n = normalizar(msg);
    for (const [fmt, termos] of PEDE) {
      for (const t of termos) {
        if (n.includes(t)) {
          cont[fmt]++;
          break; // 1 sinal por mensagem por formato
        }
      }
    }
  }
  const total = cont.lista + cont.tabela + cont.texto;
  if (total === 0) return undefined;
  let topFmt: Formato = "lista";
  let topN = -1;
  for (const fmt of ["lista", "tabela", "texto"] as const) {
    if (cont[fmt] > topN) {
      topN = cont[fmt];
      topFmt = fmt;
    }
  }
  if (topN >= MIN_FORMATO && topN / total >= MIN_FORMATO_SHARE) return topFmt;
  return undefined;
}
