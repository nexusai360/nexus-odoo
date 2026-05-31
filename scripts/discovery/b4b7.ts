#!/usr/bin/env tsx
/**
 * Discovery ao vivo B4-B7. Read-only. Descobre nomes reais por prefixo
 * (ir.model) + search_count + fields_get. Detalhe em /tmp/b4b7.json; stdout
 * compacto.
 *   npx tsx --env-file=.env.local scripts/discovery/b4b7.ts
 */
import { writeFileSync } from "node:fs";
import { clientFromEnv } from "@/worker/odoo/client";

const EXPLICITOS = [
  // B4 , comercial (cotação/comissão/reajuste)
  "pedido.documento.cotacao", "pedido.documento.cotacao.item", "pedido.documento.cotacao.analise",
  "pedido.comissao", "pedido.documento.reajuste", "pedido.documento.reajuste.item",
  // B5 , produção
  "producao.processo", "producao.centro.trabalho", "producao.parametro.qualidade",
  "producao.alteracao.materia.prima", "producao.alteracao.materia.prima.item",
  // B6 , estoque avançado / WMS
  "estoque.local.endereco", "estoque.minimo.maximo", "estoque.norma.palete",
  "estoque.norma.palete.item", "estoque.tipo.palete", "estoque.requisito",
  // B7 , CRM + auditoria
  "crm.pipeline", "crm.pipeline.etapa", "auditoria.regra",
];
const PREFIXOS = ["wms.", "auditoria.", "producao.", "pedido.comissao", "pedido.documento.cotacao", "pedido.documento.reajuste"];

async function main() {
  const client = clientFromEnv("read");
  const uid = await client.authenticate();

  // Descobre nomes reais por prefixo
  const descobertos = new Set<string>(EXPLICITOS);
  for (const p of PREFIXOS) {
    try {
      const rows = await client.searchRead<{ model: string }>(
        "ir.model", [["model", "like", p]], ["model"], { limit: 200 },
      );
      for (const r of rows) descobertos.add(r.model);
    } catch (e) {
      console.log(`(ir.model like ${p} falhou: ${e instanceof Error ? e.message : e})`);
    }
  }

  const modelos = Array.from(descobertos).sort();
  const achados: Record<string, unknown>[] = [];
  for (const modelo of modelos) {
    try {
      const count = await client.executeKw<number>(modelo, "search_count", [[]]);
      let campos: { nome: string; tipo: string; label: string }[] = [];
      try {
        const fg = await client.fieldsGet(modelo);
        campos = Object.entries(fg).map(([nome, meta]) => {
          const m = meta as { type?: string; string?: string };
          return { nome, tipo: m.type ?? "?", label: m.string ?? "" };
        });
      } catch { /* ignore */ }
      let amostra: unknown[] = [];
      if (count > 0) {
        try { amostra = await client.searchRead(modelo, [], [], { limit: 2 }); } catch { /* ignore */ }
      }
      achados.push({ modelo, existe: true, count, campos, amostra });
      console.log(`✓ ${modelo} , count=${count} , campos=${campos.length}`);
    } catch (e) {
      achados.push({ modelo, existe: false, count: null, erro: e instanceof Error ? e.message : String(e) });
      console.log(`✗ ${modelo} , NÃO EXISTE :: ${e instanceof Error ? e.message : e}`);
    }
  }
  writeFileSync("/tmp/b4b7.json", JSON.stringify(achados, null, 2));
  console.log(`\nuid=${uid} , ${achados.length} modelos , detalhe em /tmp/b4b7.json`);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
