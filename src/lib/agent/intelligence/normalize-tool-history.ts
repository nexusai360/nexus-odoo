/**
 * Normaliza o historico de tool calls cross-provider em formato canonico.
 *
 * Descoberta da Onda 1: `Message.toolCalls` ja vem uniformizado pelos 4
 * adapters no formato `{ id, name, arguments }` (`ToolCall` em types.ts).
 * Portanto o normalizer NAO precisa cobrir 4 formatos distintos no input.
 * A coluna nova `Message.toolResults` (Onda 1) guarda os resultados na
 * estrutura `Record<callId, string>` (mapa do `id` da tool call para o
 * texto retornado pela tool, ja guardado pelo `guardToolResult`).
 *
 * Funcao:
 *   normalizeToolHistory(toolCalls, toolResults) -> NormalizedToolHistory
 *
 * Saida `NormalizedToolHistory` e o contrato usado pelos modulos de
 * inteligencia (tool-replayer, quality-judge) , independente do provider.
 *
 * Modulo puro. Sem DB, sem fetch.
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §3.2
 */

import type { ToolCall } from "@/lib/agent/llm/types";

export type NormalizedToolCall = {
  /** ID da chamada (provider-side). Usado para parear com result quando existir. */
  callId: string;
  /** Nome da tool. */
  name: string;
  /** Argumentos JSON parseados. */
  args: Record<string, unknown>;
  /** Resultado serializado (string). `undefined` quando nao registrado. */
  result?: string;
};

export type NormalizedToolHistory = NormalizedToolCall[];

/**
 * Mapa de results gravado em `Message.toolResults`: `{ [callId]: result }`.
 * Forma canonica decidida na Onda 1.
 */
export type ToolResultsMap = Record<string, string>;

function isToolCallShape(value: unknown): value is ToolCall {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.arguments === "object" &&
    v.arguments !== null
  );
}

/**
 * Normaliza tool calls + results em formato canonico.
 *
 * @param toolCalls  Valor de `Message.toolCalls` (Json no banco). Aceita null/undefined.
 * @param toolResults Valor de `Message.toolResults` (Json no banco). Aceita null/undefined.
 */
export function normalizeToolHistory(
  toolCalls: unknown,
  toolResults: unknown,
): NormalizedToolHistory {
  if (!Array.isArray(toolCalls)) return [];

  const resultsMap: ToolResultsMap = isToolResultsMap(toolResults)
    ? (toolResults as ToolResultsMap)
    : {};

  const out: NormalizedToolHistory = [];
  for (const raw of toolCalls) {
    if (!isToolCallShape(raw)) continue;
    out.push({
      callId: raw.id,
      name: raw.name,
      args: raw.arguments as Record<string, unknown>,
      result: resultsMap[raw.id],
    });
  }
  return out;
}

function isToolResultsMap(value: unknown): value is ToolResultsMap {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).every(
    (v) => typeof v === "string",
  );
}
