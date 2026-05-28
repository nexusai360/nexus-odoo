#!/usr/bin/env tsx
/**
 * Aplica a mesma heuristica de heuristic-eval-pendentes.ts em avaliacoes
 * PENDENTE vindas do uso real do agente (channel in_app/whatsapp, SEM
 * marker AUDIT-POS no title). Cobre o vazio deixado pelo script original
 * que filtra so por marker de rodada.
 *
 * Cenario de uso (2026-05-28): 2 pendentes em produção do agente Nex (mais
 * o que aparecer). O usuario quer exemplos visiveis na tabela com a
 * coluna 'Origem' = 'Agente Nex' ou 'Playground'.
 */
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });
import { prisma } from "@/lib/prisma";

type Status = "CORRETO" | "PARCIAL" | "ERRADO" | "FORA_DO_ESCOPO";

interface Turno {
  evaluationId: string;
  conversationId: string;
  channel: string | null;
  assistantMessageId: string | null;
  finalMessage: string;
  toolCalls: { name: string; args: unknown }[];
  toolResults: Record<string, string>;
}

function classify(t: Turno): { status: Status; razao: string; patterns: string[] } {
  const msg = (t.finalMessage || "").toLowerCase();
  const hasNumeros = /\d[\d.,]*/.test(t.finalMessage || "");
  const hasMonetario = /r\$/i.test(t.finalMessage || "");
  const toolNames = t.toolCalls.map((c) => c.name);
  const ehLacuna = toolNames.includes("registrar_lacuna");
  const semFerramenta = toolNames.length === 0;

  // Pure rejection by tool (caminho 3a): registrar_lacuna sem nada substantivo.
  if (ehLacuna && toolNames.every((n) => n === "registrar_lacuna")) {
    return {
      status: "FORA_DO_ESCOPO",
      razao: "Lacuna pura: agente registrou lacuna sem chamar ferramenta de dado.",
      patterns: ["lacuna_pura"],
    };
  }

  // Tool error generates ERRADO.
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
      // ignore non-JSON results
    }
  }

  // Sem tool + resposta com dados aparentes -> dado inventado (ERRADO).
  if (semFerramenta && (hasNumeros || hasMonetario) && t.finalMessage.length > 30) {
    return {
      status: "ERRADO",
      razao: "Resposta contem dados (numeros/R$) mas nenhuma tool foi chamada.",
      patterns: ["dado_inventado"],
    };
  }

  // Resposta declara "nao consegui" / "nao tenho" -> PARCIAL/FORA.
  if (/não consegui|nao consegui|não tenho|nao tenho|sem dados|indisponivel/i.test(msg)) {
    return {
      status: "FORA_DO_ESCOPO",
      razao: "Agente declarou que nao tem o dado.",
      patterns: ["lacuna_declarada"],
    };
  }

  // Tool ok + resposta com numero -> CORRETO heuristico.
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

async function main() {
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

  console.log(
    `Encontradas ${evals.length} avaliacoes PENDENTE de canais nao-AUDIT.`,
  );
  const totals: Record<string, number> = {
    CORRETO: 0,
    PARCIAL: 0,
    ERRADO: 0,
    FORA_DO_ESCOPO: 0,
  };
  for (const e of evals) {
    if (!e.assistantMessageId) {
      console.log(`  ${e.id}: sem assistantMessageId, pulando`);
      continue;
    }
    const finalMsg = await prisma.message.findUnique({
      where: { id: e.assistantMessageId },
      select: { content: true, createdAt: true, conversationId: true },
    });
    if (!finalMsg) {
      console.log(`  ${e.id}: mensagem nao encontrada, pulando`);
      continue;
    }
    // CORRECAO (igual queries.ts getEvaluationDetail): tool_calls ficam nas
    // mensagens assistant INTERMEDIARIAS do turno, nao na final. Agrega
    // tudo entre a ultima user message anterior e a final.
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
    const t: Turno = {
      evaluationId: e.id,
      conversationId: e.conversationId,
      channel: e.conversation?.channel ?? null,
      assistantMessageId: e.assistantMessageId,
      finalMessage: finalMsg.content ?? "",
      toolCalls: calls,
      toolResults: results,
    };
    const c = classify(t);
    await prisma.conversationQualityEvaluation.update({
      where: { id: e.id },
      data: {
        status: c.status,
        razoes: c.razao,
        patterns: c.patterns,
        judgeVersion: "heuristica-agente-nex-v1",
      },
    });
    totals[c.status]++;
    console.log(
      `  ${e.id} (${t.channel}) -> ${c.status}: ${c.razao.slice(0, 80)}`,
    );
  }

  console.log(
    `\nResumo: CORRETO=${totals.CORRETO} PARCIAL=${totals.PARCIAL} ERRADO=${totals.ERRADO} FORA=${totals.FORA_DO_ESCOPO}`,
  );
}

main()
  .catch((err) => {
    console.error("FALHA:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
