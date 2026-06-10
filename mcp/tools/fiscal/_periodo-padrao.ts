// mcp/tools/fiscal/_periodo-padrao.ts
// Resolve o periodo das tools fiscais. Sem periodo informado, o cache acumula ANOS
// (2013..hoje) e o numero fica enganoso. Decisao do usuario (2026-06-09): assumir o
// ANO CORRENTE como default, e a resposta SEMPRE explicita o periodo coberto.

export interface PeriodoResolvido {
  periodoDe: string;
  periodoAte: string;
  /** true quando o periodo foi assumido (ano corrente), nao informado pelo usuario. */
  assumido: boolean;
  /** rotulo legivel para a resposta, ex.: "2026 (ano corrente, ate 2026-06-09)". */
  label: string;
}

/**
 * Usa `de`+`ate` quando o PAR esta completo; senao assume o ano corrente (1o de janeiro
 * ate hoje). `hoje` e injetavel para teste determinístico.
 */
export function resolverPeriodoFiscal(
  de: string | undefined,
  ate: string | undefined,
  hoje: Date = new Date(),
): PeriodoResolvido {
  if (de && ate) {
    return { periodoDe: de, periodoAte: ate, assumido: false, label: `${de} a ${ate}` };
  }
  const ano = hoje.getUTCFullYear();
  const hojeStr = hoje.toISOString().slice(0, 10);
  return {
    periodoDe: `${ano}-01-01`,
    periodoAte: hojeStr,
    assumido: true,
    label: `${ano} (ano corrente, ate ${hojeStr})`,
  };
}
