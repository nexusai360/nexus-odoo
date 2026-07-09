// src/lib/reports/builder/compat.ts
// Checa que uma secao e renderizavel: o shape exigido pelo template casa com o
// shape declarado na secao E e oferecido pela fonte. Vai alem do schema Zod
// (que so valida forma): impede ficha valida-no-schema mas impossivel-no-dado.
import { descreverComponente } from "./component-catalog";
import { obterContrato } from "./source-registry";
import type { BuilderSection } from "./types";

export type CompatResult = { ok: true } | { ok: false; motivo: string };

export function checarCompatibilidade(secao: BuilderSection): CompatResult {
  const componente = descreverComponente(secao.template);
  if (!componente) {
    return { ok: false, motivo: "template_desconhecido" };
  }
  if (componente.shapeDerivadoExigido !== secao.shapeDerivado) {
    return { ok: false, motivo: "shape_incompativel_com_template" };
  }
  const contrato = obterContrato(secao.fato);
  if (!contrato) {
    return { ok: false, motivo: "fonte_desconhecida" };
  }
  if (!contrato.shapes.includes(secao.shapeDerivado)) {
    return { ok: false, motivo: "fonte_nao_oferece_shape" };
  }
  return { ok: true };
}
