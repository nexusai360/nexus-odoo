// src/lib/reports/builder/agent/geracao/build.ts
// FASE 3 do pipeline: build DETERMINISTICO (sem LLM). Ordena as secoes na narrativa
// e aplica o blueprint via o DISPATCHER de tools ja existente (criar_relatorio +
// adicionar_secao) , reusa a validacao real (id/filtros/compatibilidade). Secao que
// o dispatcher recusa vai para `omitidos` (nunca descarta em silencio).
import { despachar } from "../tool-bridge";
import type { BuilderReportEntry } from "../../types";
import type { Blueprint } from "./blueprint-types";
import { ordenarNarrativa } from "./ordenar-narrativa";

export function buildFicha(blueprint: Blueprint): { ficha: BuilderReportEntry; omitidos: string[] } {
  const criar = despachar(
    { id: "bp_criar", name: "criar_relatorio", arguments: { titulo: blueprint.titulo } },
    null,
  );
  if (criar.tipo !== "ficha") {
    throw new Error(`build_falhou_criar: ${criar.tipo === "erro" ? criar.erro : criar.tipo}`);
  }

  let ficha = criar.ficha;
  const omitidos: string[] = [];
  const ordenadas = ordenarNarrativa(blueprint.secoes);

  ordenadas.forEach((s, i) => {
    const r = despachar(
      {
        id: `bp_sec_${i}`,
        name: "adicionar_secao",
        arguments: { template: s.template, fato: s.fato, shapeDerivado: s.shapeDerivado, config: s.config },
      },
      ficha,
    );
    if (r.tipo === "ficha") ficha = r.ficha;
    else omitidos.push(`${s.template} sobre ${s.fato} (${r.tipo === "erro" ? r.erro : r.tipo})`);
  });

  return { ficha, omitidos };
}
