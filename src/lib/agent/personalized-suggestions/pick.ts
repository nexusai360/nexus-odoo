/**
 * Selector puro que monta a lista final de sugestoes personalizadas.
 * Regra: 1 slot do all-time mais usado + (N-1) slots dos mais usados nos
 * ultimos 28 dias, deduplicados e mapeados via templates.
 *
 * Modulo puro: nao acessa DB nem Redis. Recebe os resultados ja agregados.
 */

import type { ReportDomain } from "@/generated/prisma/client";
import type { ToolUsageEntry } from "./aggregate";
import { questionForTool, TOOL_DOMAIN } from "./templates";

/**
 * Monta a lista final.
 *
 * @param allTime         Ordenado desc, top tools de toda a historia do usuario.
 * @param recent          Ordenado desc, top tools dos ultimos 28 dias.
 * @param max             Quantidade desejada (clampado entre 1 e 5 pelo caller).
 * @param allowedDomains  Quando fornecido, descarta tools cujo dominio (via
 *                        TOOL_DOMAIN) nao esteja na lista. Garante que uma
 *                        sugestao personalizada nunca vaze dominio sem acesso
 *                        (filtro por dominio da tool, nao por texto).
 */
/** Reordena (estavel) colocando tools de dominios preferidos primeiro. Mantem a ordem por
 *  frequencia dentro de cada grupo. Vies suave de personalizacao (Onda 1). */
function biasPorDominio(entries: ToolUsageEntry[], preferredDomains?: string[]): ToolUsageEntry[] {
  if (!preferredDomains || preferredDomains.length === 0) return entries;
  const pref = new Set(preferredDomains);
  const preferidos: ToolUsageEntry[] = [];
  const resto: ToolUsageEntry[] = [];
  for (const e of entries) {
    const dom = TOOL_DOMAIN[e.toolName];
    if (dom && pref.has(dom)) preferidos.push(e);
    else resto.push(e);
  }
  return [...preferidos, ...resto];
}

export function pickPersonalizedQuestions(
  allTime: ToolUsageEntry[],
  recent: ToolUsageEntry[],
  max: number,
  allowedDomains?: ReportDomain[],
  profileExtras?: { preferredDomains?: string[] },
): string[] {
  const safeMax = Math.min(Math.max(1, max), 5);
  // Vies de personalizacao: tools dos dominios preferidos do usuario vem primeiro.
  allTime = biasPorDominio(allTime, profileExtras?.preferredDomains);
  recent = biasPorDominio(recent, profileExtras?.preferredDomains);

  const seenTools = new Set<string>();
  const seenQuestions = new Set<string>();
  const out: string[] = [];

  function tryAdd(toolName: string | undefined): boolean {
    if (!toolName) return false;
    if (seenTools.has(toolName)) return false;
    if (allowedDomains) {
      const dom = TOOL_DOMAIN[toolName];
      if (!dom || !allowedDomains.includes(dom)) return false;
    }
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
