// src/lib/reports/__tests__/e2e/f4-baseline.e2e.ts
// F4 Apresentacao, Onda 1.5 , harness de baseline de KPIs (regressao).
//
// PROPOSITO: ANTES de migrar as tools (Onda 4), gravar os KPIs agregados das
// read-tools que JA tem formatador real (conjunto A, 27 tools de dado). Apos a
// migracao, este mesmo harness roda de novo e os KPIs precisam ser IDENTICOS
// (nenhuma regressao de numero). A migracao mexe em APRESENTACAO, nunca em
// numero , o baseline prova isso.
//
// [P]#8: serializa SOMENTE KPIs invariantes a paginacao (estado, _DESTAQUE,
// _agregado, total, kpis, contagem). NUNCA `linhas`/conteudo de linha (varia com
// paginacao e nao e o que estamos protegendo). As 73 tools que GANHAM KPI (set B)
// nao tem baseline aqui , sua validacao e E2E positivo x SELECT na Onda 4.
//
// Exclusoes do set A: registrar_lacuna (tool de sistema, sem KPI de dado) e
// bi_consulta_avancada (SQL dinamico, sem KPI fixo).
//
// USO: gravar (1x, antes de migrar):
//   E2E=1 BASELINE_WRITE=1 npx tsx --env-file=.env.local \
//     src/lib/reports/__tests__/e2e/f4-baseline.e2e.ts
// conferir (apos migrar, na Onda 6):
//   E2E=1 npx tsx --env-file=.env.local \
//     src/lib/reports/__tests__/e2e/f4-baseline.e2e.ts

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { catalogo } from "../../../../../mcp/catalog/index.js";
import { isWriteToolEntry, type ToolEntry } from "../../../../../mcp/catalog/types.js";
import { formatadorPorTool, ehFormatadorGenerico } from "../../../../../mcp/lib/responder.js";
import type { UserContext } from "../../../../../mcp/auth/user-context.js";

const BASELINE_PATH = join(
  process.cwd(),
  "src/lib/reports/__tests__/e2e/f4-baseline.json",
);

// Tools de sistema/dinamicas do set A que NAO entram no baseline de dado.
const EXCLUIR = new Set(["registrar_lacuna", "bi_consulta_avancada"]);

// Args representativos das tools que nao aceitam `{}` (valores reais do cache).
const ARGS: Record<string, Record<string, unknown>> = {
  cadastro_buscar_parceiro: { termo: "JHT" },
  contabil_estrutura_conta: { odooId: 4 },
  estoque_locais_por_produto: { termo: "1464" },
  comercial_pedido_historico_etapas: { pedidoId: 694 },
  comercial_detalhar_pedido: { odooId: 1295 },
};

// Chaves de KPI agregado, invariantes a paginacao. Tudo o resto (linhas,
// titulos, serie, ...) e descartado de proposito.
const KPI_KEYS = ["_DESTAQUE", "_agregado", "total", "kpis", "contagem", "topPorParticipante"];

// Campos VARIANTES de paginacao que vivem dentro de _DESTAQUE/_agregado e
// precisam ser removidos: mudam quando o default de paginacao muda (Onda 2:
// 10 -> 50) sem que nenhum KPI real tenha regredido. [P]#8.
const PAGINACAO_VARIANTES = new Set([
  "linhasExibidas",
  "amostraExibida",
  "exibidas",
  // agregados SO da pagina (nome "...Listados"): variam com a paginacao por
  // design; o agregado invariante e o "...Geral"/"total" sobre o conjunto.
  "valorTotalListados",
  "totalListados",
]);

function stripVariantes(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripVariantes);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (PAGINACAO_VARIANTES.has(k)) continue;
      out[k] = stripVariantes(val);
    }
    return out;
  }
  // Arredonda a 2 casas (centavos): somas grandes de moeda variam no ultimo
  // digito por ORDEM de soma (float), nao por regressao. Comparar a 2 casas
  // mantem a rede sensivel a mudanca real (>= 1 centavo) e estavel ao ruido.
  if (typeof v === "number" && Number.isFinite(v) && !Number.isInteger(v)) {
    return Math.round(v * 100) / 100;
  }
  return v;
}

function extrairKpis(envelope: unknown): Record<string, unknown> {
  if (!envelope || typeof envelope !== "object") return { estado: "<sem-envelope>" };
  const e = envelope as Record<string, unknown>;
  if (e.estado === "preparando") return { estado: "preparando" };
  const dados = (e.dados ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { estado: e.estado };
  for (const k of KPI_KEYS) {
    if (dados[k] !== undefined) out[k] = stripVariantes(dados[k]);
  }
  return out;
}

async function main() {
  if (process.env.E2E !== "1") {
    console.log("SKIP: defina E2E=1 para rodar o baseline contra o cache real.");
    return;
  }
  const escrever = process.env.BASELINE_WRITE === "1";

  const ctx = {
    prisma,
    user: { userId: "f4-baseline", role: "super_admin", domains: [] } as UserContext,
  };

  const setA = (catalogo as ToolEntry[])
    .filter((t) => !isWriteToolEntry(t))
    .filter((t) => !ehFormatadorGenerico(formatadorPorTool(t.id)))
    .filter((t) => !EXCLUIR.has(t.id))
    .sort((a, b) => a.id.localeCompare(b.id));

  const resultado: Record<string, unknown> = {};
  const erros: string[] = [];

  for (const tool of setA) {
    const args = ARGS[tool.id] ?? {};
    try {
      const parsed = tool.inputSchema.parse(args);
      const envelope = await tool.handler(parsed, ctx);
      resultado[tool.id] = extrairKpis(envelope);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      erros.push(`${tool.id}: ${msg}`);
      resultado[tool.id] = { erro: msg };
    }
  }

  const serial = JSON.stringify(resultado, null, 2) + "\n";

  if (escrever) {
    writeFileSync(BASELINE_PATH, serial);
    console.log(`BASELINE_GRAVADO ${setA.length} tools -> ${BASELINE_PATH}`);
  } else if (existsSync(BASELINE_PATH)) {
    const anterior = readFileSync(BASELINE_PATH, "utf8");
    if (anterior === serial) {
      console.log(`BASELINE_OK ${setA.length} tools , KPIs identicos ao snapshot.`);
    } else {
      console.error("BASELINE_DIVERGENTE , os KPIs mudaram em relacao ao snapshot.");
      console.error("Rode um diff de f4-baseline.json contra a saida atual.");
      process.exitCode = 1;
    }
  } else {
    console.log("Sem snapshot anterior. Rode com BASELINE_WRITE=1 para gravar.");
    console.log(serial);
  }

  if (erros.length > 0) {
    console.error(`\n${erros.length} tool(s) com erro:`);
    for (const e of erros) console.error("  " + e);
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
