// src/lib/reports/builder/journey/intencao-curada.ts
// Intencao CURADA: o que o compositor consome no Gerar. Em vez da pilha de secoes
// (modelo antigo, que virava Frankenstein), guarda o essencial: dominio + objetivo +
// recortes pedidos + janela temporal. O compositor decide os blocos a partir disso e
// do catalogo de metricas, nao copia secoes 1:1.
import type { IntencaoColeta } from "./intencao";

export interface IntencaoCurada {
  /** Onda 1: sempre "estoque" (detector de dominio entra em onda futura). */
  dominio: string;
  /** O entendimento do que a pessoa quer (vira base do prompt do compositor). */
  objetivo: string;
  /** Recortes que a pessoa pediu (ex.: "por armazem", "por marca"); sem duplicata. */
  recortes: string[];
  /** Janela temporal (mes "YYYY-MM"); so faz sentido em metricas temporais. */
  janela?: { de?: string; ate?: string };
}

/** Adapta a coleta leve (modelo da entrevista) para a intencao curada do Gerar. */
export function intencaoCuradaDeColeta(
  coleta: IntencaoColeta,
  entendimento: string,
): IntencaoCurada {
  const recortes = Array.from(
    new Set(
      coleta.secoes
        .map((s) => s.recorte?.trim())
        .filter((r): r is string => !!r),
    ),
  );
  return {
    dominio: "estoque",
    objetivo: entendimento,
    recortes,
  };
}
