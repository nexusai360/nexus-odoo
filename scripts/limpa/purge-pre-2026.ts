/**
 * scripts/limpa/purge-pre-2026.ts , T4b/T4c/T4d do plan Limpa 2026+.
 *
 * Modos:
 *  (default)  DRY-RUN read-only: conta o que SERIA deletado por tabela
 *             (NULLs preservados) + bytes, grava relatorio aprovavel em docs/.
 *  --apply    T4c: DELETE em lotes (ctid LIMIT) na ordem neto->filho->raiz,
 *             log por tabela. EXIGE --aprovado (gate humano: so rodar depois
 *             do dry-run aprovado pelo usuario, plan T9).
 *  --vacuum   T4d: VACUUM (FULL, ANALYZE) por tabela tocada + lote_serie
 *             (bloat 2,9GB sem delete), medindo bytes antes/depois e duracao.
 *             Rodar com worker PARADO (lock exclusivo).
 *
 * Uso: npx tsx --env-file=.env.local scripts/limpa/purge-pre-2026.ts [--apply --aprovado | --vacuum]
 */
import { prisma } from "@/lib/prisma";
import { MODEL_CATALOG } from "@/worker/catalog/model-catalog";
import { montaAlvosPurge } from "@/worker/limpa/alvos";
import { contagemDryRun, deleteLote, LOTE_PADRAO } from "@/worker/limpa/predicados";
import { writeFileSync, appendFileSync } from "node:fs";

const DOCS = "docs/superpowers/research";

async function bytes(tabela: string): Promise<number> {
  try {
    const r = await prisma.$queryRawUnsafe<{ b: bigint }[]>(
      `SELECT pg_total_relation_size('${tabela}') AS b`);
    return Number(r[0]?.b ?? 0) / 1048576;
  } catch { return -1; }
}

async function conta(tabela: string, where: string, chave?: string) {
  const r = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(contagemDryRun(tabela, where, chave));
  const x = r[0] ?? {};
  return { aDeletar: Number(x.a_deletar ?? 0), nulos: Number(x.nulos_preservados ?? 0), total: Number(x.total ?? 0) };
}

async function dryRun() {
  let md = "# DRY-RUN , Purge pre-2026 (" + new Date().toISOString().slice(0, 16) + "Z)\n\n";
  md += "| tabela | criterio | a deletar | NULLs preservados | total | MB |\n|---|---|---|---|---|---|\n";
  let totDel = 0;
  for (const a of montaAlvosPurge(MODEL_CATALOG)) {
    try {
      const c = await conta(a.tabela, a.where, a.chaveNulos);
      md += `| ${a.tabela} | ${a.criterio} | ${c.aDeletar} | ${c.nulos} | ${c.total} | ${(await bytes(a.tabela)).toFixed(0)} |\n`;
      totDel += c.aDeletar;
    } catch (err) {
      console.error(`[purge] ERRO em ${a.tabela}: ${String(err).slice(0, 300)}`);
      md += `| ${a.tabela} | ${a.criterio} | ERRO | - | - | - |\n`;
    }
  }
  md += `\n**Total a deletar: ${totDel} linhas.** Aprovar antes do --apply (T4c).\n`;
  const out = `${DOCS}/limpa-2026-dryrun.md`;
  writeFileSync(out, md);
  console.log(md);
  console.log(`[purge] relatorio: ${out}`);
}

async function apply() {
  const inicio = Date.now();
  let md = "# APPLY , Purge pre-2026 (" + new Date().toISOString().slice(0, 16) + "Z)\n\n";
  md += "| tabela | deletadas | lotes | duracao s |\n|---|---|---|---|\n";
  let totDel = 0;
  for (const a of montaAlvosPurge(MODEL_CATALOG)) {
    const t0 = Date.now();
    let deletadas = 0;
    let lotes = 0;
    // cada $executeRawUnsafe e autocommit: commit por lote, nunca uma
    // transacao gigante (923MB nao cabem)
    for (;;) {
      const n = await prisma.$executeRawUnsafe(deleteLote(a.tabela, a.where, LOTE_PADRAO));
      deletadas += n;
      lotes += 1;
      if (n < LOTE_PADRAO) break;
      console.log(`[purge] ${a.tabela}: lote ${lotes} (${deletadas} acumuladas)`);
    }
    const dur = (Date.now() - t0) / 1000;
    md += `| ${a.tabela} | ${deletadas} | ${lotes} | ${dur.toFixed(1)} |\n`;
    totDel += deletadas;
    console.log(`[purge] ${a.tabela}: ${deletadas} deletadas em ${lotes} lote(s), ${dur.toFixed(1)}s`);
  }
  md += `\n**Total deletado: ${totDel} linhas em ${((Date.now() - inicio) / 1000).toFixed(0)}s.**\n`;
  md += `Proximo: \`--vacuum\` (T4d) com worker parado, depois rebuild dos fatos (T5/T6).\n`;
  const out = `${DOCS}/limpa-2026-apply.md`;
  writeFileSync(out, md);
  console.log(md);
  console.log(`[purge] relatorio: ${out}`);
}

async function vacuum() {
  // tabelas tocadas pelo apply + a campea de bloat (sem delete, so vacuum)
  const tabelas = [
    ...montaAlvosPurge(MODEL_CATALOG).map((a) => a.tabela),
    "raw_sped_produto_lote_serie",
  ];
  let md = "\n## VACUUM (" + new Date().toISOString().slice(0, 16) + "Z)\n\n";
  md += "| tabela | MB antes | MB depois | ganho MB | duracao s |\n|---|---|---|---|---|\n";
  let ganhoTot = 0;
  for (const t of tabelas) {
    const antes = await bytes(t);
    const t0 = Date.now();
    try {
      await prisma.$executeRawUnsafe(`VACUUM (FULL, ANALYZE) ${t}`);
    } catch (err) {
      console.error(`[purge] VACUUM falhou em ${t}: ${String(err).slice(0, 200)}`);
      md += `| ${t} | ${antes.toFixed(0)} | ERRO | - | - |\n`;
      continue;
    }
    const depois = await bytes(t);
    const dur = (Date.now() - t0) / 1000;
    ganhoTot += antes - depois;
    md += `| ${t} | ${antes.toFixed(0)} | ${depois.toFixed(0)} | ${(antes - depois).toFixed(0)} | ${dur.toFixed(1)} |\n`;
    console.log(`[purge] VACUUM ${t}: ${antes.toFixed(0)} -> ${depois.toFixed(0)} MB (${dur.toFixed(1)}s)`);
  }
  md += `\n**Ganho total: ${ganhoTot.toFixed(0)} MB.** Duracao de DEV dimensiona a janela de PROD (T10).\n`;
  const out = `${DOCS}/limpa-2026-apply.md`;
  appendFileSync(out, md);
  console.log(md);
  console.log(`[purge] relatorio: ${out}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--apply")) {
    if (!args.includes("--aprovado")) {
      console.error(
        "[purge] --apply exige --aprovado: gate humano do plan T9. " +
        "So rode depois do dry-run aprovado pelo usuario E do pg_dump do pre-flight.");
      process.exit(2);
    }
    await apply();
  } else if (args.includes("--vacuum")) {
    await vacuum();
  } else {
    await dryRun();
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
