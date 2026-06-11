/**
 * scripts/limpa/purge-pre-2026.ts , T4b do plan Limpa 2026+ (DRY-RUN).
 *
 * Read-only: conta o que SERIA deletado por tabela (NULLs preservados
 * contados) + bytes atuais, e grava o relatorio aprovavel em docs/.
 * Os modos --apply (T4c) e --vacuum (T4d) serao implementados na proxima
 * sessao; este script ABORTA se receber --apply (gate humano consciente).
 *
 * Uso: npx tsx --env-file=.env.local scripts/limpa/purge-pre-2026.ts
 */
import { prisma } from "@/lib/prisma";
import { MODEL_CATALOG, rawTableFor } from "@/worker/catalog/model-catalog";
import {
  wherePre2026Raw,
  wherePre2026Filho,
  wherePre2026Neto,
  whereTituloQuitadoPre2026Raw,
  contagemDryRun,
} from "@/worker/limpa/predicados";
import { writeFileSync } from "node:fs";

interface Linha { tabela: string; criterio: string; aDeletar: number; nulos: number; total: number; mb: number }

async function bytes(tabela: string): Promise<number> {
  try {
    const r = await prisma.$queryRawUnsafe<{ b: bigint }[]>(
      `SELECT pg_total_relation_size('${tabela}') AS b`);
    return Number(r[0]?.b ?? 0) / 1048576;
  } catch { return -1; }
}

async function conta(tabela: string, where: string, chave?: string): Promise<{ aDeletar: number; nulos: number; total: number }> {
  const r = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(contagemDryRun(tabela, where, chave));
  const x = r[0] ?? {};
  return { aDeletar: Number(x.a_deletar ?? 0), nulos: Number(x.nulos_preservados ?? 0), total: Number(x.total ?? 0) };
}

async function main() {
  if (process.argv.includes("--apply") || process.argv.includes("--vacuum")) {
    console.error("[purge] --apply/--vacuum ainda NAO implementados (T4c/T4d). Dry-run apenas.");
    process.exit(2);
  }
  const linhas: Linha[] = [];
  for (const e of MODEL_CATALOG) {
    const tabela = rawTableFor(e.odooModel);
    try {
      if (e.corte) {
        const c = await conta(tabela, wherePre2026Raw(e.corte.raw), e.corte.raw);
        linhas.push({ tabela, criterio: `data ${e.corte.raw} < 2026`, ...c, mb: await bytes(tabela) });
      } else if (e.cortePai) {
        const pai = MODEL_CATALOG.find((p) => rawTableFor(p.odooModel) === e.cortePai!.tabelaRawPai);
        // pai direto (sped.documento) ou avo via item , o pai SEMPRE precisa ter corte proprio
        const chavePai = pai?.corte?.raw ?? "data_emissao";
        const w = pai?.corte
          ? wherePre2026Filho(e.cortePai.tabelaRawPai, e.cortePai.fkRaw, chavePai)
          : // pai intermediario (item): encadeia ao avo documento
            wherePre2026Neto(e.cortePai.tabelaRawPai, e.cortePai.fkRaw,
              "raw_sped_documento", "documento_id", "data_emissao");
        const c = await conta(tabela, w);
        linhas.push({ tabela, criterio: `filho de ${e.cortePai.tabelaRawPai}`, ...c, mb: await bytes(tabela) });
      } else if (e.corteEspecial === "titulo_por_situacao") {
        const c = await conta(tabela, whereTituloQuitadoPre2026Raw());
        linhas.push({ tabela, criterio: "quitado/baixado pago<2026 (vivos FICAM)", ...c, mb: await bytes(tabela) });
      }
    } catch (err) {
      console.error(`[purge] ERRO em ${tabela}: ${String(err).slice(0, 120)}`);
    }
  }
  let md = "# DRY-RUN , Purge pre-2026 (" + new Date().toISOString().slice(0, 16) + "Z)\n\n";
  md += "| tabela | criterio | a deletar | NULLs preservados | total | MB |\n|---|---|---|---|---|---|\n";
  let totDel = 0;
  for (const l of linhas) {
    md += `| ${l.tabela} | ${l.criterio} | ${l.aDeletar} | ${l.nulos} | ${l.total} | ${l.mb.toFixed(0)} |\n`;
    totDel += l.aDeletar;
  }
  md += `\n**Total a deletar: ${totDel} linhas.** Aprovar antes do --apply (T4c).\n`;
  const out = "docs/superpowers/research/limpa-2026-dryrun.md";
  writeFileSync(out, md);
  console.log(md);
  console.log(`[purge] relatorio: ${out}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
