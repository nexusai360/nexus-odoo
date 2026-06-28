// src/lib/reports/builder/agent/geracao/curar-blueprint.ts
// Curadoria DETERMINISTICA do blueprint , a rede de seguranca contra a "salada":
// - NO MAXIMO UMA KPIRow (era o que duplicava "Valor Total" varias vezes);
// - dedup de secoes equivalentes (mesmo template+fato+shape+recorte);
// - teto de secoes (relatorio enxuto, nao um amontoado);
// - ordem narrativa (panorama -> comparacao -> detalhe).
// O modelo ainda faz a curadoria "inteligente" no prompt; isto garante o piso.
import type { Blueprint, BlueprintSecao } from "./blueprint-types";
import { ordenarNarrativa } from "./ordenar-narrativa";

const MAX_SECOES = 6;

function assinatura(s: BlueprintSecao): string {
  const recorte =
    (typeof s.config?.recorte === "string" && s.config.recorte) ||
    (typeof s.config?.groupBy === "string" && s.config.groupBy) ||
    (typeof s.config?.dimensao === "string" && s.config.dimensao) ||
    "";
  return `${s.template}|${s.fato}|${s.shapeDerivado}|${recorte}`;
}

export function curarBlueprint(bp: Blueprint, opts?: { maxSecoes?: number }): Blueprint {
  const max = opts?.maxSecoes ?? MAX_SECOES;
  const vistos = new Set<string>();
  const curadas: BlueprintSecao[] = [];
  let temKpi = false;

  for (const s of bp.secoes) {
    if (s.template === "KPIRow") {
      if (temKpi) continue; // so UMA faixa de indicadores no relatorio inteiro
      temKpi = true;
      curadas.push(s);
      continue;
    }
    const chave = assinatura(s);
    if (vistos.has(chave)) continue; // descarta secao equivalente repetida
    vistos.add(chave);
    curadas.push(s);
  }

  const ordenadas = ordenarNarrativa(curadas).slice(0, max);
  return { ...bp, secoes: ordenadas };
}
