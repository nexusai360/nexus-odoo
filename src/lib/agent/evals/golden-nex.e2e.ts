// F5 Evals , harness do golden (runner tsx, guard E2E=1).
// Mede 3 dimensoes deterministicas contra o cache real: NUMERO (kpiOuro x tool),
// ALUCINACAO (gap honesto), DESAMBIGUACAO. A 4a dimensao (selecao/recall@K) vive
// no retrieval.e2e.ts (depende de embeddings). Spec: 2026-06-07-f5-evals-golden-design.md.
//
// Rodar (grava scorecard):
//   E2E=1 GOLDEN_WRITE=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-nex.e2e.ts
// Conferir:
//   E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/golden-nex.e2e.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { catalogo } from "../../../../mcp/catalog/index";
import { type ToolEntry } from "../../../../mcp/catalog/types";
import { GoldenSchema, type GoldenEntry } from "./golden-schema";
import { contemMarcadorNaoOperado, contemAfirmacaoFactual } from "./marcadores";
import type { UserContext } from "../../../../mcp/auth/user-context";

const GOLDEN_PATH = join(process.cwd(), "src/lib/agent/evals/golden/golden-nex.json");
const SCORE_PATH = join(process.cwd(), "src/lib/agent/evals/golden/golden-scorecard.json");
const golden: GoldenEntry[] = GoldenSchema.parse(JSON.parse(readFileSync(GOLDEN_PATH, "utf8")));
const ctx = { prisma, user: { userId: "f5-golden", role: "super_admin", domains: [] } as UserContext };
const byId = new Map((catalogo as ToolEntry[]).map((t) => [t.id, t]));

type Env = {
  estado?: string;
  _RESPOSTA?: string;
  registrado?: boolean;
  redirecionar?: unknown;
  dados?: Record<string, unknown>;
};

function respostaDe(env: Env): string {
  // FreshnessEnvelope (tools de dado): _RESPOSTA dentro de dados.
  // Output cru (registrar_lacuna): _RESPOSTA no topo.
  if (env.dados !== undefined) return String(env.dados._RESPOSTA ?? "");
  return String(env._RESPOSTA ?? "");
}
function getKpi(env: Env, chave: string): unknown {
  const d = env.dados ?? {};
  const dest = (d._DESTAQUE ?? {}) as Record<string, unknown>;
  const agg = (d._agregado ?? {}) as Record<string, unknown>;
  return dest[chave] ?? agg[chave];
}

async function rodar(e: GoldenEntry, argsOverride?: Record<string, unknown>): Promise<Env | null> {
  const tool = byId.get(e.toolEsperada ?? "");
  if (!tool) return null;
  const parsed = tool.inputSchema.parse(argsOverride ?? e.args ?? {});
  return (await tool.handler(parsed, ctx)) as Env;
}

async function dimensaoNumero(e: GoldenEntry): Promise<string[]> {
  if (!e.kpiOuro) return [];
  const env = await rodar(e);
  if (!env) return [`${e.id}: tool ${e.toolEsperada} nao existe`];
  if (env.estado === "preparando") return []; // fato sem build , skip (nao falha)
  const falhas: string[] = [];
  for (const k of e.kpiOuro) {
    const got = getKpi(env, k.chave);
    const m = k.match ?? "exato";
    if (m === "exato") {
      if (String(got) !== String(k.valor)) falhas.push(`${e.id}.${k.chave}: ouro=${k.valor} got=${got}`);
    } else {
      const d = Math.abs(Number(got) - Number(k.valor));
      const tol = m === "centavos" ? (k.delta ?? 0.01) : (k.delta ?? 0);
      if (!(d <= tol)) falhas.push(`${e.id}.${k.chave}: ouro=${k.valor}+-${tol} got=${got}`);
    }
  }
  return falhas;
}

async function dimensaoAlucinacao(e: GoldenEntry): Promise<string[]> {
  if (e.toolEsperada === "registrar_lacuna") {
    // Sub-classe A: dominio vazio sem tool. registrar_lacuna recebe perguntaResumo.
    const env = await rodar(e, { perguntaResumo: e.pergunta, ...(e.dominio ? { dominio: e.dominio } : {}) });
    if (!env) return [`${e.id}: registrar_lacuna indisponivel`];
    // Redirecionar honesto (sem _RESPOSTA) = ok; senao, NAO pode afirmar factual.
    if (env.redirecionar) return [];
    const resp = respostaDe(env);
    return contemAfirmacaoFactual(resp) ? [`${e.id}: registrar_lacuna afirmou factual: "${resp.slice(0, 90)}"`] : [];
  }
  // Sub-classe B: tool de dominio com dado vazio.
  const env = await rodar(e);
  if (!env) return [`${e.id}: tool ${e.toolEsperada} nao existe`];
  if (env.estado === "preparando") return [];
  const resp = respostaDe(env);
  const ok = env.estado === "vazio" || contemMarcadorNaoOperado(resp);
  return ok ? [] : [`${e.id}: esperava vazio/nao-operado, estado=${env.estado} resp="${resp.slice(0, 90)}"`];
}

async function dimensaoDesambiguacao(e: GoldenEntry): Promise<string[]> {
  const env = await rodar(e);
  if (!env) return [`${e.id}: tool ${e.toolEsperada} nao existe`];
  if (env.estado === "preparando") return [];
  const amb = (env.dados ?? {}).ambiguidade;
  const linhas = ((env.dados ?? {}).linhas ?? []) as unknown[];
  const esp = e.esperaAmbiguidade ?? {};
  // Tolerante: o "chute" perigoso e retornar EXATAMENTE 1 entidade para um termo
  // ambiguo sem sinalizar. Listar varias (tool de busca/lista) e transparente =
  // honesto. Passa se: trouxe ambiguidade OU (tolerante E nao retornou exatamente 1).
  const ok = Boolean(amb) || (esp.toleranteResultadoUnico === true && linhas.length !== 1);
  return ok ? [] : [`${e.id}: retornou 1 match para termo ambiguo sem sinalizar (possivel chute)`];
}

async function main() {
  if (process.env.E2E !== "1") {
    console.log("SKIP: defina E2E=1 para rodar o golden contra o cache real.");
    return;
  }
  const score = {
    numero: { ok: 0, falhas: [] as string[] },
    alucinacao: { casos: 0, alucinou: 0, falhas: [] as string[] },
    desambiguacao: { ok: 0, falhas: [] as string[] },
  };
  for (const e of golden) {
    try {
      if (e.classe === "prosseguir" && e.kpiOuro) {
        const f = await dimensaoNumero(e);
        if (f.length === 0) score.numero.ok++;
        else score.numero.falhas.push(...f);
      } else if (e.classe === "falta_honesta") {
        score.alucinacao.casos++;
        const f = await dimensaoAlucinacao(e);
        if (f.length) {
          score.alucinacao.alucinou++;
          score.alucinacao.falhas.push(...f);
        }
      } else if (e.classe === "desambiguacao") {
        const f = await dimensaoDesambiguacao(e);
        if (f.length === 0) score.desambiguacao.ok++;
        else score.desambiguacao.falhas.push(...f);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      score.numero.falhas.push(`${e.id}: EXCECAO ${msg}`);
    }
  }
  const serial = JSON.stringify(score, null, 2) + "\n";
  if (process.env.GOLDEN_WRITE === "1") {
    writeFileSync(SCORE_PATH, serial);
    console.log("SCORECARD_GRAVADO ->", SCORE_PATH);
  }
  console.log(serial);
  const vermelho =
    score.numero.falhas.length > 0 || score.alucinacao.alucinou > 0 || score.desambiguacao.falhas.length > 0;
  if (vermelho) {
    console.error("GOLDEN_VERMELHO");
    process.exitCode = 1;
  } else {
    console.log(`GOLDEN_VERDE , numero ok=${score.numero.ok}, alucinacao 0/${score.alucinacao.casos}, desamb ok=${score.desambiguacao.ok}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
