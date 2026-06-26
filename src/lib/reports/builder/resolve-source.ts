// src/lib/reports/builder/resolve-source.ts
// Resolve uma secao da ficha: roda o produtor da fonte e aplica o adaptador do
// shape derivado. O guard de dominio no consumo entra na Task C1.
import { obterProdutor, obterContrato } from "./source-registry";
import { guardDominio } from "@/lib/reports/guard";
import {
  adaptarTabela,
  adaptarKpis,
  adaptarAgregacaoCategorica,
} from "./shape-adapters";
import type { BuilderSection, RawSourceData } from "./types";
import type { FiltrosFonte } from "./source-registry";

export interface SecaoResolvida {
  dado?: unknown;
  estado: "ok" | "vazio" | "erro";
  freshness?: Date | null;
  erro?: string;
}

function aplicarAdaptador(secao: BuilderSection, raw: RawSourceData): unknown {
  switch (secao.shapeDerivado) {
    case "tabela":
      return adaptarTabela(raw);
    case "kpis":
      return adaptarKpis(raw);
    case "agregacaoCategorica":
      return adaptarAgregacaoCategorica(raw);
    default:
      return raw.linhas;
  }
}

/** Resolve o dado de uma secao para render. */
export async function resolveSecao(
  secao: BuilderSection,
  filtros: FiltrosFonte,
): Promise<SecaoResolvida> {
  const contrato = obterContrato(secao.fato);
  if (!contrato) {
    return { estado: "erro", erro: "fonte_indisponivel" };
  }
  // Guard de dominio reavaliado no consumo (le a sessao internamente).
  try {
    await guardDominio(contrato.dominio);
  } catch {
    return { estado: "erro", erro: "sem_acesso_dominio" };
  }
  const produtor = obterProdutor(secao.fato, secao.shapeDerivado);
  if (!produtor) {
    return { estado: "erro", erro: "fonte_indisponivel" };
  }
  const raw = await produtor(filtros);
  const dado = aplicarAdaptador(secao, raw);
  const estado: SecaoResolvida["estado"] = raw.linhas.length === 0 ? "vazio" : "ok";
  return { dado, estado, freshness: raw.freshness };
}
