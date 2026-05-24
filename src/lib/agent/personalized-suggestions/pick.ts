/**
 * Selector puro que monta a lista final de sugestoes personalizadas.
 * Regra: 1 slot do all-time mais usado + (N-1) slots dos mais usados nos
 * ultimos 28 dias, deduplicados e mapeados via templates.
 *
 * Modulo puro: nao acessa DB nem Redis. Recebe os resultados ja agregados.
 */

import type { ToolUsageEntry } from "./aggregate";
import { questionForTool } from "./templates";

/**
 * Monta a lista final.
 *
 * @param allTime  Ordenado desc, top tools de toda a historia do usuario.
 * @param recent   Ordenado desc, top tools dos ultimos 28 dias.
 * @param max      Quantidade desejada (clampado entre 1 e 5 pelo caller).
 */
export function pickPersonalizedQuestions(
  allTime: ToolUsageEntry[],
  recent: ToolUsageEntry[],
  max: number,
): string[] {
  const safeMax = Math.min(Math.max(1, max), 5);

  const seenTools = new Set<string>();
  const seenQuestions = new Set<string>();
  const out: string[] = [];

  function tryAdd(toolName: string | undefined): boolean {
    if (!toolName) return false;
    if (seenTools.has(toolName)) return false;
    const q = questionForTool(toolName);
    if (!q) return false;
    if (seenQuestions.has(q)) return false;
    seenTools.add(toolName);
    seenQuestions.add(q);
    out.push(q);
    return out.length >= safeMax;
  }

  // Slot 1: top all-time.
  if (allTime.length > 0) tryAdd(allTime[0].toolName);

  // Demais slots: top recentes (pulando duplicatas).
  for (const e of recent) {
    if (out.length >= safeMax) break;
    tryAdd(e.toolName);
  }

  // Completa com o restante do all-time, se ainda houver vagas.
  for (const e of allTime) {
    if (out.length >= safeMax) break;
    tryAdd(e.toolName);
  }

  return out;
}
