/**
 * Envelope canonico de tool result do MCP.
 * Spec: docs/superpowers/specs/2026-05-27-agente-nex-90pct-spec.md §4.2
 *
 * Todas as tools do servidor MCP devolvem (ou passam a devolver, conforme
 * a Onda 1.B/C) o resultado embrulhado neste envelope. O LLM consome
 * _RESPOSTA como base da resposta final; o servidor consome _DESTAQUE,
 * _agregado e topPorParticipante para validar a resposta gerada.
 */

import { z } from "zod";

export interface ToolEnvelope<TLinha = unknown> {
  /** Texto pronto descrevendo o resultado, gerado por formatador TS.
   *  LLM usa como base da resposta (mantendo todos os numeros/fatos). */
  _RESPOSTA: string;

  /** True so se a lista foi cortada por limite explicito da tool. */
  _listaTruncada: boolean;

  /** Total estruturado destacado. */
  _DESTAQUE?: Record<string, string | number>;

  /** Agregados pre-computados. */
  _agregado?: {
    soma?: number;
    contagem?: number;
    media?: number;
    [k: string]: number | undefined;
  };

  /** Lista paginada (limite definido pela tool). */
  linhas: TLinha[];

  /** Cache freshness. */
  atualizadoEm: string;
  atualizadoHa: string;

  /** Estrutura de ambiguidade quando aplicavel. */
  ambiguidade?: {
    requiredExactMatch?: boolean;
    candidatos?: Array<{ id: string; nome: string; contexto?: string }>;
    [k: string]: unknown;
  };

  /** Top por participante (apenas tools de saldo financeiro). */
  topPorParticipante?: Array<{ nome: string; soma: number; n: number }>;

  /** Aviso nao-bloqueante (ex: parametro sugerido). */
  aviso?: string;

  /** Redirecionamento sugerido para outra tool. */
  redirecionar?: { tool: string; motivo: string; confianca: number };
}

const MAX_RESPOSTA_CHARS = 500;

export interface BuildEnvelopeInput<TLinha> {
  _RESPOSTA: string;
  _listaTruncada: boolean;
  linhas: TLinha[];
  atualizadoEm: string;
  atualizadoHa: string;
  _DESTAQUE?: Record<string, string | number>;
  _agregado?: ToolEnvelope<TLinha>["_agregado"];
  ambiguidade?: ToolEnvelope<TLinha>["ambiguidade"];
  topPorParticipante?: ToolEnvelope<TLinha>["topPorParticipante"];
  aviso?: string;
  redirecionar?: ToolEnvelope<TLinha>["redirecionar"];
}

// ---------------------------------------------------------------------------
// Contrato base (F4 Apresentacao, Onda 1.3)
// ---------------------------------------------------------------------------
//
// `dadosBaseShape` e a versao Zod do conteudo de `dados` (corresponde a
// interface `ToolEnvelope`, que segue sendo o TIPO importado por responder.ts).
// E `.passthrough()`: aceita chaves de array extras (titulos, serie, contas,
// porEtapa, ...) sem precisar declarar cada uma, e sem cada tool declarar um
// outputSchema proprio. Unico campo obrigatorio: `_RESPOSTA` (toda tool pronta
// tem um texto-resposta real). Os demais sao opcionais (tools escalares nao tem
// `linhas`; tools de lista nao tem `topPorParticipante`, etc.).
//
// `EnvelopeBaseShape` e a versao Zod de `FreshnessEnvelope<ToolEnvelope>` (o
// shape que sai de `withFreshness`): union discriminada por `estado`. Serve de
// REDE do teste de contrato (Onda 1.4) , valida o output em runtime no teste,
// sem invadir os ~100 outputSchemas das tools (decisao [P]#6, opcao a).

export const dadosBaseShape = z
  .object({
    _RESPOSTA: z.string(),
    _listaTruncada: z.boolean().optional(),
    _DESTAQUE: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    _agregado: z.record(z.string(), z.number().optional()).optional(),
    linhas: z.array(z.unknown()).optional(),
    atualizadoEm: z.string().optional(),
    atualizadoHa: z.string().optional(),
    ambiguidade: z.record(z.string(), z.unknown()).optional(),
    topPorParticipante: z
      .array(z.object({ nome: z.string(), soma: z.number(), n: z.number() }))
      .optional(),
    aviso: z.string().optional(),
    redirecionar: z
      .object({ tool: z.string(), motivo: z.string(), confianca: z.number() })
      .optional(),
  })
  .passthrough();

export const EnvelopeBaseShape = z.discriminatedUnion("estado", [
  z.object({ estado: z.literal("preparando") }),
  z.object({
    estado: z.enum(["ok", "vazio"]),
    dados: dadosBaseShape,
    atualizadoEm: z.string(),
    atualizadoHa: z.string(),
    fonteStatus: z.object({
      status: z.string(),
      ultimaSyncEm: z.string().nullable(),
    }),
  }),
]);

/** Conteudo de `dados` de uma tool pronta. Helper para montar o objeto que vai
 *  dentro de `withFreshness`, garantindo `_RESPOSTA` e aceitando extras. */
export function envelopePronto(
  extra: { _RESPOSTA: string } & Record<string, unknown>,
): { _RESPOSTA: string } & Record<string, unknown> {
  return { ...extra };
}

export function buildEnvelope<TLinha = unknown>(
  input: BuildEnvelopeInput<TLinha>,
): ToolEnvelope<TLinha> {
  const resposta =
    input._RESPOSTA.length > MAX_RESPOSTA_CHARS
      ? input._RESPOSTA.slice(0, MAX_RESPOSTA_CHARS - 3) + "..."
      : input._RESPOSTA;

  return {
    _RESPOSTA: resposta,
    _listaTruncada: input._listaTruncada,
    linhas: input.linhas,
    atualizadoEm: input.atualizadoEm,
    atualizadoHa: input.atualizadoHa,
    ...(input._DESTAQUE ? { _DESTAQUE: input._DESTAQUE } : {}),
    ...(input._agregado ? { _agregado: input._agregado } : {}),
    ...(input.ambiguidade ? { ambiguidade: input.ambiguidade } : {}),
    ...(input.topPorParticipante
      ? { topPorParticipante: input.topPorParticipante }
      : {}),
    ...(input.aviso ? { aviso: input.aviso } : {}),
    ...(input.redirecionar ? { redirecionar: input.redirecionar } : {}),
  };
}
