// src/lib/reports/builder/journey/viabilidade.ts
// Viabilidade REAL de uma secao pretendida: a fonte existe E o template casa com o
// shape oferecido por ela. Reusa checarCompatibilidade (gate de renderizacao) em vez
// de so olhar obterContrato, para que a evidencia do brainstorm seja honesta , uma
// secao que passa aqui consegue, de fato, ser montada no Gerar.
import { checarCompatibilidade } from "../compat";
import { descreverComponente } from "../component-catalog";
import type { BuilderSection, ShapeDerivado } from "../types";
import type { ReportTemplate } from "@/lib/reports/types";

export type ViabilidadeResult = { ok: true } | { ok: false; motivo: string };

/**
 * Uma secao pretendida e viavel quando: o template existe, e o shape exigido por
 * ele (ou o `shapeDerivado` informado) e oferecido pela fonte do `fato`. O
 * `shapeDerivado` e derivado do template quando nao informado , o template ja
 * dita o shape que consome.
 */
export function seccaoViavel(args: {
  fato: string;
  shapeDerivado?: ShapeDerivado;
  template: ReportTemplate;
}): ViabilidadeResult {
  const componente = descreverComponente(args.template);
  if (!componente) return { ok: false, motivo: "template_desconhecido" };

  const shapeDerivado = args.shapeDerivado ?? componente.shapeDerivadoExigido;

  // Stub minimo: checarCompatibilidade so le template/shapeDerivado/fato.
  const stub = {
    id: "_viab",
    template: args.template,
    fato: args.fato,
    shapeDerivado,
    filtros: [],
  } as unknown as BuilderSection;

  return checarCompatibilidade(stub);
}
