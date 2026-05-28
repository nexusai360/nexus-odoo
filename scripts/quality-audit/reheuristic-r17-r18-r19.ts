#!/usr/bin/env tsx
/**
 * T6 (Ronda 3): re-aplica a heuristica atualizada (§10b/§12b + lacuna
 * prematura) nos turnos historicos das R17/R18/R19. O painel passa a
 * refletir numeros coerentes em todas as rodadas.
 *
 * NAO toca turnos que ja foram reclassificados manualmente (status
 * com pattern auditoria_manual_reclassificacao).
 */
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Status = "CORRETO" | "PARCIAL" | "ERRADO" | "FORA_DO_ESCOPO";

const MARKERS = [
  "[AUDIT-POS-2026-05-27T15-10-40]", // R17
  "[AUDIT-POS-2026-05-27T16-16-15]", // R18
  "[AUDIT-POS-2026-05-27T21-50-50]", // R19
];

function classify(
  finalMessage: string,
  toolNames: string[],
): { status: Status; razao: string; patterns: string[] } {
  const msg = (finalMessage || "").toLowerCase();
  const hasNumeros = /\d[\d.,]*/.test(finalMessage || "");
  const hasMonetario = /r\$/i.test(finalMessage || "");
  const ehLacuna = toolNames.includes("registrar_lacuna");
  const TOOLS_FACTUAIS = /^(financeiro|fiscal|estoque|comercial|contabil|cadastro)_/;
  const toolsFactuais = toolNames.filter((n) => TOOLS_FACTUAIS.test(n));
  const ehLacunaPura = ehLacuna && toolsFactuais.length === 0;
  const ehLacunaPrematura = ehLacuna && toolsFactuais.length > 0;
  const semTool = toolNames.length === 0;

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
    (/n[aã]o (consegui|encontrei|tenho|est[áa]|temos)|fora do meu (escopo|alcance)|n[aã]o (dispon[íi]vel|posso|sei)/.test(
      msg,
    ) ||
      /lista\s+veio\s+(truncad|cortad|parcial)/.test(msg) ||
      /sem\s+o?\s*total\s+(consolidad|fechad)/.test(msg));

  if (!semTool && respostaNaoHa && !respostasNegativas) {
    return { status: "CORRETO", razao: "Heuristica: §10b cumprida.", patterns: ["acerto_estado_vazio"] };
  }
  if (semTool && respostaClarificacao) {
    return { status: "CORRETO", razao: "Heuristica: §12b cumprida.", patterns: ["acerto_clarificacao"] };
  }
  if (ehLacunaPura && respostasNegativas) {
    return { status: "FORA_DO_ESCOPO", razao: "Heuristica: lacuna pura + recusa.", patterns: ["limitacao_real_declarada"] };
  }
  const recusaExplicitaComDado =
    /lista\s+veio\s+(truncad|cortad|parcial)/.test(msg) ||
    /sem\s+o?\s*total\s+(consolidad|fechad)/.test(msg) ||
    /n[aã]o\s+(consegui\s+(consolidar|fechar|separar|obter))/.test(msg);
  if (toolsFactuais.length > 0 && recusaExplicitaComDado) {
    return { status: "ERRADO", razao: "Heuristica: tool factual + recusa explicita.", patterns: ["recusa_com_dado"] };
  }
  if (ehLacunaPrematura && respostasNegativas && !hasNumeros && !hasMonetario) {
    return { status: "ERRADO", razao: "Heuristica: lacuna prematura + recusa sem dado.", patterns: ["lacuna_prematura"] };
  }
  if (semTool && finalMessage && finalMessage.length > 30 && !respostasNegativas && !respostaClarificacao) {
    return { status: "ERRADO", razao: "Heuristica: resposta sem tool quando dado operacional foi pedido.", patterns: ["nao_usou_tool"] };
  }
  if (!semTool && respostasNegativas) {
    return { status: "PARCIAL", razao: "Heuristica: tool chamada mas resposta declarou nao consegui.", patterns: ["resposta_truncada"] };
  }
  if (!semTool && (hasNumeros || hasMonetario) && (finalMessage || "").length > 20) {
    return { status: "CORRETO", razao: "Heuristica: tool retornou + resposta com dado quantitativo.", patterns: ["acerto_objetividade"] };
  }
  return { status: "PARCIAL", razao: "Heuristica: classificacao incerta.", patterns: ["heuristica_incerta"] };
}

async function main() {
  for (const marker of MARKERS) {
    const rows = await prisma.$queryRaw<
      Array<{ id: string; conversation_id: string; assistant_message_id: string | null; patterns: string[] }>
    >`
      SELECT e.id, e.conversation_id, e.assistant_message_id, e.patterns
      FROM conversation_quality_evaluations e
      JOIN conversations c ON c.id = e.conversation_id
      WHERE c.title LIKE ${"%" + marker + "%"}
    `;
    let mudancas = 0;
    const totais: Record<string, number> = { CORRETO: 0, PARCIAL: 0, ERRADO: 0, FORA_DO_ESCOPO: 0 };
    for (const r of rows) {
      // Pula se ja foi reclassificado manualmente
      if ((r.patterns ?? []).includes("auditoria_manual_reclassificacao")) {
        continue;
      }
      let finalMessage = "";
      if (r.assistant_message_id) {
        const a = await prisma.message.findUnique({
          where: { id: r.assistant_message_id },
          select: { content: true },
        });
        finalMessage = a?.content ?? "";
      }
      const msgs = await prisma.message.findMany({
        where: { conversationId: r.conversation_id, role: "assistant" },
        select: { toolCalls: true },
      });
      const toolNames: string[] = [];
      for (const m of msgs) {
        const tc = (m.toolCalls as Array<{ name: string }> | null) ?? [];
        for (const c of tc) if (c?.name) toolNames.push(c.name);
      }
      const c = classify(finalMessage, toolNames);
      totais[c.status]++;
      mudancas++;
      await prisma.conversationQualityEvaluation.update({
        where: { id: r.id },
        data: { status: c.status, razoes: c.razao, patterns: c.patterns, judgeVersion: "heuristica-v3-bloco5" },
      });
    }
    console.log(`[${marker}] aplicado em ${mudancas} turnos -> CORRETO=${totais.CORRETO} PARCIAL=${totais.PARCIAL} ERRADO=${totais.ERRADO} FORA=${totais.FORA_DO_ESCOPO}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
