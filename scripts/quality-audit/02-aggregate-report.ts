#!/usr/bin/env tsx
/**
 * Estagio 3 da auditoria: agrega todos os results e gera RELATORIO-FINAL.md.
 *
 * Le todos os arquivos docs/agent-quality-review/results/batch-*.json
 * Produz docs/agent-quality-review/RELATORIO-FINAL.md
 *
 * Spec: docs/agent-quality-review/AUDIT-SPEC.md §10
 */

import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/prisma";

interface TurnoEval {
  turnoId: string;
  status: "CORRETO" | "PARCIAL" | "ERRADO" | "FORA_DE_ESCOPO";
  patterns: string[];
  razao: string;
  sugestao_prompt: string | null;
}

interface BatchResult {
  batchId: string;
  evaluatedAt: string;
  totals: Record<string, number>;
  patterns: Record<string, number>;
  turnos: TurnoEval[];
}

const PATTERN_ACTIONS: Record<string, string> = {
  fluxo_tool_incompleto:
    "Adicionar regra no prompt: enumerar fluxos canonicos de encadeamento de tools (parceiro->notas, produto->preco, etc).",
  parametro_incompleto:
    "Revisar descricao das tools para enfatizar parametros obrigatorios. Adicionar exemplos no identity-base.",
  tool_errada:
    "Revisar descricao das tools confundidas; explicitar diferenciacao no prompt-mestre.",
  nao_usou_tool: "Endurecer regra: sempre consultar tool para perguntas sobre dado operacional.",
  tool_redundante: "Adicionar guardrail: quando tool X cobre, nao chamar Y.",
  placeholder_nao_substituido:
    "BUG DE CODIGO. Investigar template de freshness em mcp/lib/freshness.ts e/ou identity-base.ts.",
  gramatica_plural:
    "Adicionar regra de concordancia no prompt: 'Existe 1 X' vs 'Existem N X'.",
  formato_quebrado: "Reforcar regra de saida no prompt; exemplos de bom markdown.",
  resposta_truncada: "Verificar maxTokens do adapter LLM ativo.",
  dado_inventado:
    "Endurecer guardrail: 'Nunca responda numero/nome sem origem em tool retornada'.",
  entendeu_mal_termo: "Adicionar glossario do dominio no prompt (cliente vs fornecedor, etc).",
  erro_data: "Reforcar regra de data padrao (mes corrente, hoje, etc).",
  pergunta_ignorada: "Revisar prompt: agente pode estar seguindo template em vez de ler a pergunta.",
  pediu_clarificacao_desnecessaria:
    "Revisar regra existente sobre defaults; pode estar sendo ignorada. Adicionar exemplos novos.",
  recusa_indevida: "Revisar guardrails muito restritivos.",
  loop_clarificacao:
    "Adicionar regra: 'Depois de 1 clarificacao, assumir default razoavel e responder'.",
  limitacao_real_declarada: "(Acerto — agente honesto sobre limitacao real.)",
  acerto_modelo: "Preservar — exemplo de qualidade.",
  acerto_encadeamento: "Preservar — exemplo de encadeamento correto.",
  acerto_objetividade: "Preservar — exemplo de resposta enxuta.",
};

function loadAllResults(): BatchResult[] {
  const dir = resolve(process.cwd(), "docs/agent-quality-review/results");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith("batch-") && f.endsWith(".json"));
  } catch {
    console.error("[aggregate] diretorio results nao encontrado:", dir);
    process.exit(1);
  }
  console.log(`[aggregate] ${files.length} batches encontrados.`);

  const results: BatchResult[] = [];
  for (const f of files.sort()) {
    try {
      const data = JSON.parse(readFileSync(resolve(dir, f), "utf-8"));
      results.push(data);
    } catch (err) {
      console.warn(`[aggregate] falha ao ler ${f}:`, err);
    }
  }
  return results;
}

function findExample(
  results: BatchResult[],
  pattern: string,
): TurnoEval | null {
  for (const r of results) {
    const found = r.turnos.find((t) => t.patterns.includes(pattern));
    if (found) return found;
  }
  return null;
}

function clusterSuggestions(results: BatchResult[]): Map<string, { count: number; example: string }> {
  // Cluster simples por similaridade de prefixo + palavras-chave.
  // Pragmatico: agrupa por hash de palavras significativas (>3 chars).
  const clusters = new Map<string, { count: number; example: string; sigs: Set<string> }>();
  for (const r of results) {
    for (const t of r.turnos) {
      if (!t.sugestao_prompt) continue;
      const text = t.sugestao_prompt.trim();
      if (text.length === 0) continue;
      const tokens = (text.toLowerCase().match(/[a-záéíóúâêôãç]{4,}/g) ?? []).slice(0, 6);
      const key = tokens.sort().join("|");
      if (key.length === 0) continue;

      // Procura cluster proximo (overlap >= 60%).
      let best: string | null = null;
      let bestOverlap = 0;
      for (const [otherKey, c] of clusters) {
        const otherTokens = new Set(otherKey.split("|"));
        const overlap = tokens.filter((tk) => otherTokens.has(tk)).length / Math.max(1, tokens.length);
        if (overlap > bestOverlap && overlap >= 0.6) {
          bestOverlap = overlap;
          best = otherKey;
        }
      }
      if (best) {
        const c = clusters.get(best)!;
        c.count++;
        if (text.length < c.example.length) c.example = text; // mais curto = mais essencial
      } else {
        clusters.set(key, { count: 1, example: text, sigs: new Set(tokens) });
      }
    }
  }
  return new Map(Array.from(clusters.entries()).map(([k, v]) => [k, { count: v.count, example: v.example }]));
}

async function main() {
  const results = loadAllResults();

  // Totais
  const totals: Record<string, number> = {
    CORRETO: 0,
    PARCIAL: 0,
    ERRADO: 0,
    FORA_DE_ESCOPO: 0,
  };
  const patternCounts: Record<string, number> = {};
  let totalTurnos = 0;
  for (const r of results) {
    for (const t of r.turnos) {
      totals[t.status] = (totals[t.status] ?? 0) + 1;
      totalTurnos++;
      for (const p of t.patterns) {
        patternCounts[p] = (patternCounts[p] ?? 0) + 1;
      }
    }
  }

  // Ordena padroes por contagem.
  const patternsByCount = Object.entries(patternCounts).sort((a, b) => b[1] - a[1]);
  const failurePatterns = patternsByCount.filter(([p]) => !p.startsWith("acerto_") && p !== "limitacao_real_declarada");
  const successPatterns = patternsByCount.filter(([p]) => p.startsWith("acerto_"));

  // Bugs de codigo (sugestao_prompt null + pattern bug-like).
  const codeBugPatterns = new Set(["placeholder_nao_substituido", "resposta_truncada"]);
  const codeBugs = failurePatterns.filter(([p]) => codeBugPatterns.has(p));

  // Recomendacoes clusterizadas (top 10).
  const suggestionClusters = clusterSuggestions(results);
  const topSuggestions = Array.from(suggestionClusters.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Monta o relatorio.
  const lines: string[] = [];
  lines.push("# Relatorio Final da Auditoria de Qualidade — Agente Nex");
  lines.push("");
  lines.push(`> Gerado em ${new Date().toISOString()}`);
  lines.push(`> Spec: docs/agent-quality-review/AUDIT-SPEC.md`);
  lines.push("");

  lines.push("## 1. Sumario executivo");
  lines.push("");
  lines.push(`- **Turnos avaliados**: ${totalTurnos}`);
  lines.push(`- **Batches processados**: ${results.length}`);
  lines.push("");
  lines.push("| Status | Quantidade | % |");
  lines.push("|---|---|---|");
  for (const status of ["CORRETO", "PARCIAL", "ERRADO", "FORA_DE_ESCOPO"]) {
    const n = totals[status];
    const pct = totalTurnos > 0 ? ((n / totalTurnos) * 100).toFixed(1) : "0";
    lines.push(`| ${status} | ${n} | ${pct}% |`);
  }
  lines.push("");

  const taxaAcerto = totalTurnos > 0 ? ((totals.CORRETO / totalTurnos) * 100).toFixed(1) : "0";
  lines.push(`**Taxa de acerto: ${taxaAcerto}%**`);
  lines.push("");

  lines.push("## 2. Top 10 padroes de falha");
  lines.push("");
  const top10 = failurePatterns.slice(0, 10);
  if (top10.length === 0) {
    lines.push("_(nenhum padrao de falha registrado)_");
  } else {
    for (let i = 0; i < top10.length; i++) {
      const [pattern, count] = top10[i];
      const pct = totalTurnos > 0 ? ((count / totalTurnos) * 100).toFixed(1) : "0";
      const example = findExample(results, pattern);
      const action = PATTERN_ACTIONS[pattern] ?? "(sem acao mapeada)";
      lines.push(`### #${i + 1} \`${pattern}\` — ${count} turnos (${pct}%)`);
      lines.push("");
      lines.push(`**Acao:** ${action}`);
      lines.push("");
      if (example) {
        lines.push(`**Exemplo (turnoId ${example.turnoId}):** ${example.razao}`);
        lines.push("");
      }
    }
  }

  lines.push("## 3. Acertos a preservar");
  lines.push("");
  if (successPatterns.length === 0) {
    lines.push("_(nenhum acerto tagueado explicitamente; revisar criterio de tag em CORRETO)_");
  } else {
    for (const [pattern, count] of successPatterns.slice(0, 5)) {
      const pct = ((count / totalTurnos) * 100).toFixed(1);
      const example = findExample(results, pattern);
      lines.push(`- \`${pattern}\` — ${count} turnos (${pct}%)`);
      if (example) lines.push(`  - Exemplo: ${example.razao}`);
    }
  }
  lines.push("");

  lines.push("## 4. Bugs de codigo detectados");
  lines.push("");
  if (codeBugs.length === 0) {
    lines.push("_Nenhum bug de codigo identificado nas tags._");
  } else {
    lines.push("Estes itens **NAO se resolvem com prompt** — precisam de fix em codigo:");
    lines.push("");
    for (const [pattern, count] of codeBugs) {
      const pct = ((count / totalTurnos) * 100).toFixed(1);
      lines.push(`- \`${pattern}\` (${count} turnos · ${pct}%) — ${PATTERN_ACTIONS[pattern]}`);
    }
  }
  lines.push("");

  lines.push("## 5. Gaps de produto (FORA_DE_ESCOPO)");
  lines.push("");
  if (totals.FORA_DE_ESCOPO === 0) {
    lines.push("_Nenhum gap detectado._");
  } else {
    const gapTurnos: TurnoEval[] = [];
    for (const r of results) {
      for (const t of r.turnos) {
        if (t.status === "FORA_DE_ESCOPO") gapTurnos.push(t);
      }
    }
    lines.push(`Total: ${gapTurnos.length} turnos em ${totals.FORA_DE_ESCOPO}.`);
    lines.push("");
    lines.push("**Exemplos:**");
    for (const t of gapTurnos.slice(0, 8)) {
      lines.push(`- ${t.razao}`);
    }
  }
  lines.push("");

  lines.push("## 6. Top recomendacoes de mudanca de prompt (clusterizadas)");
  lines.push("");
  if (topSuggestions.length === 0) {
    lines.push("_Nenhuma sugestao concreta registrada._");
  } else {
    for (let i = 0; i < topSuggestions.length; i++) {
      const s = topSuggestions[i];
      lines.push(`### #${i + 1} (mencionada em ${s.count} turnos)`);
      lines.push("");
      lines.push(`> ${s.example}`);
      lines.push("");
    }
  }

  lines.push("## 7. Recomendacoes priorizadas (por impacto)");
  lines.push("");
  lines.push("Ordenado por `quantidade × severidade`. Severidades:");
  lines.push("- **ALTA**: tool_errada, dado_inventado, pergunta_ignorada, loop_clarificacao");
  lines.push("- **MEDIA**: fluxo_tool_incompleto, parametro_incompleto, pediu_clarificacao_desnecessaria");
  lines.push("- **BAIXA**: gramatica_plural, formato_quebrado");
  lines.push("- **BUG**: placeholder_nao_substituido, resposta_truncada");
  lines.push("");
  const SEVERITY: Record<string, { level: "ALTA" | "MEDIA" | "BAIXA" | "BUG"; weight: number }> = {
    tool_errada: { level: "ALTA", weight: 3 },
    dado_inventado: { level: "ALTA", weight: 3 },
    pergunta_ignorada: { level: "ALTA", weight: 3 },
    loop_clarificacao: { level: "ALTA", weight: 3 },
    fluxo_tool_incompleto: { level: "MEDIA", weight: 2 },
    parametro_incompleto: { level: "MEDIA", weight: 2 },
    pediu_clarificacao_desnecessaria: { level: "MEDIA", weight: 2 },
    nao_usou_tool: { level: "MEDIA", weight: 2 },
    tool_redundante: { level: "MEDIA", weight: 2 },
    entendeu_mal_termo: { level: "MEDIA", weight: 2 },
    erro_data: { level: "MEDIA", weight: 2 },
    recusa_indevida: { level: "ALTA", weight: 3 },
    placeholder_nao_substituido: { level: "BUG", weight: 2 },
    resposta_truncada: { level: "BUG", weight: 2 },
    gramatica_plural: { level: "BAIXA", weight: 1 },
    formato_quebrado: { level: "BAIXA", weight: 1 },
  };
  const prioritized = failurePatterns
    .map(([p, c]) => ({
      pattern: p,
      count: c,
      level: SEVERITY[p]?.level ?? "MEDIA",
      impact: c * (SEVERITY[p]?.weight ?? 2),
    }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 10);
  lines.push("| # | Padrao | Severidade | Turnos | Impacto | Acao |");
  lines.push("|---|---|---|---|---|---|");
  for (let i = 0; i < prioritized.length; i++) {
    const p = prioritized[i];
    lines.push(
      `| ${i + 1} | \`${p.pattern}\` | ${p.level} | ${p.count} | ${p.impact} | ${PATTERN_ACTIONS[p.pattern] ?? "(sem mapa)"} |`,
    );
  }
  lines.push("");

  lines.push("## 8. Proximos passos");
  lines.push("");
  lines.push("1. Revisar este relatorio.");
  lines.push("2. Marcar quais recomendacoes da §7 voce aceita.");
  lines.push("3. Em sessao seguinte: aplicar mudancas aceitas em identity-base.ts / compose.ts / tools.");
  lines.push("4. Re-rodar a auditoria contra conversas POS-mudanca para comparar taxa de acerto.");
  lines.push("");

  const outPath = resolve(process.cwd(), "docs/agent-quality-review/RELATORIO-FINAL.md");
  writeFileSync(outPath, lines.join("\n"));
  console.log(`[aggregate] relatorio gravado em ${outPath}`);
  console.log(`[aggregate] taxa de acerto: ${taxaAcerto}% (${totals.CORRETO} de ${totalTurnos})`);

  // Grava no banco para a tela /agente/inteligencia mostrar os mesmos dados.
  await persistToDatabase(results, topSuggestions, prioritized);
}

async function persistToDatabase(
  results: BatchResult[],
  topSuggestions: Array<{ count: number; example: string }>,
  prioritized: Array<{ pattern: string; count: number; level: string; impact: number }>,
) {
  console.log("[aggregate] persistindo no banco...");

  // 1. ConversationQualityEvaluation por turno
  let savedEvals = 0;
  for (const r of results) {
    for (const t of r.turnos) {
      // Mapeia o status para a estrutura existente (aderencia 1-5).
      // Estrategia: convertemos status -> aderencia aproximada.
      const aderencia =
        t.status === "CORRETO" ? 5 :
        t.status === "PARCIAL" ? 3 :
        t.status === "ERRADO" ? 1 :
        null; // FORA_DE_ESCOPO

      try {
        // Verifica se a Message ainda existe (pode ter sido deletada por cascade).
        const msg = await prisma.message.findUnique({
          where: { id: t.turnoId },
          select: { id: true, conversationId: true },
        });
        if (!msg) continue;

        await prisma.conversationQualityEvaluation.upsert({
          where: { assistantMessageId: t.turnoId },
          create: {
            conversationId: msg.conversationId,
            assistantMessageId: t.turnoId,
            judgeModel: "claude-code-subagent",
            judgeVersion: "v1-2026-05",
            aderencia,
            correcaoFactual: null, // nao avaliamos sem tool_results historicos
            escolhaDeTools: aderencia,
            clareza: aderencia,
            razoes: t.razao,
            recomendacaoPrompt: t.sugestao_prompt,
            flags: [t.status, ...t.patterns],
          },
          update: {
            judgeModel: "claude-code-subagent",
            judgeVersion: "v1-2026-05",
            aderencia,
            escolhaDeTools: aderencia,
            clareza: aderencia,
            razoes: t.razao,
            recomendacaoPrompt: t.sugestao_prompt,
            flags: [t.status, ...t.patterns],
          },
        });
        savedEvals++;
      } catch (err) {
        console.warn(`[aggregate] falha ao salvar eval turno ${t.turnoId}:`, err);
      }
    }
  }
  console.log(`[aggregate] ${savedEvals} avaliacoes upsertadas em conversation_quality_evaluations.`);

  // 2. PromptRecommendation por cluster textual
  let savedRecs = 0;
  for (const s of topSuggestions) {
    const clusterKey = hashStr(s.example);
    try {
      await prisma.promptRecommendation.upsert({
        where: { clusterKey },
        create: {
          clusterKey,
          consolidatedText: s.example,
          occurrences: s.count,
          status: "pending",
        },
        update: {
          occurrences: s.count,
        },
      });
      savedRecs++;
    } catch (err) {
      console.warn(`[aggregate] falha ao salvar recomendacao:`, err);
    }
  }
  console.log(`[aggregate] ${savedRecs} recomendacoes em prompt_recommendations.`);

  await prisma.$disconnect();
}

function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

main().catch((err) => {
  console.error("[aggregate] erro:", err);
  process.exit(1);
});
