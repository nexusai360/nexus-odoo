// F6 , gate de regressao de CUSTO (runner tsx, guard E2E=1). CUSTA TOKENS (~$0,4/run):
// roda runAgent de verdade num subconjunto do golden (classe=prosseguir) e soma o
// custo real por consulta (todas as linhas LlmUsage do conversationId). Compara com
// o snapshot do MESMO cenario (modelo+flags). Spec: 2026-06-07-f6-custo-latencia-design.md.
//
// Gerar baseline:  E2E=1 COST_WRITE=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts
// Conferir:        E2E=1 npx tsx --env-file=.env.local src/lib/agent/evals/cost-regression.e2e.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { runAgent } from "../run-agent";
import { agregarCustoPorConversa } from "../llm/usage-stats";
import { GoldenSchema, type GoldenEntry } from "./golden-schema";

if (process.env.E2E !== "1") {
  console.log("SKIP cost-regression (E2E=1 para rodar contra o cache real)");
  process.exit(0);
}

const GOLDEN_PATH = join(process.cwd(), "src/lib/agent/evals/golden/golden-nex.json");
const SNAP_PATH = join(process.cwd(), "src/lib/agent/evals/golden/cost-scorecard.json");
const ALVO_USD = 0.03; // teto de sanidade (cold-cache infla; alvo real ~1c com cache+retrieval, medido separado)
const COST_KNOWN_MIN = 0.9; // >=90% das consultas com custo conhecido
const REGRESSAO_TOL = 0.25; // 25% acima do snapshot do mesmo cenario => falha (variancia de LLM)
const N = 24;

const golden: GoldenEntry[] = GoldenSchema.parse(JSON.parse(readFileSync(GOLDEN_PATH, "utf8")));
const amostra = golden
  .filter((e) => e.classe === "prosseguir" && e.toolEsperada)
  .sort((a, b) => a.id.localeCompare(b.id))
  .slice(0, N);

const mediana = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function cenarioAtual() {
  const s = await prisma.agentSettings.findUnique({
    where: { id: "global" },
    select: { routerEnabled: true, routerToolRetrieval: true, autoValidatorMode: true, intelligenceModel: true },
  });
  return {
    routerEnabled: s?.routerEnabled ?? false,
    routerToolRetrieval: s?.routerToolRetrieval ?? "shadow",
    autoValidatorMode: s?.autoValidatorMode ?? "shadow",
    modelo: s?.intelligenceModel ?? "(default)",
  };
}
const chaveCenario = (c: Record<string, unknown>): string =>
  `${c.modelo}|router=${c.routerEnabled}|retrieval=${c.routerToolRetrieval}|validator=${c.autoValidatorMode}`;

async function main(): Promise<void> {
  const cenario = await cenarioAtual();
  const chave = chaveCenario(cenario);
  const porConsulta: number[] = [];
  let comCustoConhecido = 0;
  let tokensCachedTotal = 0;
  let tokensInputTotal = 0;

  for (let idx = 0; idx < amostra.length; idx++) {
    const e = amostra[idx];
    const convId = `cost-f6-${idx}-${e.id}`;
    let res;
    try {
      res = await runAgent({
        userMessage: e.pergunta,
        conversationId: convId,
        userId: "f6-cost",
        channel: "in_app",
        isPlayground: false,
        source: "bubble",
      });
    } catch (err) {
      console.error(`[cost] runAgent THROW em ${e.id}:`, err);
      process.exit(1);
    }
    if (!res || res.ok !== true) {
      console.error(`[cost] runAgent {ok:false} em ${e.id} (credencial LLM ausente?):`, res);
      process.exit(1);
    }
    const agg = await agregarCustoPorConversa(convId);
    if (agg.nReqs === 0) {
      console.warn(`[cost] ${e.id}: 0 linhas LlmUsage`);
      continue;
    }
    if (agg.todosCustoConhecido) comCustoConhecido += 1;
    porConsulta.push(agg.custoUsdTotal);
    tokensCachedTotal += agg.tokensCachedInput;
    tokensInputTotal += agg.tokensInput;
    console.log(
      `[cost] ${e.id}: $${agg.custoUsdTotal.toFixed(5)} reqs=${agg.nReqs} origins=${Object.keys(agg.breakdownPorOrigin).join(",")}`,
    );
  }

  if (porConsulta.length === 0) {
    console.error("FALHA: nenhuma consulta medida");
    process.exit(1);
  }
  const fracaoConhecida = comCustoConhecido / porConsulta.length;
  const media = porConsulta.reduce((a, b) => a + b, 0) / porConsulta.length;
  const med = mediana(porConsulta);
  const cacheHitRate = tokensInputTotal > 0 ? tokensCachedTotal / tokensInputTotal : 0;
  const scorecard = {
    cenario,
    chave,
    n: porConsulta.length,
    mediaUsd: media,
    medianaUsd: med,
    maxUsd: Math.max(...porConsulta),
    fracaoCustoConhecido: fracaoConhecida,
    cacheHitRate,
  };
  console.log("SCORECARD", JSON.stringify(scorecard, null, 2));

  if (fracaoConhecida < COST_KNOWN_MIN) {
    console.error(
      `FALHA: costKnown insuficiente (${(fracaoConhecida * 100).toFixed(0)}% < ${COST_KNOWN_MIN * 100}%)`,
    );
    process.exit(1);
  }
  if (med > ALVO_USD) {
    console.error(`FALHA: mediana $${med.toFixed(5)} > teto $${ALVO_USD}`);
    process.exit(1);
  }
  if (existsSync(SNAP_PATH)) {
    const prev = JSON.parse(readFileSync(SNAP_PATH, "utf8"));
    if (prev.chave === chave && media > prev.mediaUsd * (1 + REGRESSAO_TOL)) {
      console.error(
        `FALHA: regressao , media $${media.toFixed(5)} > baseline $${prev.mediaUsd.toFixed(5)} +${REGRESSAO_TOL * 100}%`,
      );
      process.exit(1);
    }
  }
  if (process.env.COST_WRITE === "1") {
    writeFileSync(SNAP_PATH, JSON.stringify(scorecard, null, 2));
    console.log("baseline gravado:", SNAP_PATH);
  }
  console.log("OK , custo dentro do teto e sem regressao");
  process.exit(0);
}

void main();
