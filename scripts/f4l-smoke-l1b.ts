// scripts/f4l-smoke-l1b.ts
// Ingestão direcionada + smoke test da onda L1b (camada de referência).
// Sincroniza os 27 modelos de referência, reconstrói fato_referencia e confere
// contagem (amostra) vs Odoo e a tool queryReferenciaBuscar.
// Uso: tsx --env-file=.env.local scripts/f4l-smoke-l1b.ts
import { prisma } from "../src/worker/prisma";
import { clientFromEnv } from "../src/worker/odoo/client";
import { MODEL_CATALOG } from "../src/worker/catalog/model-catalog";
import { processIncrementalCycle } from "../src/worker/sync/processors";
import { rebuildFatoReferencia } from "../src/worker/fatos/fato-referencia";
import { queryReferenciaBuscar } from "../src/lib/reports/queries/referencia";

const L1B = MODEL_CATALOG.filter((e) =>
  e.odooModel.startsWith("sped.ncm") ||
  e.odooModel.startsWith("sped.cfop") ||
  e.odooModel.startsWith("sped.cest") ||
  e.odooModel.startsWith("sped.cnae") ||
  e.odooModel.startsWith("sped.nbs") ||
  e.odooModel.startsWith("sped.natureza.operacao") ||
  e.odooModel.startsWith("sped.unidade") ||
  e.odooModel.startsWith("sped.cst.") ||
  e.odooModel.startsWith("sped.municipio") ||
  e.odooModel.startsWith("sped.pais") ||
  e.odooModel.startsWith("sped.estado") ||
  e.odooModel.startsWith("sped.condicao.pagamento") ||
  e.odooModel.startsWith("sped.feriado") ||
  e.odooModel.startsWith("sped.aliquota."),
);

async function main(): Promise<void> {
  const client = clientFromEnv();
  await client.authenticate();

  console.log(`[l1b] sync incremental: ${L1B.length} modelos de referência`);
  await processIncrementalCycle({ prisma, client }, L1B, undefined, "ondemand");

  // Contagem (amostra) raw vs Odoo
  const amostra: { model: string; count: () => Promise<number> }[] = [
    { model: "sped.ncm", count: () => prisma.rawSpedNcm.count() },
    { model: "sped.cfop", count: () => prisma.rawSpedCfop.count() },
    { model: "sped.municipio", count: () => prisma.rawSpedMunicipio.count() },
    { model: "sped.estado", count: () => prisma.rawSpedEstado.count() },
    { model: "sped.cst.cibs", count: () => prisma.rawSpedCstCibs.count() },
  ];
  for (const a of amostra) {
    const odoo = await client.executeKw<number>(a.model, "search_count", [[]]);
    const local = await a.count();
    console.log(`[count] ${a.model}: raw=${local} odoo=${odoo} ${local === odoo ? "OK" : "DIVERGE"}`);
  }

  // Builder + tool
  const n = await rebuildFatoReferencia(prisma);
  console.log(`[fato] fato_referencia reconstruído: ${n} linhas`);

  for (const f of [
    { tabela: "cfop", termo: "5102" },
    { tabela: "estado", termo: "DF" },
    { tabela: "ncm", termo: "arroz" },
  ]) {
    const r = await queryReferenciaBuscar(prisma, f);
    console.log(`[tool] referencia_buscar(${f.tabela}, "${f.termo}") -> total ${r.total}:`);
    for (const l of r.linhas.slice(0, 3)) console.log(`  ${l.codigo} — ${l.descricao}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[l1b] FALHA:", err);
  process.exit(1);
});
