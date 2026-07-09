// src/lib/reports/builder/tools/prever-dado.ts
// Tool prever_dado: diz ao agente quais campos uma fonte entrega num dado
// shape, para ele montar a secao (colunas, rotulos) com base no contrato real.
import { obterContrato } from "../source-registry";
import { ehShapeDerivado, type CampoMeta } from "../types";

export function toolPreverDado(args: {
  fato: string;
  shapeDerivado: string;
}): { campos: CampoMeta[] } | { erro: string } {
  const contrato = obterContrato(args.fato);
  if (!contrato) return { erro: "fonte_desconhecida" };
  if (!ehShapeDerivado(args.shapeDerivado)) {
    return { erro: "shape_invalido" };
  }
  if (!contrato.shapes.includes(args.shapeDerivado)) {
    return { erro: "shape_nao_oferecido" };
  }
  return { campos: contrato.campos[args.shapeDerivado] ?? [] };
}
