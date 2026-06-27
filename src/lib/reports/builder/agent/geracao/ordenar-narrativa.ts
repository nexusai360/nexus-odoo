// src/lib/reports/builder/agent/geracao/ordenar-narrativa.ts
// Ordena as secoes numa narrativa de relatorio: panorama (KPIs) -> comparacao
// (graficos) -> detalhe (tabela). Pura e estavel (preserva a ordem dentro de cada
// papel). Substitui a "fase plano" LLM (era ceremonia , ordenar lista curta e
// deterministico).
import type { BlueprintSecao } from "./blueprint-types";

/** Papel narrativo de cada template (menor = mais para o topo). */
function papel(template: BlueprintSecao["template"]): number {
  switch (template) {
    case "KPIRow":
      return 0; // panorama
    case "BarChart":
    case "PieChart":
    case "LineChart":
      return 1; // comparacao
    case "DataTable":
      return 2; // detalhe
    default:
      return 1;
  }
}

export function ordenarNarrativa(secoes: BlueprintSecao[]): BlueprintSecao[] {
  return secoes
    .map((s, i) => ({ s, i }))
    .sort((a, b) => papel(a.s.template) - papel(b.s.template) || a.i - b.i)
    .map((x) => x.s);
}
