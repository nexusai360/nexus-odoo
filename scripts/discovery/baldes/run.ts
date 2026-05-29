#!/usr/bin/env tsx
/**
 * R2 Discovery enxuto: classifica os 652 modelos do Odoo em 3 baldes.
 * Spec: docs/superpowers/specs/2026-05-29-r2-discovery-enxuto-spec.md v3.
 *
 * CLI:
 *   npm run discovery:baldes                # passe completo
 *   npm run discovery:baldes -- --dry-run   # imprime totais, nao escreve
 *   npm run discovery:baldes -- --limit 30  # so os 30 primeiros (smoke)
 *   npm run discovery:baldes -- --only a.b,c.d  # reclassifica e faz merge
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { clientFromEnv, type OdooClient } from "@/worker/odoo/client";
import {
  classificarOffline,
  classificarComCount,
  previsaoAtivacao,
  dominioDe,
} from "@/lib/discovery/baldes/classify";
import { classificarComErro } from "@/lib/discovery/baldes/error-kind";
import { searchCount } from "@/lib/discovery/baldes/count-client";
import { agregar } from "@/lib/discovery/baldes/aggregate";
import { gerarRelatorio } from "@/lib/discovery/baldes/report";
import { BALDE_A_MIN, BALDE_B_MAX } from "@/lib/discovery/baldes/constants";
import type {
  EntradaBalde,
  ModeloSchema,
  NaoClassificado,
  ResultadoBaldes,
} from "@/lib/discovery/baldes/types";

const ROOT = process.cwd();
const SCHEMA_PATH = "discovery/odoo-schema/schema.json";
const JSON_OUT = "discovery/odoo-schema/baldes.json";
const REPORT_OUT = "docs/discovery/2026-05-29-baldes.md";
const CONCORRENCIA = 6;

interface SchemaEntry {
  name?: string;
  transient?: boolean;
}

interface CliArgs {
  dryRun: boolean;
  limit: number | null;
  only: string[] | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, limit: null, only: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") {
      const n = parseInt(argv[++i] ?? "", 10);
      // --limit sem valor numérico é ignorado (passe completo), nunca vira 0
      // silencioso (que classificaria zero modelo). Code review R2.
      args.limit = Number.isNaN(n) ? null : n;
    } else if (a === "--only") {
      const lista = (argv[++i] ?? "").split(",").filter(Boolean);
      args.only = lista.length ? lista : null;
    }
  }
  return args;
}

function carregarModelos(): ModeloSchema[] {
  const raw = JSON.parse(readFileSync(resolve(ROOT, SCHEMA_PATH), "utf8")) as Record<
    string,
    SchemaEntry
  >;
  return Object.entries(raw).map(([modelo, v]) => ({
    modelo,
    descricao: v.name ?? modelo,
    transient: Boolean(v.transient),
  }));
}

/** Roda fn sobre items com pool de concorrencia fixo. */
async function comPool<T, R>(
  items: T[],
  limite: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker));
  return out;
}

async function classificarTudo(
  modelos: ModeloSchema[],
  client: OdooClient,
): Promise<{ modelos: Record<string, EntradaBalde>; nao: NaoClassificado[] }> {
  const entradas: Record<string, EntradaBalde> = {};
  const nao: NaoClassificado[] = [];
  // Counts por prefixo, para previsao_ativacao (precisa do panorama do prefixo).
  const countsPorPrefixo = new Map<string, number[]>();

  // Fase 1: offline + RPC, coletando counts.
  type Pendente = { m: ModeloSchema; count: number };
  const pendentesB: Pendente[] = [];
  await comPool(modelos, CONCORRENCIA, async (m) => {
    const off = classificarOffline(m);
    if (off) {
      entradas[m.modelo] = {
        dominio: dominioDe(m.modelo),
        descricao: m.descricao,
        balde: off.balde,
        count: null,
        transient: m.transient,
        motivo: off.motivo,
      };
      return;
    }
    const r = await searchCount(client, m.modelo);
    if (!r.ok) {
      const viaErro = classificarComErro(r.tipo);
      if (viaErro) {
        entradas[m.modelo] = {
          dominio: dominioDe(m.modelo),
          descricao: m.descricao,
          balde: viaErro.balde,
          count: null,
          transient: m.transient,
          motivo: viaErro.motivo,
        };
      } else {
        nao.push({ modelo: m.modelo, erro: r.mensagem });
      }
      return;
    }
    const cls = classificarComCount(m, r.count);
    const dom = dominioDe(m.modelo);
    countsPorPrefixo.set(dom, [...(countsPorPrefixo.get(dom) ?? []), r.count]);
    if (cls.balde === "B") {
      pendentesB.push({ m, count: r.count });
    }
    entradas[m.modelo] = {
      dominio: dom,
      descricao: m.descricao,
      balde: cls.balde,
      count: r.count,
      transient: m.transient,
      motivo: cls.motivo,
    };
  });

  // Fase 2: previsao_ativacao do Balde B (agora que temos counts por prefixo).
  // count > 0 ja curto-circuita para em_uso dentro de previsaoAtivacao, entao
  // passar a lista completa do prefixo como "outros" e equivalente e mais simples
  // (review P2): para count === 0, o proprio 0 nao afeta o teste `.some(c > 0)`.
  for (const { m, count } of pendentesB) {
    const todos = countsPorPrefixo.get(dominioDe(m.modelo)) ?? [];
    entradas[m.modelo].previsao_ativacao = previsaoAtivacao(count, todos);
  }

  return { modelos: entradas, nao };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const client = clientFromEnv("read");
  const uid = await client.authenticate();

  let modelos = carregarModelos();
  if (args.only) {
    const set = new Set(args.only);
    modelos = modelos.filter((m) => set.has(m.modelo));
  } else if (args.limit != null) {
    modelos = modelos.slice(0, args.limit);
  }
  console.log(`[baldes] uid=${uid} modelos a classificar: ${modelos.length}`);

  const { modelos: novas, nao } = await classificarTudo(modelos, client);

  // Merge com baldes.json existente quando --only.
  let modelosFinais = novas;
  let naoFinais = nao;
  if (args.only && existsSync(resolve(ROOT, JSON_OUT))) {
    const prev = JSON.parse(readFileSync(resolve(ROOT, JSON_OUT), "utf8")) as ResultadoBaldes;
    modelosFinais = { ...prev.modelos, ...novas };
    const reprocessados = new Set(Object.keys(novas));
    naoFinais = [
      ...prev.nao_classificados.filter((n) => !reprocessados.has(n.modelo)),
      ...nao,
    ];
  }

  const { totais, por_dominio } = agregar(modelosFinais, naoFinais);
  const resultado: ResultadoBaldes = {
    gerado_em: new Date().toISOString(),
    fonte_schema: SCHEMA_PATH,
    rodou_sob_uid: uid,
    thresholds: { balde_a_min: BALDE_A_MIN, balde_b_max: BALDE_B_MAX },
    totais,
    por_dominio,
    modelos: modelosFinais,
    nao_classificados: naoFinais,
  };

  console.log(
    `[baldes] A=${totais.A} B=${totais.B} C=${totais.C} ` +
      `nao_class=${totais.nao_classificados} total=${totais.total}`,
  );

  if (args.dryRun) {
    console.log("[baldes] --dry-run: nada escrito.");
    return;
  }

  mkdirSync(resolve(ROOT, "docs/discovery"), { recursive: true });
  writeFileSync(resolve(ROOT, JSON_OUT), JSON.stringify(resultado, null, 2) + "\n");
  writeFileSync(resolve(ROOT, REPORT_OUT), gerarRelatorio(resultado));
  console.log(`[baldes] escrito ${JSON_OUT} e ${REPORT_OUT}`);
}

main().catch((e) => {
  console.error("[baldes] erro fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
