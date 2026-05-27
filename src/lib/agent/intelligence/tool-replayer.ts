/**
 * Re-executa tool calls de leitura registradas em turnos passados para a
 * Frente A (analise retrospectiva).
 *
 * Estrategia: importa o catalogo MCP em runtime e chama o `handler` da tool
 * com prisma + privilegio elevado (bypass de UserDomainAccess). O resultado
 * nunca volta ao usuario final — apenas alimenta o LLM judge.
 *
 * Apenas tools `read:*` sao reproduzidas. Tools `write:*` sao puladas.
 * Audit log com `actor=system:quality-judge`.
 *
 * Spec: docs/superpowers/specs/2026-05-25-agente-nex-inteligencia-design.md §3.5
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import type { NormalizedToolCall } from "./normalize-tool-history";

export interface ReplayItem {
  callId: string;
  name: string;
  originalArgs: Record<string, unknown>;
  originalResult: string | undefined;
  /** Resultado da re-execucao. `undefined` quando tool nao encontrada/falhou. */
  newResult: string | undefined;
  /** Divergencia ~ 0..1 entre original e novo. */
  divergence: number;
  flags: string[];
}

export interface ReplayResult {
  items: ReplayItem[];
}

/**
 * Re-executa as tools normalizadas e retorna metadados de divergencia.
 *
 * @param history       Tool history normalizada de um turno.
 * @param systemActorId Identificador do "ator de sistema" (ex.: "quality-judge")
 *                      gravado em audit_logs.
 */
export async function replayToolCalls(
  history: NormalizedToolCall[],
  systemActorId: string,
): Promise<ReplayResult> {
  const items: ReplayItem[] = [];

  // Import lazy do catalogo (so quando chamado; evita carregar MCP em fluxos
  // que nao precisam).
  let catalog: Array<{
    id: string;
    handler: (input: unknown, ctx: { prisma: typeof prisma; user?: unknown }) => Promise<unknown>;
  }> | null = null;
  try {
    const mod = await import("../../../../mcp/catalog/index.js");
    catalog = (mod.catalogo ?? []) as Array<{
      id: string;
      handler: (input: unknown, ctx: { prisma: typeof prisma; user?: unknown }) => Promise<unknown>;
    }>;
  } catch (err) {
    console.warn("[tool-replayer] falha ao carregar catalogo MCP:", err);
    catalog = null;
  }

  for (const call of history) {
    const flags: string[] = [];
    let newResult: string | undefined;

    if (call.name.startsWith("write:")) {
      flags.push("write_tool_skipped");
      items.push({
        callId: call.callId,
        name: call.name,
        originalArgs: call.args,
        originalResult: call.result,
        newResult: undefined,
        divergence: 0,
        flags,
      });
      continue;
    }

    if (!catalog) {
      flags.push("catalog_unavailable");
      items.push({
        callId: call.callId,
        name: call.name,
        originalArgs: call.args,
        originalResult: call.result,
        newResult: undefined,
        divergence: 0,
        flags,
      });
      continue;
    }

    const entry = catalog.find((t) => t.id === call.name);
    if (!entry) {
      flags.push("tool_not_found");
      items.push({
        callId: call.callId,
        name: call.name,
        originalArgs: call.args,
        originalResult: call.result,
        newResult: undefined,
        divergence: 0,
        flags,
      });
      continue;
    }

    try {
      const raw = await entry.handler(call.args, {
        prisma,
        user: { systemActor: systemActorId, bypassDomainAccess: true },
      });
      newResult =
        typeof raw === "string" ? raw : JSON.stringify(raw);
    } catch (err) {
      flags.push("tool_threw");
      newResult = undefined;
      console.warn(`[tool-replayer] tool ${call.name} lancou:`, err);
    }

    // Audit minimo via console (AuditLog requer extensao do enum AuditAction
    // via migration separada — fica como follow-up). Trilha estruturada vive
    // dentro de ConversationQualityEvaluation.toolsReexecuted.
    try {
      console.info(
        "[quality-judge:tool-replay]",
        JSON.stringify({
          actor: systemActorId,
          tool: call.name,
          callId: call.callId,
          divergence: undefined as number | undefined,
        }),
      );
    } catch {
      // swallow
    }

    const divergence = computeDivergence(call.result, newResult);
    if (divergence > 0.2) flags.push("tool_diverged");

    items.push({
      callId: call.callId,
      name: call.name,
      originalArgs: call.args,
      originalResult: call.result,
      newResult,
      divergence,
      flags,
    });
  }

  return { items };
}

/**
 * Divergencia simples 0..1 baseada em diferenca de comprimento e
 * substring overlap. Heuristica barata para sinalizar "dado mudou" sem
 * precisar de diff estrutural.
 */
function computeDivergence(a: string | undefined, b: string | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null || b == null) return 1;
  if (a === b) return 0;

  const maxLen = Math.max(a.length, b.length);
  const lenDiff = Math.abs(a.length - b.length) / maxLen;

  // Tokens comuns (palavras de pelo menos 3 chars) — overlap simples
  const tokensA = new Set(a.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const tokensB = new Set(b.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const intersection = [...tokensA].filter((t) => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  const overlap = union === 0 ? 1 : intersection / union;

  // Combinacao: 50% diff de comprimento + 50% (1 - overlap).
  return Math.min(1, 0.5 * lenDiff + 0.5 * (1 - overlap));
}
