#!/usr/bin/env tsx
/**
 * T-36 (Ronda 3): Smoke test pre-bateria. Chama cada tool MCP de leitura
 * com input minimo valido (mostly vazio/defaults) e valida:
 *   - estado === "ok" | "vazio" (nao "erro")
 *   - envelope.dados._RESPOSTA preenchido (string nao-vazia) se estado=ok
 *   - JSON.stringify(envelope) <= 24KB
 *   - Se >24KB, marca como "GRANDE" e lista os campos canonicos disponiveis
 *
 * SAIDA: imprime tabela; exit code 1 se alguma tool quebrar (nao retornar
 * estado=ok/vazio). Bateria 03-run-test-questions deve abortar nesse caso.
 *
 * USAGE: npx tsx scripts/quality-audit/tool-smoke-test.ts
 */

import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { catalogo } from "../../mcp/catalog/index.js";

const adapter = new PrismaPg({ connectionString: process.env.MCP_DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MAX_BYTES = 24576;

// Tools de escrita / sistema que nao fazem sentido em smoke read-only.
// SKIP detecta tanto IDs com ponto (cadastros.res_partner.*) quanto IDs
// snake_case (crm_lead_create).
const SKIP_PATTERNS: RegExp[] = [
  /^registrar_lacuna$/,
  /^bi_consulta_avancada$/,
  // CRM writes
  /^crm_lead_(create|update|archive)$/,
  // Escritas via Odoo JSON-RPC (precisam de Odoo client, fora do smoke local)
  /^cadastros\.(mail_activity|res_partner|res_partner_category)\./,
  /^crm\.res_partner\./,
];
function shouldSkip(id: string): boolean {
  return SKIP_PATTERNS.some((re) => re.test(id));
}

interface SmokeRow {
  toolId: string;
  status: "OK" | "VAZIO" | "ERRO" | "GRANDE" | "SEM_RESPOSTA";
  bytes: number;
  resposta: string;
  detail?: string;
}

async function sampleContaId(): Promise<number> {
  try {
    const row = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT odoo_id::int AS id FROM fato_conta_contabil LIMIT 1
    `;
    return row[0]?.id ?? 1;
  } catch {
    return 1;
  }
}

async function sampleParceiroId(): Promise<number> {
  try {
    const row = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT odoo_id::int AS id FROM fato_parceiro LIMIT 1
    `;
    return row[0]?.id ?? 1;
  } catch {
    return 1;
  }
}

async function main() {
  const rows: SmokeRow[] = [];
  let temFalha = false;

  for (const entry of catalogo) {
    if (shouldSkip(entry.id)) continue;
    const t0 = Date.now();
    try {
      const ctx = { prisma, role: "super_admin" as const, userId: "smoke-test" };
      // Tenta com input vazio. Se schema exige algo, captura ZodError.
      let result: unknown;
      // Inputs por tool ID quando precisa de identificador especifico do banco.
      const idsDeAmostra: Record<string, Record<string, unknown>> = {
        contabil_estrutura_conta: { odooId: await sampleContaId() },
        cadastro_detalhar_parceiro: { odooId: await sampleParceiroId() },
        crm_lead_detail: { odooId: 1 },
      };
      const inputCandidatos: Array<Record<string, unknown>> = [
        idsDeAmostra[entry.id] ?? {},
        { termo: "ltda", limite: 5 },
        {},
      ];
      let lastErr = "";
      for (const inp of inputCandidatos) {
        try {
          result = await entry.handler(inp as never, ctx as never);
          lastErr = "";
          break;
        } catch (e: unknown) {
          lastErr = e instanceof Error ? e.message : String(e);
        }
      }
      if (lastErr) {
        rows.push({ toolId: entry.id, status: "ERRO", bytes: 0, resposta: "", detail: lastErr.slice(0, 100) });
        temFalha = true;
        continue;
      }

      const json = JSON.stringify(result);
      const bytes = Buffer.byteLength(json, "utf8");
      const r = result as {
        estado?: string;
        dados?: Record<string, unknown>;
        mensagem?: string;
        operado?: boolean;
      };
      // T-37: tools `*_status_dominio` retornam direto { dominio, operado, mensagem }
      // sem o wrapper { estado, dados }. Tratamos como OK se tem mensagem.
      if (r.operado === false && typeof r.mensagem === "string") {
        rows.push({ toolId: entry.id, status: "OK", bytes, resposta: r.mensagem.slice(0, 80) });
        continue;
      }
      if (r.estado === "preparando") {
        rows.push({ toolId: entry.id, status: "VAZIO", bytes, resposta: "(preparando)" });
        continue;
      }
      if (r.estado === "vazio") {
        const resp = String(r.dados?._RESPOSTA ?? "");
        rows.push({ toolId: entry.id, status: "VAZIO", bytes, resposta: resp.slice(0, 80) });
        continue;
      }
      if (r.estado !== "ok") {
        rows.push({ toolId: entry.id, status: "ERRO", bytes, resposta: "", detail: `estado=${r.estado}` });
        temFalha = true;
        continue;
      }
      const respCurada = String(r.dados?._RESPOSTA ?? "");
      const status: SmokeRow["status"] =
        respCurada.length === 0 ? "SEM_RESPOSTA" : bytes > MAX_BYTES ? "GRANDE" : "OK";
      rows.push({
        toolId: entry.id,
        status,
        bytes,
        resposta: respCurada.slice(0, 80),
        detail: status === "GRANDE" ? `${bytes - MAX_BYTES} bytes acima` : undefined,
      });
      if (status === "SEM_RESPOSTA" || status === "GRANDE") {
        // Nao bloqueia bateria (smart truncation cobre), so marca atencao
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      rows.push({ toolId: entry.id, status: "ERRO", bytes: 0, resposta: "", detail: msg.slice(0, 100) });
      temFalha = true;
    }
  }

  // Imprime tabela
  console.log("\n=== SMOKE TEST DE TOOLS MCP ===\n");
  const padId = Math.max(...rows.map((r) => r.toolId.length));
  const padStatus = 14;
  console.log(`${"TOOL".padEnd(padId)}  ${"STATUS".padEnd(padStatus)}  BYTES   _RESPOSTA / DETAIL`);
  console.log("-".repeat(padId + padStatus + 80));
  for (const r of rows) {
    const tag = r.status === "OK" ? "OK" : r.status === "VAZIO" ? "VAZIO" : r.status === "ERRO" ? "ERRO" : r.status;
    const line = `${r.toolId.padEnd(padId)}  ${tag.padEnd(padStatus)}  ${String(r.bytes).padStart(5)}   ${r.detail ? "[" + r.detail + "] " : ""}${r.resposta}`;
    console.log(line);
  }
  // Resumo
  const por: Record<string, number> = { OK: 0, VAZIO: 0, ERRO: 0, GRANDE: 0, SEM_RESPOSTA: 0 };
  for (const r of rows) por[r.status]++;
  console.log("\n=== RESUMO ===");
  console.log(`Total: ${rows.length} tools testadas`);
  console.log(`OK:           ${por.OK}`);
  console.log(`VAZIO:        ${por.VAZIO}`);
  console.log(`GRANDE:       ${por.GRANDE}  (envelope > 24KB; smart truncation cobre)`);
  console.log(`SEM_RESPOSTA: ${por.SEM_RESPOSTA}  (estado=ok mas sem _RESPOSTA)`);
  console.log(`ERRO:         ${por.ERRO}  (BLOQUEANTE)`);

  await prisma.$disconnect();
  if (temFalha) {
    console.error("\n!! Smoke test FALHOU. Corrija as tools com ERRO antes de disparar bateria !!");
    process.exit(1);
  }
  console.log("\n[OK] Smoke test passou. Pode disparar bateria.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
