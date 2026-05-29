import { BALDE_A_MIN, PREFIXOS_NEGOCIO, PREFIXOS_UI_INFRA, SUFIXOS_TECNICOS } from "./constants";
import type { Balde, Motivo, ModeloSchema, PrevisaoAtivacao } from "./types";

/** Prefixo técnico do modelo (texto antes do primeiro ponto). */
export function dominioDe(modelo: string): string {
  const i = modelo.indexOf(".");
  return i === -1 ? modelo : modelo.slice(0, i);
}

/**
 * Filtro offline: marca C-técnico sem RPC, ou retorna null para o modelo
 * seguir para a contagem. Precedência: transient > sufixo > prefixo UI/infra.
 */
export function classificarOffline(
  m: ModeloSchema,
): { balde: "C"; motivo: Motivo } | null {
  if (m.transient) return { balde: "C", motivo: "transient" };
  if (SUFIXOS_TECNICOS.some((s) => m.modelo.endsWith(s)))
    return { balde: "C", motivo: "sufixo_tecnico" };
  if (PREFIXOS_UI_INFRA.has(dominioDe(m.modelo)))
    return { balde: "C", motivo: "prefixo_ui_infra" };
  return null;
}

/** Classifica um modelo que passou o filtro offline, dado o count medido. */
export function classificarComCount(
  m: ModeloSchema,
  count: number,
): { balde: Balde; motivo: Motivo } {
  if (count >= BALDE_A_MIN) return { balde: "A", motivo: "volume_acima_threshold" };
  if (PREFIXOS_NEGOCIO.has(dominioDe(m.modelo)))
    return { balde: "B", motivo: "baixo_volume_dominio_negocio" };
  return { balde: "C", motivo: "baixo_volume_nao_negocio" };
}

/**
 * Sinal de ativação de um modelo do Balde B.
 * @param count count do próprio modelo (0..50)
 * @param countsDoPrefixo counts dos modelos do mesmo prefixo (pode incluir o próprio)
 */
export function previsaoAtivacao(
  count: number,
  countsDoPrefixo: number[],
): PrevisaoAtivacao {
  if (count > 0) return "em_uso";
  if (countsDoPrefixo.some((c) => c > 0)) return "instalado_sem_uso";
  return "sem_sinal";
}
