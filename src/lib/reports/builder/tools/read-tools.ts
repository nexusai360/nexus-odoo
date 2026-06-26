// src/lib/reports/builder/tools/read-tools.ts
// Tools de LEITURA do construtor: deixam o agente descobrir o que existe
// (componentes e fontes) antes de montar a ficha. Puras sobre os catalogos.
import {
  listarComponentes,
  descreverComponente,
  type ComponentEntry,
} from "../component-catalog";
import { listarFontes } from "../source-registry";

/** Resumo de componente para o agente escolher. */
export interface ComponenteResumo {
  chave: ComponentEntry["chave"];
  nome: string;
  paraQueServe: string;
  quandoUsar: string;
  quandoNaoUsar: string;
  shapeDerivadoExigido: ComponentEntry["shapeDerivadoExigido"];
}

export function toolListarComponentes(): ComponenteResumo[] {
  return listarComponentes().map((c) => ({
    chave: c.chave,
    nome: c.nome,
    paraQueServe: c.paraQueServe,
    quandoUsar: c.quandoUsar,
    quandoNaoUsar: c.quandoNaoUsar,
    shapeDerivadoExigido: c.shapeDerivadoExigido,
  }));
}

export function toolDescreverComponente(args: {
  chave: string;
}): ComponentEntry | { erro: string } {
  const c = descreverComponente(args.chave);
  return c ?? { erro: "componente_desconhecido" };
}

/** Resumo de fonte para o agente (sem o detalhe de campos). */
export interface FonteResumo {
  fato: string;
  dominio: string;
  shapes: string[];
}

export function toolListarFontes(): FonteResumo[] {
  return listarFontes().map((f) => ({
    fato: f.fato,
    dominio: f.dominio,
    shapes: [...f.shapes],
  }));
}
