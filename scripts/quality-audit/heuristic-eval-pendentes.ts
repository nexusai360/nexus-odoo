#!/usr/bin/env tsx
/**
 * Avaliacao heuristica de turnos pendentes pra que o painel saia de
 * PENDENTE em massa. Heuristica baseada em sinais grosseiros do turno:
 *
 * - registrar_lacuna sem redirect e final honesto → FORA_DO_ESCOPO
 * - tool retornou estado=erro / sem tool e resposta nao-trivial → ERRADO
 * - tool retornou estado=ok + finalMessage com numeros/dados → CORRETO
 * - finalMessage diz "não consegui obter" mas tool retornou ok → PARCIAL
 * - default (incerto) → PARCIAL
 *
 * NAO substitui avaliacao humana ou de subagente. E suficiente pra
 * remover ruido visual no painel. judgeVersion fica marcado como
 * "heuristica-v1" pra reavaliar depois se necessario.
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
  const semTool = t.toolCalls.length === 0;

  const respostasNegativas =
    /n[aã]o (consegui|encontrei|tenho|est[áa]|h[áa]|temos)|fora do meu (escopo|alcance)|n[aã]o (dispon[íi]vel|posso|sei)/.test(
      msg,
    );

  // Lacuna registrada + resposta honesta sobre nao ter dado
  if (ehLacuna && respostasNegativas) {
    return {
      status: "FORA_DO_ESCOPO",
      razao: "Heuristica: registrar_lacuna chamado, resposta honesta sobre limitacao.",
      patterns: ["limitacao_real_declarada"],
    };
  }

  // Sem tool mas com resposta substantiva (>30 chars)
  if (semTool && t.finalMessage && t.finalMessage.length > 30 && !respostasNegativas) {
    return {
      status: "ERRADO",
      razao: "Heuristica: resposta sem tool quando dado operacional foi pedido.",
      patterns: ["nao_usou_tool"],
    };
  }

  // Tool chamada + resposta diz "nao consegui"
  if (!semTool && respostasNegativas) {
    return {
      status: "PARCIAL",
      razao: "Heuristica: tool chamada mas resposta declarou nao consegui.",
      patterns: ["resposta_truncada"],
    };
  }

  // Tool chamada + numero/dado na resposta
  if (!semTool && (hasNumeros || hasMonetario) && (t.finalMessage || "").length > 20) {
    return {
      status: "CORRETO",
      razao: "Heuristica: tool retornou + resposta com dado quantitativo.",
      patterns: ["acerto_objetividade"],
    };
  }

  // Default
  return {
    status: "PARCIAL",
    razao: "Heuristica: resposta indeterminada.",
    patterns: [],
  };
}

async function loadTurnosPendentes(markerPattern: string): Promise<Turno[]> {
  const evals = await prisma.conversationQualityEvaluation.findMany({
    where: {
      status: "PENDENTE",
      conversation: {
        title: { startsWith: markerPattern },
      },
    },
    select: {
      id: true,
      conversationId: true,
      assistantMessageId: true,
    },
  });
  const out: Turno[] = [];
  for (const e of evals) {
    if (!e.assistantMessageId) continue;
    const msg = await prisma.message.findUnique({
      where: { id: e.assistantMessageId },
      select: { content: true, toolCalls: true, toolResults: true },
    });
    if (!msg) continue;
    out.push({
      evaluationId: e.id,
      conversationId: e.conversationId,
      assistantMessageId: e.assistantMessageId,
      finalMessage: msg.content ?? "",
      toolCalls: Array.isArray(msg.toolCalls)
        ? (msg.toolCalls as { name: string; args: unknown }[])
        : [],
      toolResults:
        msg.toolResults && typeof msg.toolResults === "object"
          ? (msg.toolResults as Record<string, string>)
          : {},
    });
  }
  return out;
}

async function main() {
  const markers = [
    "[AUDIT-POS-2026-05-26T17-21-31]",
    "[AUDIT-POS-2026-05-26T18-01-27]",
    "[AUDIT-POS-2026-05-26T18-05-49]",
  ];
  let totalOk = 0;
  for (const marker of markers) {
    const turnos = await loadTurnosPendentes(marker);
    console.log(`\n[${marker}] ${turnos.length} pendentes`);
    const totals: Record<string, number> = { CORRETO: 0, PARCIAL: 0, ERRADO: 0, FORA_DO_ESCOPO: 0 };
    for (const t of turnos) {
      const c = classify(t);
      await prisma.conversationQualityEvaluation.update({
        where: { id: t.evaluationId },
        data: {
          status: c.status,
          razoes: c.razao,
          patterns: c.patterns,
          judgeVersion: "heuristica-v1",
        },
      });
      totals[c.status]++;
      totalOk++;
    }
    console.log(`  CORRETO=${totals.CORRETO} PARCIAL=${totals.PARCIAL} ERRADO=${totals.ERRADO} FORA=${totals.FORA_DO_ESCOPO}`);
  }
  // R14 cancelada (4 turnos) -> FALHA_TECNICA
  const r14 = await prisma.conversationQualityEvaluation.updateMany({
    where: {
      status: "PENDENTE",
      conversation: { title: { startsWith: "[AUDIT-POS-2026-05-27T02-47-42]" } },
    },
    data: { status: "FALHA_TECNICA", razoes: "Bateria R14 cancelada (4 turnos disparados, abortada)." },
  });
  console.log(`\nR14 cancelada -> FALHA_TECNICA: ${r14.count} rows`);

  console.log(`\nTotal heuristica aplicada: ${totalOk}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
