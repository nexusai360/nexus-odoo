/**
 * Helper que enriquece o resultado de `withFreshness` com o envelope canonico
 * do agente Nex (Onda 1.B/C).
 *
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §4.2/§4.5
 *
 * Adiciona ao envelope:
 *   - `_RESPOSTA: string`         (texto pronto gerado pelo formatador canonico)
 *   - `_listaTruncada: boolean`   (true se a lista veio cortada por limite)
 *   - `_DESTAQUE?: Record<...>`   (totais/destaques estruturados)
 *   - `topPorParticipante?: ...`  (apenas para tools financeiras de saldo)
 *
 * Mantem compatibilidade retroativa: tools antigas que nao chamarem o helper
 * continuam funcionando.
 */

import {
  formatadorPorTool,
  type FormatadorCanonico,
  type LinhaFinanceira,
} from "./responder.js";
import { topPorParticipante, type TopParticipante } from "./agrupador.js";
import type { FreshnessEnvelope } from "./freshness.js";

export interface EnvelopeExtras {
  _RESPOSTA: string;
  _listaTruncada: boolean;
  _DESTAQUE?: Record<string, string | number>;
  topPorParticipante?: TopParticipante[];
  _agregado?: { soma?: number; contagem?: number; media?: number };
}

export interface EnriquecerOptions {
  /** Destaques/totais estruturados ja calculados pela tool. */
  destaque?: Record<string, string | number>;
  /** Lista de titulos para agregar por participante (top 10). */
  titulos?: LinhaFinanceira[];
  /** Flag explicita de truncamento (default false). */
  listaTruncada?: boolean;
  /** Agregados pre-computados (soma/contagem/media). */
  agregado?: { soma?: number; contagem?: number; media?: number };
}

/**
 * Aplica formatador canonico e calcula topPorParticipante quando aplicavel.
 * Retorna apenas os campos extras; quem chamar deve mergir no `dados`.
 */
export function calcularExtras(
  toolName: string,
  options: EnriquecerOptions = {},
): EnvelopeExtras {
  const destaque = options.destaque;
  const titulos = options.titulos ?? [];
  const listaTruncada = options.listaTruncada ?? false;

  const top = titulos.length > 0 ? topPorParticipante(titulos, 10) : undefined;

  const fmt: FormatadorCanonico = formatadorPorTool(toolName);
  // O formatador espera um envelope-like. Montamos um stub com os campos
  // canonicos necessarios.
  const stubEnvelope = {
    _listaTruncada: listaTruncada,
    linhas: titulos,
    atualizadoEm: "",
    atualizadoHa: "",
    ...(destaque ? { _DESTAQUE: destaque } : {}),
    ...(top ? { topPorParticipante: top } : {}),
    ...(options.agregado ? { _agregado: options.agregado } : {}),
  };
  const _RESPOSTA = fmt(stubEnvelope);

  return {
    _RESPOSTA,
    _listaTruncada: listaTruncada,
    ...(destaque ? { _DESTAQUE: destaque } : {}),
    ...(top ? { topPorParticipante: top } : {}),
    ...(options.agregado ? { _agregado: options.agregado } : {}),
  };
}

/**
 * Enriquece um `FreshnessEnvelope` ja resolvido (estado=ok/vazio) com os
 * campos canonicos do envelope do Agente Nex. Estado=preparando passa
 * sem alteracao.
 */
export function enriquecerEnvelope<TDados extends Record<string, unknown>>(
  envelope: FreshnessEnvelope<TDados>,
  toolName: string,
  options: EnriquecerOptions = {},
): FreshnessEnvelope<TDados & EnvelopeExtras> {
  if (envelope.estado === "preparando") {
    return envelope as FreshnessEnvelope<TDados & EnvelopeExtras>;
  }
  const extras = calcularExtras(toolName, options);
  return {
    ...envelope,
    dados: {
      ...envelope.dados,
      ...extras,
    },
  };
}
