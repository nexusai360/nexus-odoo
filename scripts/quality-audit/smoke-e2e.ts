#!/usr/bin/env tsx
/**
 * Smoke E2E pos-Bloco A: 5 perguntas representativas dos 5 fixes.
 * Spec: docs/superpowers/research/2026-05-27-pos-r17-review-plano.md §Bloco B
 */
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/agent/run-agent";

const PERGUNTAS = [
  { id: "S1_top10", q: "Top 10 maiores contas a receber abertas", esperado: "lista 10 com R$, sem (atualizado ha X), sem [[suggestions]]" },
  { id: "S2_vencidos_hoje", q: "Títulos que vencem hoje", esperado: "só os que vencem hoje (não acumulado de atrasados)" },
  { id: "S3_quais_notas", q: "Quais notas?", esperado: "Não entendi sua pergunta + 3 reinterpretações" },
  { id: "S4_meta", q: "Vai bater a meta esse mês?", esperado: "registrar_lacuna response limpa, sem [[suggestions]] vazando" },
  { id: "S5_saldo_estoque", q: "Saldo total em estoque", esperado: "valor sem (atualizado ha X)" },
];

async function main() {
  const user = await prisma.user.findFirst({
    where: { platformRole: "super_admin", isActive: true },
    select: { id: true, email: true },
  });
  if (!user) { console.error("super_admin nao encontrado"); process.exit(1); }
  console.log(`smoke E2E user=${user.email}`);

  const marker = `[SMOKE-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}]`;
  console.log(`marker: ${marker}\n`);

  for (const p of PERGUNTAS) {
    const conv = await prisma.conversation.create({
      data: { userId: user.id, channel: "in_app", title: `${marker} ${p.q.slice(0, 60)}` },
      select: { id: true },
    });
    const t0 = Date.now();
    try {
      const r = await runAgent({
        conversationId: conv.id,
        userId: user.id,
        userMessage: p.q,
        channel: "in_app",
        isPlayground: false,
      });
      const dur = Date.now() - t0;
      console.log(`\n=== ${p.id} (${dur}ms) ===`);
      console.log(`Q: ${p.q}`);
      console.log(`A: ${r.ok ? r.message : "FAIL: " + JSON.stringify(r)}`);
      console.log(`Esperado: ${p.esperado}`);

      // Checks automáticos
      if (r.ok) {
        const issues: string[] = [];
        if (/atualizado h[áa] \d+/i.test(r.message)) issues.push("FRESHNESS_VAZOU");
        if (/\[\[suggestions\]\]/.test(r.message)) issues.push("CANAL_SUGGESTIONS_VAZOU");
        if (p.id === "S1_top10" && !/R\$/.test(r.message)) issues.push("S1_SEM_VALORES_R$");
        if (p.id === "S3_quais_notas" && !/(n[ãa]o entendi|você quer saber|esclarec)/i.test(r.message)) issues.push("S3_NAO_PEDIU_ESCLARECIMENTO");
        if (issues.length > 0) console.log(`⚠️  ISSUES: ${issues.join(", ")}`);
        else console.log(`✅ OK`);
      }
    } catch (err) {
      console.error(`ERR: ${(err as Error).message}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((err) => { console.error(err); process.exit(1); });
