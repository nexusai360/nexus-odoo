// mcp/lib/cobertura.ts
// F4 Apresentacao, Onda 3.3 , aviso honesto de COBERTURA de dado.
//
// Varias metricas derivadas (margem, ROI, ticket medio) dependem de um campo
// que pode estar NULO em parte das linhas (ex.: precoCusto ausente em N
// produtos). Reportar a metrica sem dizer "calculei sobre X de Y" induz o
// usuario a achar que o numero cobre o conjunto inteiro. Este helper gera o
// texto de cobertura, exposto no envelope como `_AVISO_INCOMPLETO`.
//
// Modulo puro. Sem dependencia de DB ou env.

export interface CoberturaInput {
  /** Quantos itens TINHAM o campo preenchido (entraram no calculo). */
  consideradosComDado: number;
  /** Total de itens no recorte (com e sem o campo). */
  totalConsiderado: number;
  /** Nome humano do campo que faltou (ex.: "preco de custo"). */
  campo: string;
  /** Rotulo da metrica afetada (ex.: "Margem", "ROI"). */
  rotulo: string;
}

/**
 * Retorna o aviso de cobertura, ou `""` quando a cobertura e total (ou nao ha
 * itens). Nunca inventa: so reporta a fracao real `consideradosComDado/total`.
 *
 * Exemplos:
 *   cobertura({consideradosComDado: 42, totalConsiderado: 100, campo: "preco de custo", rotulo: "Margem"})
 *     -> "Margem calculada sobre 42 de 100 (58 sem preco de custo)."
 *   cobertura({consideradosComDado: 100, totalConsiderado: 100, ...}) -> ""
 */
export function cobertura(input: CoberturaInput): string {
  const { consideradosComDado, totalConsiderado, campo, rotulo } = input;
  if (totalConsiderado <= 0) return "";
  const comDado = Math.max(0, Math.min(consideradosComDado, totalConsiderado));
  const semDado = totalConsiderado - comDado;
  if (semDado <= 0) return "";
  return `${rotulo} calculada sobre ${comDado} de ${totalConsiderado} (${semDado} sem ${campo}).`;
}

/** Percentual de cobertura (0..100, arredondado), util para _DESTAQUE/testes. */
export function coberturaPct(consideradosComDado: number, totalConsiderado: number): number {
  if (totalConsiderado <= 0) return 0;
  const comDado = Math.max(0, Math.min(consideradosComDado, totalConsiderado));
  return Math.round((comDado / totalConsiderado) * 100);
}
