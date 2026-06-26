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
import type { BuilderSection, CampoMeta, RawSourceData } from "./types";
import type { FiltrosFonte } from "./source-registry";

export interface SecaoResolvida {
  dado?: unknown;
  estado: "ok" | "vazio" | "erro";
  freshness?: Date | null;
  erro?: string;
  /** Metadados dos campos do shape (rotulos + tipo de formatacao) para o render. */
  campos?: CampoMeta[];
}

function aplicarAdaptador(
  secao: BuilderSection,
  raw: RawSourceData,
  campos?: CampoMeta[],
): unknown {
  switch (secao.shapeDerivado) {
    case "tabela":
      return adaptarTabela(raw, campos);
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
  const campos = contrato.campos?.[secao.shapeDerivado];
  const dado = aplicarAdaptador(secao, raw, campos);
  // KPIs nao tem "linhas" (sao escalares na fonte): considera vazio so quando
  // nao ha nenhum kpi. Demais shapes usam o numero de linhas.
  const vazio =
    secao.shapeDerivado === "kpis"
      ? Object.keys(raw.kpis ?? {}).length === 0
      : raw.linhas.length === 0;
  const estado: SecaoResolvida["estado"] = vazio ? "vazio" : "ok";
  return { dado, estado, freshness: raw.freshness, campos };
}
