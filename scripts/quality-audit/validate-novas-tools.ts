#!/usr/bin/env tsx
/**
 * Validacao extensiva das 6 tools criadas/estendidas:
 * - cadastro_parceiros_por_cidade
 * - cadastro_cidades_listar
 * - fiscal_faturamento_por_uf
 * - comercial_pedidos_por_uf
 * - financeiro_liquidez
 * - comercial_produtos_por_margem
 * - comercial_pedidos_listar_top_valor (extendido com ordenacao + clienteTermo)
 *
 * Cada teste valida o _RESPOSTA, batendo numeros com query SQL direta.
 */
import { config as loadDotenv } from "dotenv";
import { resolve as resolvePath } from "path";
loadDotenv({ path: resolvePath(process.cwd(), ".env.local"), override: true });
import { PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

import { cadastroParceirosPorCidade } from "../../mcp/tools/cadastros/parceiros-por-cidade.js";
import { cadastroCidadesListar } from "../../mcp/tools/cadastros/cidades-listar.js";
import { fiscalFaturamentoPorUf } from "../../mcp/tools/fiscal/faturamento-por-uf.js";
import { comercialPedidosPorUf } from "../../mcp/tools/comercial/pedidos-por-uf.js";
import { financeiroLiquidez } from "../../mcp/tools/financeiro/liquidez.js";
import { comercialProdutosPorMargem } from "../../mcp/tools/comercial/produtos-por-margem.js";
import { comercialPedidosListarTopValor } from "../../mcp/tools/comercial/pedidos-listar-top-valor.js";

const adapter = new PrismaPg({ connectionString: process.env.MCP_DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const ctx = { prisma, role: "super_admin" as const, userId: "validate" };

let pass = 0, fail = 0;
const fails: string[] = [];

function check(label: string, cond: boolean, expected?: unknown, actual?: unknown) {
  if (cond) {
    pass++;
    console.log(`✓ ${label}`);
  } else {
    fail++;
    fails.push(label);
    console.log(`✗ ${label} — expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}

async function sqlScalar(sql: string): Promise<number> {
  const r = await prisma.$queryRawUnsafe<Array<{ n: bigint | string | number }>>(sql);
  return Number(r[0]?.n ?? 0);
}

async function main() {
  // ─── 1. parceiros_por_cidade — vários estados ───────────────────────────
  console.log("\n=== parceiros_por_cidade (vários estados) ===");
  for (const uf of ["SP", "DF", "BA", "RJ", "MG", "GO", "CE", "PR", "RS", "SC"]) {
    const r = await (cadastroParceirosPorCidade.handler as any)({ uf }, ctx);
    const totalTool = r.dados?.totalEncontrados ?? 0;
    const totalSql = await sqlScalar(
      `SELECT COUNT(*)::bigint AS n FROM fato_parceiro WHERE ativo = true AND uf ILIKE '%${
        {SP:"São Paulo",DF:"Distrito Federal",BA:"Bahia",RJ:"Rio de Janeiro",MG:"Minas Gerais",GO:"Goiás",CE:"Ceará",PR:"Paraná",RS:"Rio Grande do Sul",SC:"Santa Catarina"}[uf]
      }%'`,
    );
    check(`parceiros_por_cidade ${uf}: tool=${totalTool} sql=${totalSql}`, totalTool === totalSql);
  }

  // ─── 2. parceiros_por_cidade — zona capital/interior ────────────────────
  console.log("\n=== parceiros_por_cidade zonas (3 estados) ===");
  for (const uf of ["SP", "RJ", "MG"]) {
    const total = (await (cadastroParceirosPorCidade.handler as any)({ uf }, ctx)).dados.totalEncontrados;
    const cap = (await (cadastroParceirosPorCidade.handler as any)({ uf, zona: "capital" }, ctx)).dados.totalEncontrados;
    const inte = (await (cadastroParceirosPorCidade.handler as any)({ uf, zona: "interior" }, ctx)).dados.totalEncontrados;
    check(`parceiros ${uf} = capital + interior (${total} = ${cap}+${inte}=${cap+inte})`, total === cap + inte);
  }

  // ─── 3. parceiros_por_cidade — só cidade (sem UF) ───────────────────────
  console.log("\n=== parceiros_por_cidade cidade especifica ===");
  for (const cidade of ["Brasília", "Campinas", "Salvador", "Goiânia"]) {
    const r = await (cadastroParceirosPorCidade.handler as any)({ cidade }, ctx);
    const totalTool = r.dados?.totalEncontrados ?? 0;
    const totalSql = await sqlScalar(
      `SELECT COUNT(*)::bigint AS n FROM fato_parceiro WHERE ativo=true AND lower(unaccent(cidade)) ILIKE '%${cidade.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}%'`,
    );
    check(`cidade=${cidade}: tool=${totalTool} sql=${totalSql}`, totalTool === totalSql);
  }

  // ─── 4. cadastro_cidades_listar ─────────────────────────────────────────
  console.log("\n=== cadastro_cidades_listar ===");
  const all = await (cadastroCidadesListar.handler as any)({ limite: 500 }, ctx);
  const totalCidadesSql = await sqlScalar(
    `SELECT COUNT(DISTINCT cidade)::bigint AS n FROM fato_parceiro WHERE ativo=true AND cidade IS NOT NULL`,
  );
  check(`cidades_listar total: tool=${all.dados.totalCidadesDistintas} sql=${totalCidadesSql}`, all.dados.totalCidadesDistintas === totalCidadesSql);

  const sp = await (cadastroCidadesListar.handler as any)({ uf: "SP", limite: 500 }, ctx);
  const cidadesSpSql = await sqlScalar(
    `SELECT COUNT(DISTINCT cidade)::bigint AS n FROM fato_parceiro WHERE ativo=true AND cidade IS NOT NULL AND uf ILIKE '%São Paulo%'`,
  );
  check(`cidades_listar SP: tool=${sp.dados.totalCidadesDistintas} sql=${cidadesSpSql}`, sp.dados.totalCidadesDistintas === cidadesSpSql);

  for (const uf of ["BA", "GO", "RJ"]) {
    const r = await (cadastroCidadesListar.handler as any)({ uf, limite: 500 }, ctx);
    check(`cidades_listar ${uf}: total=${r.dados.totalCidadesDistintas} (>0)`, r.dados.totalCidadesDistintas > 0);
  }

  // ─── 5. fiscal_faturamento_por_uf ───────────────────────────────────────
  console.log("\n=== fiscal_faturamento_por_uf ===");
  const fat = await (fiscalFaturamentoPorUf.handler as any)({}, ctx);
  check("faturamento_por_uf tem _RESPOSTA", typeof fat.dados._RESPOSTA === "string" && fat.dados._RESPOSTA.length > 20);
  check("faturamento_por_uf totalNotas > 0", fat.dados.totalNotas > 0);
  check("faturamento_por_uf top NÃO é '(sem UF)'", fat.dados._DESTAQUE.topUf !== "" && fat.dados._DESTAQUE.topUf !== "(sem UF)");

  // ─── 6. comercial_pedidos_por_uf ────────────────────────────────────────
  console.log("\n=== comercial_pedidos_por_uf ===");
  const ped = await (comercialPedidosPorUf.handler as any)({}, ctx);
  check("pedidos_por_uf totalPedidos > 0", ped.dados.totalPedidos > 0);
  check("pedidos_por_uf top NÃO é '(sem UF)'", ped.dados._DESTAQUE.topUf !== "" && ped.dados._DESTAQUE.topUf !== "(sem UF)");

  // ─── 7. financeiro_liquidez ─────────────────────────────────────────────
  console.log("\n=== financeiro_liquidez ===");
  const liq = await (financeiroLiquidez.handler as any)({}, ctx);
  const saldoSql = await sqlScalar(`SELECT COALESCE(SUM(saldo),0)::numeric::text AS n FROM fato_financeiro_saldo`);
  const aReceberSql = await sqlScalar(`SELECT COALESCE(SUM(vr_saldo),0)::numeric::text AS n FROM fato_financeiro_titulo WHERE tipo='a_receber' AND vr_saldo>0`);
  const aPagarSql = await sqlScalar(`SELECT COALESCE(SUM(vr_saldo),0)::numeric::text AS n FROM fato_financeiro_titulo WHERE tipo='a_pagar' AND vr_saldo>0`);
  check(`liquidez saldoEmCaixa: tool=${liq.dados.saldoEmCaixa.toFixed(2)} sql=${saldoSql.toFixed(2)}`, Math.abs(liq.dados.saldoEmCaixa - saldoSql) < 0.01);
  check(`liquidez contasAReceber: tool=${liq.dados.contasAReceber.toFixed(2)} sql=${aReceberSql.toFixed(2)}`, Math.abs(liq.dados.contasAReceber - aReceberSql) < 0.01);
  check(`liquidez contasAPagar: tool=${liq.dados.contasAPagar.toFixed(2)} sql=${aPagarSql.toFixed(2)}`, Math.abs(liq.dados.contasAPagar - aPagarSql) < 0.01);
  check(`liquidez status definido (${liq.dados.status})`, ["saudavel", "atencao", "critico"].includes(liq.dados.status));

  // ─── 8. comercial_produtos_por_margem ───────────────────────────────────
  console.log("\n=== produtos_por_margem ===");
  const margemAsc = await (comercialProdutosPorMargem.handler as any)({ ordenacao: "menor", limite: 5 }, ctx);
  const margemDesc = await (comercialProdutosPorMargem.handler as any)({ ordenacao: "maior", limite: 5 }, ctx);
  check("margem maior > menor (sanity)", margemDesc.dados.linhas[0].margemPercentual > margemAsc.dados.linhas[0].margemPercentual);
  check("margem linhas[0] tem custo > 0", margemDesc.dados.linhas[0].precoCusto > 0);
  check("margem linhas[0] tem venda > 0", margemDesc.dados.linhas[0].precoVenda > 0);

  // ─── 9. pedidos_listar_top_valor — ordenacao + clienteTermo ─────────────
  console.log("\n=== pedidos_listar_top_valor extendido ===");
  const ant = await (comercialPedidosListarTopValor.handler as any)({ ordenacao: "data_asc", limite: 3 }, ctx);
  check("ord data_asc: _RESPOSTA cita 'mais antigo'", typeof ant.dados._RESPOSTA === "string" && ant.dados._RESPOSTA.toLowerCase().includes("mais antigo"));

  const rec = await (comercialPedidosListarTopValor.handler as any)({ ordenacao: "data_desc", limite: 3 }, ctx);
  check("ord data_desc: _RESPOSTA cita 'mais recente'", typeof rec.dados._RESPOSTA === "string" && rec.dados._RESPOSTA.toLowerCase().includes("mais recente"));

  const sm = await (comercialPedidosListarTopValor.handler as any)({ clienteTermo: "Smartfit", limite: 5 }, ctx);
  check("clienteTermo Smartfit: > 0 pedidos", sm.dados.linhas.length > 0);
  check("clienteTermo Smartfit: todos participanteNome contém 'smartfit'",
    sm.dados.linhas.every((l: any) => (l.participanteNome ?? "").toLowerCase().includes("smartfit")),
  );

  // Edge: cliente inexistente
  const vazio = await (comercialPedidosListarTopValor.handler as any)({ clienteTermo: "XXXNONEXIST", limite: 5 }, ctx);
  check("clienteTermo inexistente: linhas=0 + _RESPOSTA cita 'Nao ha'", vazio.dados.linhas.length === 0 && vazio.dados._RESPOSTA.includes("Nao ha"));

  // ─── RESUMO ─────────────────────────────────────────────────────────────
  console.log(`\n\n=== RESUMO: ${pass} OK / ${fail} FALHA ===`);
  if (fail > 0) {
    console.log("Falhas:");
    for (const f of fails) console.log("  - " + f);
  }
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
