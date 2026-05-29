// Auditoria heuristica de avaliacoes PENDENTE de canais nao-AUDIT
// (Agente Nex via bubble/WhatsApp e Playground). Reutilizada pelo:
//   - CLI: scripts/quality-audit/heuristic-eval-agente-nex-pendentes.ts
//   - Worker BullMQ: src/worker/quality/auto-heuristic-job.ts (cron
//     configurado via AgentSettings.qualityHeuristicIntervalMinutes).
//
// IMPORTANTE: tool_calls vivem nas Messages assistant INTERMEDIARIAS do
// turno; a final (apontada por evaluation.assistantMessageId) so tem o
// texto. Agregamos tudo entre a ultima user message anterior e a final
// (mesma logica do queries.ts:getEvaluationDetail).

import { prisma } from "@/lib/prisma";

export type HeuristicStatus =
  | "CORRETO"
  | "PARCIAL"
  | "ERRADO"
  | "FORA_DO_ESCOPO";

export interface HeuristicTurno {
  evaluationId: string;
  conversationId: string;
  channel: string | null;
  assistantMessageId: string | null;
  finalMessage: string;
  toolCalls: { name: string; args: unknown }[];
  toolResults: Record<string, string>;
}

export interface HeuristicClassification {
  status: HeuristicStatus;
  razao: string;
  patterns: string[];
}

export function classifyTurno(t: HeuristicTurno): HeuristicClassification {
  const msg = (t.finalMessage || "").toLowerCase();
  const hasNumeros = /\d[\d.,]*/.test(t.finalMessage || "");
  const hasMonetario = /r\$/i.test(t.finalMessage || "");
  const toolNames = t.toolCalls.map((c) => c.name);
  const ehLacuna = toolNames.includes("registrar_lacuna");
  const semFerramenta = toolNames.length === 0;

  if (ehLacuna && toolNames.every((n) => n === "registrar_lacuna")) {
    return {
      status: "FORA_DO_ESCOPO",
      razao:
        "Lacuna pura: agente registrou lacuna sem chamar ferramenta de dado.",
      patterns: ["lacuna_pura"],
    };
  }

  for (const r of Object.values(t.toolResults)) {
    try {
      const parsed = JSON.parse(r);
      if (parsed?.estado === "erro") {
        return {
          status: "ERRADO",
          razao: `Tool ${parsed?.toolName ?? "?"} retornou erro: ${parsed?.dados?._RESPOSTA ?? "sem detalhes"}`,
          patterns: ["tool_erro"],
        };
      }
    } catch {
      // ignore non-JSON
    }
  }

  if (
    semFerramenta &&
    (hasNumeros || hasMonetario) &&
    t.finalMessage.length > 30
  ) {
    return {
      status: "ERRADO",
      razao:
        "Resposta contem dados (numeros/R$) mas nenhuma tool foi chamada.",
      patterns: ["dado_inventado"],
    };
  }

  if (
    /não consegui|nao consegui|não tenho|nao tenho|sem dados|indisponivel/i.test(
      msg,
    )
  ) {
    return {
      status: "FORA_DO_ESCOPO",
      razao: "Agente declarou que nao tem o dado.",
      patterns: ["lacuna_declarada"],
    };
  }

  let toolOk = false;
  for (const r of Object.values(t.toolResults)) {
    try {
      const parsed = JSON.parse(r);
      if (parsed?.estado === "ok" || parsed?.estado === "vazio") toolOk = true;
    } catch {
      // ignore
    }
  }
  if (toolOk && (hasNumeros || hasMonetario)) {
    return {
      status: "CORRETO",
      razao: "Tool retornou ok/vazio e resposta apresenta valores.",
      patterns: ["resposta_com_dados"],
    };
  }

  return {
    status: "PARCIAL",
    razao: "Sinais ambiguos, classificacao heuristica conservadora.",
    patterns: ["ambiguo"],
  };
}

export interface AutoHeuristicResult {
  processadas: number;
  totals: Record<HeuristicStatus, number>;
}

/** Carrega e classifica todas as PENDENTE de in_app/whatsapp/playground
 *  SEM marker AUDIT-POS. Atualiza cada uma com a heuristica.
 *  Retorna estatisticas. NAO chama LLM. NAO depende de Claude Code. */
export async function runAutoHeuristic(): Promise<AutoHeuristicResult> {
  const evals = await prisma.conversationQualityEvaluation.findMany({
    where: {
      status: "PENDENTE",
      conversation: {
        channel: { in: ["in_app", "whatsapp", "playground"] },
        OR: [
          { title: null },
          { NOT: { title: { startsWith: "[AUDIT" } } },
        ],
      },
    },
    select: {
      id: true,
      conversationId: true,
      assistantMessageId: true,
      conversation: { select: { channel: true } },
    },
  });

  const totals: Record<HeuristicStatus, number> = {
    CORRETO: 0,
    PARCIAL: 0,
    ERRADO: 0,
    FORA_DO_ESCOPO: 0,
  };
  let processadas = 0;

  for (const e of evals) {
    if (!e.assistantMessageId) continue;
    const finalMsg = await prisma.message.findUnique({
      where: { id: e.assistantMessageId },
      select: { content: true, createdAt: true, conversationId: true },
    });
    if (!finalMsg) continue;
    const lastUserBefore = await prisma.message.findFirst({
      where: {
        conversationId: finalMsg.conversationId,
        role: "user",
        createdAt: { lt: finalMsg.createdAt },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const intermediarias = await prisma.message.findMany({
      where: {
        conversationId: finalMsg.conversationId,
        role: "assistant",
        createdAt: {
          ...(lastUserBefore ? { gt: lastUserBefore.createdAt } : {}),
          lte: finalMsg.createdAt,
        },
      },
      orderBy: { createdAt: "asc" },
      select: { toolCalls: true, toolResults: true },
    });
    const calls: { name: string; args: unknown }[] = [];
    const results: Record<string, string> = {};
    for (const m of intermediarias) {
      if (Array.isArray(m.toolCalls)) {
        calls.push(...(m.toolCalls as { name: string; args: unknown }[]));
      }
      if (m.toolResults && typeof m.toolResults === "object") {
        Object.assign(results, m.toolResults as Record<string, string>);
      }
    }
    const t: HeuristicTurno = {
      evaluationId: e.id,
      conversationId: e.conversationId,
      channel: e.conversation?.channel ?? null,
      assistantMessageId: e.assistantMessageId,
      finalMessage: finalMsg.content ?? "",
      toolCalls: calls,
      toolResults: results,
    };
    const c = classifyTurno(t);
    await prisma.conversationQualityEvaluation.update({
      where: { id: e.id },
      data: {
        status: c.status,
        razoes: c.razao,
        patterns: c.patterns,
        judgeVersion: "heuristica-agente-nex-v1",
      },
    });
    totals[c.status] += 1;
    processadas += 1;
  }
  return { processadas, totals };
}
