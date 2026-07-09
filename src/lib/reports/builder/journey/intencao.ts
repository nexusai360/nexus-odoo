// src/lib/reports/builder/journey/intencao.ts
// Intencao estruturada coletada no brainstorm: a lista LEVE de secoes que a pessoa
// quer (sem config completo, sem build pesado), cada uma validada por viabilidade
// real no catalogo (seccaoViavel). E a evidencia OBJETIVA que o gate usa , nao
// auto-relato do modelo. A ficha de verdade so nasce no pipeline do Gerar.
import { seccaoViavel } from "./viabilidade";
import type { ShapeDerivado } from "../types";
import type { ReportTemplate } from "@/lib/reports/types";

export interface SeccaoPretendida {
  fato: string;
  shapeDerivado?: ShapeDerivado;
  template: ReportTemplate;
  /** Recorte que a pessoa pediu (ex.: "por armazem", "por marca"). */
  recorte?: string;
  /** Nome curto que a pessoa usou para a secao. */
  rotulo?: string;
}

export interface IntencaoColeta {
  secoes: SeccaoPretendida[];
  /** A pessoa declarou que NAO quer KPIs (dispensa indicadores no gate). */
  semKpiDeclarado?: boolean;
}

export function intencaoInicial(): IntencaoColeta {
  return { secoes: [] };
}

export function registrarSeccaoPretendida(
  intencao: IntencaoColeta,
  seccao: SeccaoPretendida,
): { intencao: IntencaoColeta } | { erro: string } {
  if (!seccao.fato || !seccao.template) return { erro: "incompleta" };
  const v = seccaoViavel({
    fato: seccao.fato,
    shapeDerivado: seccao.shapeDerivado,
    template: seccao.template,
  });
  if (!v.ok) return { erro: v.motivo };
  return { intencao: { ...intencao, secoes: [...intencao.secoes, seccao] } };
}

export function removerSeccao(intencao: IntencaoColeta, idx: number): IntencaoColeta {
  return { ...intencao, secoes: intencao.secoes.filter((_, i) => i !== idx) };
}

export function declararSemKpi(intencao: IntencaoColeta): IntencaoColeta {
  return { ...intencao, semKpiDeclarado: true };
}
