#!/usr/bin/env tsx
/**
 * Discovery ao vivo do REGIME TRIBUTARIO (Fase 5). Read-only: fields_get +
 * search_read em sped.empresa e res.company, filtrando campos que cheiram a
 * regime/tributacao/simples/CRT. Decide se da pra distinguir Lucro Real x
 * Presumido x Simples por empresa com o dado do Odoo (que NAO sincronizamos hoje).
 *
 *   npx tsx --env-file=.env.local scripts/discovery/regime-tributario.ts
 */
import { clientFromEnv } from "@/worker/odoo/client";

const RX = /regim|tribut|simples|lucro|crt|enquadr|perfil|anexo|cnae|natureza|federal|presumid|real/i;

async function dump(client: ReturnType<typeof clientFromEnv>, modelo: string) {
  console.log(`\n===== ${modelo} =====`);
  let fg: Record<string, unknown> = {};
  try {
    fg = await client.fieldsGet(modelo);
  } catch (e) {
    console.log(`  fields_get falhou: ${String(e)}`);
    return;
  }
  const regimeFields = Object.entries(fg)
    .map(([nome, meta]) => {
      const m = meta as { type?: string; string?: string; selection?: [string, string][] };
      return { nome, tipo: m.type ?? "?", label: m.string ?? "", selection: m.selection };
    })
    .filter((f) => RX.test(f.nome) || RX.test(f.label));

  console.log(`  campos de regime/tributacao (${regimeFields.length}):`);
  for (const f of regimeFields) {
    const sel = f.selection ? ` selection=${JSON.stringify(f.selection)}` : "";
    console.log(`   - ${f.nome} [${f.tipo}] "${f.label}"${sel}`);
  }

  // Le os valores desses campos para todas as empresas (+ um campo de nome).
  const nomeField = ["razao_social", "nome", "name", "display_name"].find((n) => n in fg) ?? "id";
  const partField = "participante_id" in fg ? ["participante_id"] : [];
  const fields = ["id", nomeField, ...partField, ...regimeFields.map((f) => f.nome)];
  try {
    const regs = await client.searchRead<Record<string, unknown>>(modelo, [], fields, { limit: 30 });
    console.log(`  valores por registro (${regs.length}):`);
    for (const r of regs) {
      const nome = r[nomeField] ?? r["participante_id"] ?? r["id"];
      const vals = regimeFields.map((f) => `${f.nome}=${JSON.stringify(r[f.nome])}`).join("  ");
      console.log(`   * ${JSON.stringify(nome)} :: ${vals}`);
    }
  } catch (e) {
    console.log(`  search_read falhou: ${String(e)}`);
  }
}

async function main() {
  const client = clientFromEnv("read");
  await client.authenticate();
  for (const modelo of ["sped.empresa", "res.company", "sped.faturamento.simples"]) {
    await dump(client, modelo);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
