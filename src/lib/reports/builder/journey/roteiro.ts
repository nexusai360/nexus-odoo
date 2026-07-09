// src/lib/reports/builder/journey/roteiro.ts
// Roteiro de perguntas DERIVADO das dimensoes reais (nao um inteiro inventado pelo
// modelo). total = dimensoes relevantes; respondidas = dimensoes cobertas por
// EVIDENCIA. Limite natural: 7 dimensoes (sem loop infinito). "gera logo" nao cobre
// nenhuma dimensao nova, entao nao avanca o indicador.
import type { Dimensao } from "./state";
import type { IntencaoColeta } from "./intencao";

/** Subconjunto do JourneyState que o roteiro precisa (desacopla da ordem das tasks). */
export interface RoteiroInput {
  intencao?: IntencaoColeta;
  dimensoesRelevantes?: Dimensao[];
  dimensoesTocadas?: Partial<Record<Dimensao, boolean>>;
  entendimento?: string;
  turnosUsuario?: number;
}

export interface RoteiroPerguntas {
  total: number;
  respondidas: number;
  etapas: Dimensao[];
}

/** Dimensoes-nucleo (sempre relevantes). Opcionais entram quando a IA as marca. */
export const NUCLEO: Dimensao[] = ["objetivo", "dados", "visualizacao", "indicadores"];

const CHARTS = new Set(["BarChart", "PieChart", "LineChart", "DataTable"]);

/** Uma dimensao esta COBERTA quando ha evidencia objetiva dela. */
export function dimensaoCoberta(s: RoteiroInput, d: Dimensao): boolean {
  const secoes = s.intencao?.secoes ?? [];
  switch (d) {
    case "objetivo":
      return (s.entendimento?.trim().length ?? 0) >= 20 && (s.turnosUsuario ?? 0) >= 2;
    case "dados":
      return secoes.length > 0; // toda secao registrada ja passou por seccaoViavel
    case "visualizacao":
      return secoes.some((x) => CHARTS.has(x.template));
    case "indicadores":
      return secoes.some((x) => x.template === "KPIRow") || s.intencao?.semKpiDeclarado === true;
    default:
      // opcionais (filtros/layout/periodo): cobertas quando a IA marcou o toque.
      return s.dimensoesTocadas?.[d] === true;
  }
}

export function roteiroDerivado(s: RoteiroInput): RoteiroPerguntas {
  const rel = (s.dimensoesRelevantes ?? NUCLEO).slice(0, 7);
  const respondidas = rel.filter((d) => dimensaoCoberta(s, d)).length;
  return { total: rel.length, respondidas, etapas: rel };
}
