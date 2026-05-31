#!/usr/bin/env tsx
/**
 * Discovery ao vivo do B3 (financeiro , cobrança bancária). Read-only:
 * search_count + fields_get + amostra de 2 registros por modelo. Aterra a SPEC
 * antes de fixar schema/fato/tool (padrão das ondas do Balde B).
 *
 *   npx tsx --env-file=.env.local scripts/discovery/b3-financeiro-bancario.ts
 */
import { clientFromEnv } from "@/worker/odoo/client";

const MODELOS = [
  "finan.remessa",
  "finan.remessa.item",
  "finan.retorno",
  "finan.retorno.item",
  "finan.cheque",
  "finan.pix",
  "finan.carteira",
  "finan.forma.pagamento",
];

interface Achado {
  modelo: string;
  existe: boolean;
  count: number | null;
  erro?: string;
  campos?: { nome: string; tipo: string; label: string }[];
  amostra?: unknown[];
}

async function main() {
  const client = clientFromEnv("read");
  const uid = await client.authenticate();
  const achados: Achado[] = [];

  for (const modelo of MODELOS) {
    try {
      const count = await client.executeKw<number>(modelo, "search_count", [[]]);
      let campos: Achado["campos"];
      let amostra: unknown[] | undefined;
      try {
        const fg = await client.fieldsGet(modelo);
        campos = Object.entries(fg).map(([nome, meta]) => {
          const m = meta as { type?: string; string?: string };
          return { nome, tipo: m.type ?? "?", label: m.string ?? "" };
        });
      } catch (e) {
        campos = [{ nome: "(fields_get falhou)", tipo: String(e), label: "" }];
      }
      if (count > 0) {
        try {
          amostra = await client.searchRead(modelo, [], [], { limit: 2 });
        } catch {
          amostra = ["(search_read falhou)"];
        }
      }
      achados.push({ modelo, existe: true, count, campos, amostra });
    } catch (e) {
      achados.push({
        modelo,
        existe: false,
        count: null,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Saída compacta (resumo + dump JSON ao final).
  console.log(`uid=${uid}\n`);
  for (const a of achados) {
    if (!a.existe) {
      console.log(`✗ ${a.modelo} , NÃO EXISTE / sem acesso :: ${a.erro}`);
      continue;
    }
    console.log(`✓ ${a.modelo} , count=${a.count} , campos=${a.campos?.length}`);
  }
  console.log("\n===JSON===");
  console.log(JSON.stringify(achados, null, 2));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
