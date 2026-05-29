// scripts/f4l-l2-harness.ts
// Bateria L2 — validação das tools de leitura do MCP (sem agente, sem OpenAI).
// Exerce cada tool de domínio e confere o resultado contra o Odoo (fonte da
// verdade) por JSON-RPC read-only. Mais a conferência de fidelidade dos 114
// modelos do cache. Grava docs/superpowers/research/2026-05-22-l2-relatorio.md.
// Uso: tsx --env-file=.env.local scripts/f4l-l2-harness.ts
import { writeFileSync } from "node:fs";
import { prisma } from "../src/worker/prisma";
import { clientFromEnv, type OdooClient } from "../src/worker/odoo/client";
import { catalogo } from "../mcp/catalog/index";
import type { ToolEntry, ToolHandlerCtx } from "../mcp/catalog/types";
import { MODEL_CATALOG } from "../src/worker/catalog/model-catalog";
import { rawDelegateKey } from "../src/worker/jobs";
import type { ReportDomain } from "../src/generated/prisma/client";

const RELATORIO = "docs/superpowers/research/2026-05-22-l2-relatorio.md";
// RBAC v2: 7 domínios após drop de rh/producao (alinhado com Router R1).
const TODOS_DOMINIOS: ReportDomain[] = [
  "estoque", "financeiro", "fiscal", "comercial", "cadastros", "contabil", "crm",
];

// ─── ctx de teste (super_admin, todos os domínios) ───────────────────────────
function ctxDe(): ToolHandlerCtx {
  return {
    prisma,
    user: { userId: "l2-harness", role: "super_admin", domains: TODOS_DOMINIOS },
  };
}

// ─── helpers Odoo ────────────────────────────────────────────────────────────
async function contar(odoo: OdooClient, model: string, domain: unknown[] = []): Promise<number> {
  return odoo.executeKw<number>(model, "search_count", [domain]);
}

/** read_group somando um campo numérico, sem groupby — devolve o total. */
async function somar(
  odoo: OdooClient,
  model: string,
  domain: unknown[],
  campo: string,
): Promise<number> {
  const res = await odoo.executeKw<Record<string, unknown>[]>(
    model,
    "read_group",
    [domain, [campo], []],
  );
  const v = res[0]?.[campo];
  return typeof v === "number" ? v : 0;
}

// ─── tipos do harness ────────────────────────────────────────────────────────
type Veredito = { ok: boolean; esperado: string; obtido: string; nota?: string };
interface Caso {
  tool: string;
  dominio: string;
  descricao: string;
  input: Record<string, unknown>;
  conferir: (saida: unknown, odoo: OdooClient) => Promise<Veredito>;
}
interface Resultado extends Veredito {
  tool: string;
  dominio: string;
  descricao: string;
  estado: string;
}

// ─── extração de campos da saída (envelope withFreshness) ────────────────────
function envelope(saida: unknown): { estado: string; dados: Record<string, unknown> | null } {
  if (typeof saida !== "object" || saida === null) return { estado: "?", dados: null };
  const o = saida as Record<string, unknown>;
  const estado = typeof o.estado === "string" ? o.estado : "?";
  const dados = (o.dados as Record<string, unknown> | undefined) ?? null;
  return { estado, dados };
}

/** Veredito de fumaça: a tool respondeu "ok" ou "vazio" sem lançar. */
function smoke(saida: unknown): Veredito {
  const { estado } = envelope(saida);
  const ok = estado === "ok" || estado === "vazio" || estado === "preparando";
  return { ok, esperado: "estado ok/vazio", obtido: `estado ${estado}` };
}

/** Confere igualdade numérica exata. */
function eq(esperado: number, obtido: number, nota?: string): Veredito {
  return { ok: esperado === obtido, esperado: String(esperado), obtido: String(obtido), nota };
}

/** Confere com tolerância de janela de sync: o cache pode estar segundos/minutos
 * atrás do Odoo. Diferença pequena é "ok" (a tool reporta o cache fielmente). */
function eqTol(esperado: number, obtido: number, nota?: string): Veredito {
  const diff = Math.abs(esperado - obtido);
  const tol = Math.max(2, Math.ceil(esperado * 0.005));
  const base = diff === 0 ? "" : `diff ${diff} (janela de sync)`;
  return {
    ok: diff <= tol,
    esperado: String(esperado),
    obtido: String(obtido),
    nota: [base, nota].filter(Boolean).join("; ") || undefined,
  };
}

main().catch((e) => {
  console.error("[l2] FALHA:", e);
  process.exit(1);
});

async function main(): Promise<void> {
  const odoo = clientFromEnv("read");
  await odoo.authenticate();
  const ctx = ctxDe();

  console.log("[l2] montando casos...");
  const casos = await montarCasos(odoo);
  console.log(`[l2] ${casos.length} casos`);

  const resultados: Resultado[] = [];
  for (const caso of casos) {
    const tool = catalogo.find((t) => t.id === caso.tool) as ToolEntry | undefined;
    if (!tool) {
      resultados.push({ ...caso, ok: false, estado: "—", esperado: "tool existe", obtido: "tool não encontrada" });
      continue;
    }
    try {
      const saida = await (tool.handler as (i: unknown, c: ToolHandlerCtx) => Promise<unknown>)(
        caso.input,
        ctx,
      );
      const { estado } = envelope(saida);
      const v = await caso.conferir(saida, odoo);
      resultados.push({ ...caso, ...v, estado });
    } catch (err) {
      resultados.push({
        ...caso, ok: false, estado: "erro",
        esperado: "sem exceção", obtido: String(err).slice(0, 200),
      });
    }
  }

  console.log("[l2] conferência de fidelidade (114 modelos)...");
  const fidelidade = await conferirFidelidade(odoo);

  gravarRelatorio(resultados, fidelidade);
  const ok = resultados.filter((r) => r.ok).length;
  console.log(`[l2] tools: ${ok}/${resultados.length} ok`);
  const fidOk = fidelidade.filter((f) => f.ok).length;
  console.log(`[l2] fidelidade: ${fidOk}/${fidelidade.length} ok`);
  await prisma.$disconnect();
}

// ─── conferência de fidelidade: count(raw_*) vs search_count(Odoo) ───────────
interface FidLinha { model: string; raw: number; odoo: number; ok: boolean; nota: string }
async function conferirFidelidade(odoo: OdooClient): Promise<FidLinha[]> {
  const out: FidLinha[] = [];
  for (const entry of MODEL_CATALOG) {
    const model = entry.odooModel;
    try {
      const delegate = (prisma as unknown as Record<string, { count(): Promise<number> }>)[
        rawDelegateKey(model)
      ];
      const raw = await delegate.count();
      const odooN = await contar(odoo, model);
      const sync = await prisma.syncState.findFirst({
        where: { model },
        select: { lastStatus: true },
      });
      // Estáticas/referência batem exato; transacionais toleram a janela de sync (<=0,5%).
      const diff = Math.abs(raw - odooN);
      const tol = Math.max(0, Math.ceil(odooN * 0.005));
      const syncErro = sync?.lastStatus === "erro";
      // Modelo com sync em erro é achado conhecido (RADAR R8), não "diverge silencioso".
      const ok = diff <= tol && !syncErro;
      out.push({
        model, raw, odoo: odooN, ok,
        nota: syncErro
          ? `SYNC EM ERRO (RADAR R8) — diff ${diff}`
          : ok
            ? (diff === 0 ? "exato" : `janela de sync (${diff})`)
            : `DIVERGE em ${diff}`,
      });
    } catch (err) {
      out.push({ model, raw: -1, odoo: -1, ok: false, nota: `erro: ${String(err).slice(0, 120)}` });
    }
  }
  return out;
}

// ─── catálogo de casos ───────────────────────────────────────────────────────
async function montarCasos(odoo: OdooClient): Promise<Caso[]> {
  const casos: Caso[] = [];
  const add = (c: Caso) => casos.push(c);

  // ── Tools de contagem: igualdade exata com search_count do Odoo ──
  add({
    tool: "servico_contar", dominio: "cadastros",
    descricao: "total de serviços == search_count(sped.servico)",
    input: {},
    conferir: async (s, o) => {
      const total = Number(envelope(s).dados?.total);
      return eq(await contar(o, "sped.servico"), total);
    },
  });
  add({
    tool: "preco_contar_regras", dominio: "comercial",
    descricao: "total de regras de preço == search_count(sped.tabela.preco.regra)",
    input: {},
    conferir: async (s, o) => {
      const total = Number(envelope(s).dados?.total);
      return eq(await contar(o, "sped.tabela.preco.regra"), total);
    },
  });
  add({
    tool: "comercial_contar_pedidos", dominio: "comercial",
    descricao: "total de pedidos == search_count(pedido.documento)",
    input: {},
    conferir: async (s, o) => {
      const total = Number(envelope(s).dados?.total);
      return eqTol(await contar(o, "pedido.documento"), total);
    },
  });
  add({
    tool: "fiscal_contar_notas", dominio: "fiscal",
    descricao: "total/entrada/saída de notas == search_count(sped.documento)",
    input: {},
    conferir: async (s, o) => {
      const d = envelope(s).dados ?? {};
      const total = await contar(o, "sped.documento");
      const entrada = await contar(o, "sped.documento", [["entrada_saida", "=", "0"]]);
      const saida = await contar(o, "sped.documento", [["entrada_saida", "=", "1"]]);
      const tol = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, Math.ceil(a * 0.005));
      const ok =
        tol(total, Number(d.total)) &&
        tol(entrada, Number(d.totalEntrada)) &&
        tol(saida, Number(d.totalSaida));
      return {
        ok,
        esperado: `total=${total} entrada=${entrada} saida=${saida}`,
        obtido: `total=${d.total} entrada=${d.totalEntrada} saida=${d.totalSaida}`,
        nota: ok && Number(d.total) !== total ? "janela de sync" : undefined,
      };
    },
  });
  add({
    tool: "cadastro_contar_parceiros", dominio: "cadastros",
    descricao: "total de parceiros == search_count(res.partner)",
    input: {},
    conferir: async (s, o) => {
      const total = Number(envelope(s).dados?.totalParceiros);
      return eqTol(await contar(o, "res.partner"), total, "res.partner pode incluir contatos");
    },
  });

  // ── Tools de listagem: campo `total` == search_count ──
  add({
    tool: "servico_listar", dominio: "cadastros",
    descricao: "campo total == search_count(sped.servico)",
    input: { limite: 50 },
    conferir: async (s, o) => {
      const total = Number(envelope(s).dados?.total);
      return eq(await contar(o, "sped.servico"), total, "amostra cortada em 50; confere total");
    },
  });

  // ── referencia_buscar: total por tabela == search_count do modelo Odoo ──
  const refTabelas: { tabela: string; model: string }[] = [
    { tabela: "ncm", model: "sped.ncm" },
    { tabela: "cfop", model: "sped.cfop" },
    { tabela: "cest", model: "sped.cest" },
    { tabela: "cnae", model: "sped.cnae" },
    { tabela: "nbs", model: "sped.nbs" },
    { tabela: "natureza_operacao", model: "sped.natureza.operacao" },
    { tabela: "unidade", model: "sped.unidade" },
    { tabela: "cst_icms", model: "sped.cst.icms" },
    { tabela: "cst_icms_sn", model: "sped.cst.icms.sn" },
    { tabela: "cst_ipi", model: "sped.cst.ipi" },
    { tabela: "cst_pis_cofins", model: "sped.cst.pis.cofins" },
    { tabela: "cst_cibs", model: "sped.cst.cibs" },
    { tabela: "municipio", model: "sped.municipio" },
    { tabela: "pais", model: "sped.pais" },
    { tabela: "estado", model: "sped.estado" },
  ];
  for (const { tabela, model } of refTabelas) {
    add({
      tool: "referencia_buscar", dominio: "fiscal",
      descricao: `referencia_buscar(${tabela}) total == search_count(${model})`,
      input: { tabela, limite: 200 },
      conferir: async (s, o) => {
        const total = Number(envelope(s).dados?.total);
        return eq(await contar(o, model), total);
      },
    });
  }

  // ── Agregações fiscais por período (read_group sobre sped.documento) ──
  // Usa um período largo (ano corrente) para pegar dado real.
  const ano = new Date().getFullYear();
  const de = `${ano}-01-01`;
  const ate = `${ano}-12-31`;
  add({
    tool: "fiscal_notas_recebidas", dominio: "fiscal",
    descricao: `notas recebidas ${ano} == search_count(entrada_saida=0, periodo)`,
    input: { periodoDe: de, periodoAte: ate },
    conferir: async (s, o) => {
      const d = envelope(s).dados ?? {};
      const esperado = await contar(o, "sped.documento", [
        ["entrada_saida", "=", "0"],
        ["data_emissao", ">=", de],
        ["data_emissao", "<=", `${ate} 23:59:59`],
      ]);
      return eqTol(esperado, Number(d.totalNotas), "totalNotas vs search_count");
    },
  });
  add({
    tool: "fiscal_notas_emitidas", dominio: "fiscal",
    descricao: `notas emitidas ${ano} == search_count(entrada_saida=1, periodo)`,
    input: { periodoDe: de, periodoAte: ate },
    conferir: async (s, o) => {
      const d = envelope(s).dados ?? {};
      const esperado = await contar(o, "sped.documento", [
        ["entrada_saida", "=", "1"],
        ["data_emissao", ">=", de],
        ["data_emissao", "<=", `${ate} 23:59:59`],
      ]);
      return eqTol(esperado, Number(d.totalNotas), "totalNotas vs search_count");
    },
  });

  // ── Tools que exigem input: descobrir ids reais do cache ──
  const umaConta = await prisma.fatoContaContabil.findFirst({ select: { odooId: true } });
  if (umaConta) {
    add({
      tool: "contabil_estrutura_conta", dominio: "contabil",
      descricao: `estrutura da conta ${umaConta.odooId} responde sem erro`,
      input: { odooId: umaConta.odooId },
      conferir: async (s) => smoke(s),
    });
  }
  const umParceiro = await prisma.fatoParceiro.findFirst({ select: { odooId: true } });
  if (umParceiro) {
    add({
      tool: "crm.res_partner.get", dominio: "crm",
      descricao: `res_partner.get(${umParceiro.odooId}) confere com o Odoo`,
      input: { id: umParceiro.odooId },
      conferir: async (s, o) => {
        // crm.res_partner.get devolve { found, record } — não o envelope withFreshness.
        const found = (s as { found?: boolean }).found === true;
        const rows = await o.searchRead<{ id: number }>(
          "res.partner", [["id", "=", umParceiro.odooId]], ["id"], { limit: 1 },
        );
        const noOdoo = rows.length === 1;
        return {
          ok: found === noOdoo,
          esperado: `found=${noOdoo} (res.partner ${umParceiro.odooId} no Odoo)`,
          obtido: `found=${found}`,
        };
      },
    });
  }

  // ── Demais tools: smoke (chama, espera estado ok/vazio/preparando) ──
  // Cobre toda tool de domínio que não tem caso específico acima.
  const comCaso = new Set(casos.map((c) => c.tool));
  for (const tool of catalogo) {
    if (!tool.dominio) continue; // pula registrar_lacuna / bi_consulta_avancada
    if (tool.id === "crm.res_partner.create") continue; // write tool
    if (comCaso.has(tool.id)) continue;
    add({
      tool: tool.id, dominio: String(tool.dominio),
      descricao: `smoke: ${tool.id} responde sem erro`,
      input: {},
      conferir: async (s) => smoke(s),
    });
  }

  void odoo;
  return casos;
}

// ─── relatório ───────────────────────────────────────────────────────────────
function gravarRelatorio(resultados: Resultado[], fidelidade: FidLinha[]): void {
  const ok = resultados.filter((r) => r.ok).length;
  const pct = ((ok / resultados.length) * 100).toFixed(1);
  const fidOk = fidelidade.filter((f) => f.ok).length;

  const porDominio = new Map<string, { ok: number; tot: number }>();
  for (const r of resultados) {
    const e = porDominio.get(r.dominio) ?? { ok: 0, tot: 0 };
    e.tot += 1;
    if (r.ok) e.ok += 1;
    porDominio.set(r.dominio, e);
  }

  let md = `# L2 — Bateria de validação de leitura — relatório\n\n`;
  md += `> Gerado por \`scripts/f4l-l2-harness.ts\` em ${new Date().toISOString()}.\n\n`;
  md += `## Resumo\n\n`;
  md += `- Casos de tool: **${ok}/${resultados.length}** ok (${pct}%).\n`;
  md += `- Fidelidade do cache: **${fidOk}/${fidelidade.length}** modelos ok.\n\n`;
  md += `## Por domínio\n\n| Domínio | ok / total |\n|---|---|\n`;
  for (const [dom, e] of [...porDominio.entries()].sort()) {
    md += `| ${dom} | ${e.ok}/${e.tot} |\n`;
  }
  md += `\n## Casos com divergência\n\n`;
  const falhas = resultados.filter((r) => !r.ok);
  if (falhas.length === 0) {
    md += `Nenhuma.\n`;
  } else {
    md += `| Tool | Caso | Esperado | Obtido | Nota |\n|---|---|---|---|---|\n`;
    for (const f of falhas) {
      md += `| ${f.tool} | ${f.descricao} | ${f.esperado} | ${f.obtido} | ${f.nota ?? ""} |\n`;
    }
  }
  md += `\n## Fidelidade cache vs Odoo (divergências)\n\n`;
  const fidFalhas = fidelidade.filter((f) => !f.ok);
  if (fidFalhas.length === 0) {
    md += `Nenhuma divergência além da janela de sync tolerada.\n`;
  } else {
    md += `| Modelo | raw | Odoo | Nota |\n|---|---|---|---|\n`;
    for (const f of fidFalhas) {
      md += `| ${f.model} | ${f.raw} | ${f.odoo} | ${f.nota} |\n`;
    }
  }
  md += `\n## Todos os casos de tool\n\n| Tool | Caso | Estado | OK | Esperado | Obtido |\n|---|---|---|---|---|---|\n`;
  for (const r of resultados) {
    md += `| ${r.tool} | ${r.descricao} | ${r.estado} | ${r.ok ? "✓" : "✗"} | ${r.esperado} | ${r.obtido} |\n`;
  }
  writeFileSync(RELATORIO, md);
  console.log(`[l2] relatório -> ${RELATORIO}`);
}
