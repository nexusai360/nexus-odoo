// src/lib/reports/builder/agent/geracao/validar.ts
// FASE 4 do pipeline: validacao final DETERMINISTICA (sem LLM). Escopo HONESTO:
// cobre completude/visual ESTRUTURAIS (schema + compatibilidade de cada secao +
// ao menos 1 visualizacao). Narrativa/insight sao responsabilidade da fase de
// revisao (LLM), nao desta.
import { checarCompatibilidade } from "../../compat";
import type { BuilderReportEntry } from "../../types";

const VISUALIZACOES = new Set(["BarChart", "PieChart", "LineChart", "DataTable"]);

export function validarFichaGerada(ficha: BuilderReportEntry): {
  ficha: BuilderReportEntry;
  problemas: string[];
} {
  const problemas: string[] = [];

  if (ficha.secoes.length === 0) {
    problemas.push("o relatorio ficou sem nenhuma secao");
  }
  if (!ficha.secoes.some((s) => VISUALIZACOES.has(s.template))) {
    problemas.push("o relatorio nao tem nenhuma visualizacao (grafico ou tabela)");
  }
  for (const s of ficha.secoes) {
    const c = checarCompatibilidade(s);
    if (!c.ok) problemas.push(`secao ${s.id}: ${c.motivo}`);
  }

  return { ficha, problemas };
}
