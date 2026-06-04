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
import type { PaginacaoMeta } from "./paginacao.js";

export interface EnvelopeExtras {
  _RESPOSTA: string;
  _listaTruncada: boolean;
  _DESTAQUE?: Record<string, string | number>;
  topPorParticipante?: TopParticipante[];
  _agregado?: { soma?: number; contagem?: number; media?: number };
  /** T-22: texto pronto sobre truncamento quando linhas exibidas < total. */
  _AVISO_TRUNCAMENTO?: string;
  /** Alavanca 2b: metadados de paginacao (total, mostrando, temMais, proximoOffset). */
  _PAGINACAO?: PaginacaoMeta;
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
  /** Alavanca 2b: paginacao. Quando presente, deriva _listaTruncada=temMais e
   *  gera _AVISO_TRUNCAMENTO orientando o usuario a pedir os proximos. */
  paginacao?: PaginacaoMeta;
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
  // Alavanca 2b: paginacao tem precedencia na decisao de truncamento.
  const listaTruncada =
    (options.listaTruncada ?? false) || (options.paginacao?.temMais ?? false);

  const top = titulos.length > 0 ? topPorParticipante(titulos, 10) : undefined;

  // T-22 (2026-05-27): aviso automatico de truncamento. Quando o servidor
  // sabe que ha mais linhas que o limite exibido (`_listaTruncada=true`)
  // ou quando `_DESTAQUE.contagem > linhas.length`, gera texto pronto
  // pro LLM injetar ("Encontrei N. Listando K."). Reduz dependencia do
  // LLM lembrar da regra 12c do prompt.
  const totalConhecido = Number(destaque?.contagem ?? destaque?.totalProdutos ?? destaque?.totalPedidos ?? 0);
  const linhasExibidas = titulos.length;
  const truncadoAuto = listaTruncada || (totalConhecido > 0 && linhasExibidas > 0 && totalConhecido > linhasExibidas);
  // Alavanca 2b: quando ha paginacao com mais paginas, o aviso usa os metadados
  // de paginacao e orienta a pedir os proximos. Senao, mantem o aviso T-22.
  const avisoTruncamento = options.paginacao?.temMais
    ? `Mostrando ${options.paginacao.mostrando}. Peca "os proximos" para ver mais.`
    : truncadoAuto && totalConhecido > linhasExibidas
      ? `Encontrei ${totalConhecido}, listando ${linhasExibidas}. Se quiser ver mais, é só pedir.`
      : undefined;

  const fmt: FormatadorCanonico = formatadorPorTool(toolName);
  // O formatador espera um envelope-like. Montamos um stub com os campos
  // canonicos necessarios.
  const stubEnvelope = {
    _listaTruncada: truncadoAuto,
    linhas: titulos,
    atualizadoEm: "",
    atualizadoHa: "",
    ...(destaque ? { _DESTAQUE: destaque } : {}),
    ...(top ? { topPorParticipante: top } : {}),
    ...(options.agregado ? { _agregado: options.agregado } : {}),
  };
  let _RESPOSTA = fmt(stubEnvelope);
  if (avisoTruncamento) {
    _RESPOSTA = `${_RESPOSTA} ${avisoTruncamento}`.trim();
  }

  return {
    _RESPOSTA,
    _listaTruncada: truncadoAuto,
    ...(destaque ? { _DESTAQUE: destaque } : {}),
    ...(top ? { topPorParticipante: top } : {}),
    ...(options.agregado ? { _agregado: options.agregado } : {}),
    ...(avisoTruncamento ? { _AVISO_TRUNCAMENTO: avisoTruncamento } : {}),
    ...(options.paginacao ? { _PAGINACAO: options.paginacao } : {}),
  } as EnvelopeExtras;
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
