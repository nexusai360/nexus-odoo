#!/usr/bin/env tsx
/**
 * Aplica heuristic-eval-pendentes para R19 (marker [AUDIT-POS-2026-05-28T10-12-30]).
 * Reusa a logica de classify do heuristic-eval-pendentes.ts, mas com o
 * bugfix do Bloco 5 (lacuna pura vs prematura).
 */
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Status = "CORRETO" | "PARCIAL" | "ERRADO" | "FORA_DO_ESCOPO";

interface Turno {
  evaluationId: string;
  conversationId: string;
  finalMessage: string;
  toolCalls: { name: string; args: unknown }[];
}

function classify(t: Turno): { status: Status; razao: string; patterns: string[] } {
  const msg = (t.finalMessage || "").toLowerCase();
  const hasNumeros = /\d[\d.,]*/.test(t.finalMessage || "");
  const hasMonetario = /r\$/i.test(t.finalMessage || "");
  const toolNames = t.toolCalls.map((c) => c.name);
  const ehLacuna = toolNames.includes("registrar_lacuna");
  const TOOLS_FACTUAIS_REGEX = /^(financeiro|fiscal|estoque|comercial|contabil|cadastro)_/;
  const toolsFactuais = toolNames.filter((n) => TOOLS_FACTUAIS_REGEX.test(n));
  const ehLacunaPura = ehLacuna && toolsFactuais.length === 0;
  const ehLacunaPrematura = ehLacuna && toolsFactuais.length > 0;
  const semTool = t.toolCalls.length === 0;

  // T-30 (Ronda 1.5): distingue §10b/§12b cumpridas (CORRETO) de recusa real.
  const respostaNaoHa =
    /\bn[aã]o\s+h[áa]\s+\w/.test(msg) ||
    /\bn[aã]o\s+encontrei\s+registros\b/.test(msg) ||
    /\btotal\s+vencido:\s*r\$\s*0,?0?0?\b/.test(msg);
  const respostaClarificacao =
    /\bn[aã]o\s+entendi\s+sua\s+pergunta\b/.test(msg) ||
    /\bvoc[êe]\s+quer\s+saber\s+sobre\b/.test(msg) ||
    /\bvoc[êe]\s+quer\s+(o|a|os|as|ver|saber|confirmar)\b.*\bou\b/.test(msg);

  const respostasNegativas =
    !respostaNaoHa &&
    !respostaClarificacao &&
    (/n[aã]o (consegui|encontrei|tenho|est[áa]|temos)|fora do meu (escopo|alcance)|n[aã]o (dispon[íi]vel|posso|sei)/.test(msg) ||
      /lista\s+veio\s+(truncad|cortad|parcial)/.test(msg) ||
      /sem\s+o?\s*total\s+(consolidad|fechad)/.test(msg));

  if (!semTool && respostaNaoHa && !respostasNegativas) {
    return {
      status: "CORRETO",
      razao: "Heuristica: §10b cumprida (tool vazia traduzida como 'Nao ha X').",
      patterns: ["acerto_estado_vazio"],
    };
  }

  if (semTool && respostaClarificacao) {
    return {
      status: "CORRETO",
      razao: "Heuristica: §12b cumprida (clarificacao para pergunta ambigua).",
      patterns: ["acerto_clarificacao"],
    };
  }

  if (ehLacunaPura && respostasNegativas) {
    return {
      status: "FORA_DO_ESCOPO",
      razao: "Heuristica: lacuna pura + resposta honesta.",
      patterns: ["limitacao_real_declarada"],
    };
  }

  if (ehLacunaPrematura && respostasNegativas && !hasNumeros && !hasMonetario) {
    return {
      status: "ERRADO",
      razao: "Heuristica: lacuna prematura (havia tool factual antes) + recusa sem dado.",
      patterns: ["lacuna_prematura", "recusa_indevida"],
    };
  }

  if (semTool && t.finalMessage && t.finalMessage.length > 30 && !respostasNegativas) {
    return {
      status: "ERRADO",
      razao: "Heuristica: resposta sem tool quando dado operacional foi pedido.",
      patterns: ["nao_usou_tool"],
    };
  }

  // T-30b: tool factual chamada + recusa explicita = ERRADO (tinha dado, nao usou).
  const recusaExplicitaComDado =
    /lista\s+veio\s+(truncad|cortad|parcial)/.test(msg) ||
    /sem\s+o?\s*total\s+(consolidad|fechad)/.test(msg) ||
    /n[aã]o\s+(consegui\s+(consolidar|fechar|separar|obter))/.test(msg);
  if (toolsFactuais.length > 0 && recusaExplicitaComDado) {
    return {
      status: "ERRADO",
      razao: "Heuristica: tool factual retornou dado mas resposta recusou explicitamente.",
      patterns: ["recusa_com_dado"],
    };
  }
  if (!semTool && respostasNegativas) {
    return {
      status: "PARCIAL",
      razao: "Heuristica: tool chamada mas resposta declarou nao consegui.",
      patterns: ["resposta_truncada"],
    };
  }

  if (!semTool && (hasNumeros || hasMonetario) && (t.finalMessage || "").length > 20) {
    return {
      status: "CORRETO",
      razao: "Heuristica: tool retornou + resposta com dado quantitativo.",
      patterns: ["acerto_objetividade"],
    };
  }

  return {
    status: "PARCIAL",
    razao: "Heuristica: classificacao incerta, marcado para revisao.",
    patterns: ["heuristica_incerta"],
  };
}

async function main() {
  const marker = "[AUDIT-POS-2026-05-28T10-12-30]";
  const pendentes = await prisma.$queryRaw<
    Array<{
      id: string;
      conversation_id: string;
      assistant_message_id: string | null;
    }>
  >`
    SELECT e.id, e.conversation_id, e.assistant_message_id
    FROM conversation_quality_evaluations e
    JOIN conversations c ON c.id = e.conversation_id
    WHERE c.title LIKE ${"%" + marker + "%"}
      AND e.status = 'PENDENTE'
  `;
  console.log(`[${marker}] ${pendentes.length} pendentes`);
  const totals: Record<string, number> = { CORRETO: 0, PARCIAL: 0, ERRADO: 0, FORA_DO_ESCOPO: 0 };
  for (const p of pendentes) {
    let finalMessage = "";
    const toolCalls: Array<{ name: string; args: unknown }> = [];
    if (p.assistant_message_id) {
      const a = await prisma.message.findUnique({
        where: { id: p.assistant_message_id },
        select: { content: true, toolCalls: true },
      });
      finalMessage = a?.content ?? "";
      // also collect tool calls from all assistant messages in this turn
    }
    // pull all tool calls from messages in the same turn (assistantMessageId -> conversation)
    const turnMsgs = await prisma.message.findMany({
      where: { conversationId: p.conversation_id, role: "assistant" },
      select: { toolCalls: true },
    });
    for (const m of turnMsgs) {
      const tc = (m.toolCalls as Array<{ name: string }> | null) ?? [];
      for (const c of tc) {
        if (c?.name) toolCalls.push({ name: c.name, args: null });
      }
    }
    const c = classify({ evaluationId: p.id, conversationId: p.conversation_id, finalMessage, toolCalls });
    await prisma.conversationQualityEvaluation.update({
      where: { id: p.id },
      data: { status: c.status, razoes: c.razao, patterns: c.patterns, judgeVersion: "heuristica-v2-bloco5" },
    });
    totals[c.status]++;
  }
  console.log(`  CORRETO=${totals.CORRETO} PARCIAL=${totals.PARCIAL} ERRADO=${totals.ERRADO} FORA=${totals.FORA_DO_ESCOPO}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
