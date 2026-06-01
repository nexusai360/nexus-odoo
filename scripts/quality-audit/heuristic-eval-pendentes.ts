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
// Primeiro import: carrega .env.local antes de @/lib/prisma (ver load-env.ts).
import "./load-env";
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
  // T-28 (Ronda 1): so eh lacuna PURA quando registrar_lacuna foi a UNICA tool
  // (ou as outras tools sao apenas estruturais como detalhar_parceiro sem
  // resultado factual). Se houve tool de dado factual (financeiro_*, fiscal_*,
  // estoque_*, comercial_*, contabil_*, cadastro_*) ANTES do registrar_lacuna,
  // o turno e ERRADO (lacuna prematura) ou CORRETO (resposta apesar da lacuna).
  const TOOLS_FACTUAIS_REGEX = /^(financeiro|fiscal|estoque|comercial|contabil|cadastro)_/;
  const toolsFactuais = toolNames.filter((n) => TOOLS_FACTUAIS_REGEX.test(n));
  const ehLacunaPura = ehLacuna && toolsFactuais.length === 0;
  const ehLacunaPrematura = ehLacuna && toolsFactuais.length > 0;
  const semTool = t.toolCalls.length === 0;

  // T-30 (Ronda 1.5): distinguir respostasNegativas (recusa indevida)
  // de §10b cumprida ("nao ha X no periodo") e §12b cumprida (clarificacao).
  // Sem essa distincao a heuristica conta vitorias como derrota.
  const respostaNaoHa =
    /\bn[aã]o\s+h[áa]\s+\w/.test(msg) || // "Nao ha despesa", "Nao ha titulos"
    /\bn[aã]o\s+encontrei\s+registros\b/.test(msg) ||
    /\btotal\s+vencido:\s*r\$\s*0,?0?0?\b/.test(msg); // "Total vencido: R$ 0,00 em 0 titulos"
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

  // T-30: §10b cumprida = CORRETO (tool retornou vazio, agente disse "Nao ha X").
  if (!semTool && respostaNaoHa && !respostasNegativas) {
    return {
      status: "CORRETO",
      razao: "Heuristica: §10b cumprida (tool vazia traduzida como 'Nao ha X').",
      patterns: ["acerto_estado_vazio"],
    };
  }

  // T-30: §12b cumprida = CORRETO (pergunta ambigua/sem sentido, agente clarificou).
  if (semTool && respostaClarificacao) {
    return {
      status: "CORRETO",
      razao: "Heuristica: §12b cumprida (clarificacao para pergunta ambigua).",
      patterns: ["acerto_clarificacao"],
    };
  }

  // Lacuna PURA + resposta honesta = FORA_DO_ESCOPO legitimo.
  if (ehLacunaPura && respostasNegativas) {
    return {
      status: "FORA_DO_ESCOPO",
      razao: "Heuristica: registrar_lacuna unica tool + resposta honesta sobre limitacao.",
      patterns: ["limitacao_real_declarada"],
    };
  }

  // Lacuna PREMATURA: houve tool factual antes, mas agente registrou lacuna.
  // Se a resposta cita numero/dado: provavelmente CORRETO (deixa pro classifier
  // adiante decidir). Se nao: ERRADO.
  if (ehLacunaPrematura && respostasNegativas && !hasNumeros && !hasMonetario) {
    return {
      status: "ERRADO",
      razao: "Heuristica: lacuna prematura (havia tool factual antes) + recusa sem dado.",
      patterns: ["lacuna_prematura", "recusa_indevida"],
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
    "[AUDIT-POS-2026-05-31T18-18-13]", // R24
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
