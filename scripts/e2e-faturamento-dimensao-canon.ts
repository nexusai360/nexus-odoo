// E2E contra dado real (regra de raiz do projeto): as tools de faturamento por
// DIMENSAO (UF, marca) devem somar a MESMA receita externa da tool de periodo.
// Antes da correcao (conversa ea8aa0a3, 2026-06-15) a por_uf somava vr_nf cru de
// TODA nota de saida autorizada (R$ 29M) em vez da receita externa (R$ 8,9M).
// Roda os HANDLERS reais das tools MCP contra o cache.
// Rodar: npx tsx --env-file=.env.local scripts/e2e-faturamento-dimensao-canon.ts
import { prisma } from "@/lib/prisma";
import { receitaConsolidada } from "@/lib/metrics/fiscal/receita-consolidada";
import { fiscalFaturamentoPorUf } from "../mcp/tools/fiscal/faturamento-por-uf";
import { fiscalFaturamentoPorMarca } from "../mcp/tools/fiscal/faturamento-por-marca";
import type { ToolHandlerCtx } from "../mcp/catalog/types";
import type { UserContext } from "../mcp/auth/user-context";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const erros: string[] = [];
function check(cond: boolean, msg: string) {
  console.log(`${cond ? "OK  " : "FALHOU "} ${msg}`);
  if (!cond) erros.push(msg);
}

const ctx: ToolHandlerCtx = {
  prisma,
  user: { userId: "e2e", role: "super_admin", domains: ["fiscal"] } as UserContext,
};

async function main() {
  const de = "2026-06-01";
  const ate = "2026-06-30";
  const rc = await receitaConsolidada(prisma, { periodoDe: de, periodoAte: ate });
  console.log(`\nreceita externa de referencia (periodo) = ${brl(rc.receitaExterna)}\n`);

  const uf = await fiscalFaturamentoPorUf.handler({ periodoDe: de, periodoAte: ate } as never, ctx);
  if (uf.estado !== "preparando") {
    const total = Number(uf.dados._DESTAQUE?.totalGeral ?? -1);
    console.log(`por_uf handler   totalGeral = ${brl(total)} | _RESPOSTA: ${String(uf.dados._RESPOSTA).slice(0, 90)}...`);
    check(Math.abs(total - rc.receitaExterna) < 0.01, "por_uf.totalGeral == receita externa (nao infla)");
    check(total < 10_000_000, "por_uf nao volta ao patamar inflado de ~29M");
  } else {
    erros.push("por_uf retornou 'preparando' (fato nao construido no cache local)");
  }

  const marca = await fiscalFaturamentoPorMarca.handler({ periodoDe: de, periodoAte: ate } as never, ctx);
  if (marca.estado !== "preparando") {
    const total = Number(marca.dados._DESTAQUE?.totalGeral ?? -1);
    console.log(`por_marca handler totalGeral = ${brl(total)} | _RESPOSTA: ${String(marca.dados._RESPOSTA).slice(0, 90)}...`);
    check(Math.abs(total - rc.receitaExterna) < 0.01, "por_marca.totalGeral == receita externa (nao infla)");
  } else {
    erros.push("por_marca retornou 'preparando' (fato nao construido no cache local)");
  }

  await prisma.$disconnect();
  if (erros.length) {
    console.error(`\n${erros.length} FALHA(S):\n- ${erros.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nTODAS as verificacoes E2E passaram. ✅");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
