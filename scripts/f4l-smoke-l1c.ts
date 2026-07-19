// scripts/f4l-smoke-l1c.ts
// Ingestão direcionada + smoke test da onda L1c (resíduo operacional 4a).
// Sincroniza só os 3 modelos da L1c, reconstrói fato_certificado e confere:
//  - contagem raw vs search_count do Odoo;
//  - que raw_sped_certificado NÃO guarda os campos senha/arquivo;
//  - que a tool queryCertificados devolve os certificados com validade.
// Uso: tsx --env-file=.env.local scripts/f4l-smoke-l1c.ts
import { prisma } from "../src/worker/prisma";
import { clientFromEnv } from "../src/worker/odoo/client";
import { MODEL_CATALOG } from "../src/worker/catalog/model-catalog";
import { processIncrementalCycle } from "../src/worker/sync/processors";
import { rebuildFatoCertificado } from "../src/worker/fatos/fato-certificado";
import { queryCertificados } from "../src/lib/reports/queries/fiscal-complementar";

const L1C = ["sped.certificado", "finan.baixa.lancamento", "pedido.faturamento"];

async function main(): Promise<void> {
  const client = clientFromEnv();
  await client.authenticate();

  const catalog = MODEL_CATALOG.filter((e) => L1C.includes(e.odooModel));
  console.log("[l1c] sync incremental:", catalog.map((c) => c.odooModel).join(", "));
  await processIncrementalCycle({ prisma, client }, catalog, undefined, "ondemand");

  // 1. Contagem raw vs Odoo
  const counts: Record<string, () => Promise<number>> = {
    "sped.certificado": () => prisma.rawSpedCertificado.count(),
    "finan.baixa.lancamento": () => prisma.rawFinanBaixaLancamento.count(),
    "pedido.faturamento": () => prisma.rawPedidoFaturamento.count(),
  };
  for (const m of L1C) {
    const odoo = await client.executeKw<number>(m, "search_count", [[]]);
    const local = await counts[m]!();
    console.log(`[count] ${m}: raw=${local} odoo=${odoo} ${local === odoo ? "OK" : "DIVERGE"}`);
  }

  // 2. raw_sped_certificado não pode conter senha nem arquivo
  const cert = await prisma.rawSpedCertificado.findFirst();
  const keys = cert ? Object.keys(cert.data as Record<string, unknown>) : [];
  console.log(
    `[seguranca] raw_sped_certificado tem senha? ${keys.includes("senha")} | arquivo? ${keys.includes("arquivo")}`,
  );
  console.log(`[seguranca] chaves guardadas: ${keys.join(", ")}`);

  // 3. Builder + tool
  const n = await rebuildFatoCertificado(prisma);
  console.log(`[fato] fato_certificado reconstruído: ${n} linhas`);
  const certs = await queryCertificados(prisma);
  console.log(`[tool] queryCertificados -> ${certs.total} certificados:`);
  for (const c of certs.linhas) {
    console.log(`  ${c.tipo} ${c.proprietario} (${c.cnpjCpf}) válido até ${c.dataFimValidade}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[l1c] FALHA:", err);
  process.exit(1);
});
