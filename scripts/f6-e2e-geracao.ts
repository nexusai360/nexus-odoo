// scripts/f6-e2e-geracao.ts
// E2E do GERADOR contra o DADO REAL do cache (caminho deterministico, 0 LLM).
// Prova que o cerebro novo (catalogo -> template/plano -> amostra real -> revisor ->
// build) produz um relatorio COERENTE e que as invariantes anti-Frankenstein valem
// contra o dado de verdade. Rodar: npx tsx --env-file=.env.local scripts/f6-e2e-geracao.ts
import { obterProdutor } from "@/lib/reports/builder/source-registry";
import { listarMetricas } from "@/lib/reports/builder/agent/geracao/metric-catalog";
import { templatePadrao } from "@/lib/reports/builder/agent/geracao/template-padrao";
import { resolverAmostra } from "@/lib/reports/builder/agent/geracao/amostra";
import { revisarPlano } from "@/lib/reports/builder/agent/geracao/revisor";
import { buildFichaDoPlano } from "@/lib/reports/builder/agent/geracao/build-plano";
import { pipelineGeracao } from "@/lib/reports/builder/agent/geracao/pipeline";
import type { Plano, Bloco } from "@/lib/reports/builder/agent/geracao/plano-types";
import type { GeracaoDeps } from "@/lib/reports/builder/agent/geracao/types";

const resolver = async (fato: string, shape: string) => {
  const p = obterProdutor(fato, shape as never);
  if (!p) return { linhas: [] as Record<string, unknown>[] };
  const r = await p({});
  return { linhas: r.linhas, kpis: r.kpis };
};

const deps: GeracaoDeps = {
  criarCliente: async () => ({ erro: "nao_usado_no_gerar_ja" }),
  logUsage: async () => {},
  resolver,
};

let falhas = 0;
function check(nome: string, cond: boolean, extra?: unknown) {
  const ok = cond ? "OK " : "FALHA";
  if (!cond) falhas++;
  console.log(`  [${ok}] ${nome}${extra !== undefined ? ` , ${JSON.stringify(extra)}` : ""}`);
}

async function main() {
  const metricas = listarMetricas({ dominiosPermitidos: ["estoque"] });
  console.log(`\n=== Catalogo de metricas (estoque): ${metricas.length} metricas ===`);
  console.log(metricas.map((m) => `${m.id} [${m.shape}${m.campoKpi ? ":" + m.campoKpi : ""}]`).join("\n"));

  // --- 1) Caminho "gerar ja" (template deterministico) contra o pipeline real ---
  console.log(`\n=== 1) pipelineGeracao modo gerar_ja (0 LLM) contra dado real ===`);
  const saida = await pipelineGeracao(
    {
      entendimento: "panorama do estoque",
      intencao: { secoes: [] },
      historico: [],
      user: { id: "e2e" },
      modo: "gerar_ja",
      dominiosPermitidos: ["estoque"],
    },
    () => {},
    deps,
  );
  console.log(`  Titulo: ${saida.ficha.titulo}`);
  console.log(`  Secoes: ${saida.ficha.secoes.map((s) => `${s.template}<${s.fato}>`).join(", ")}`);
  check("sem omitidos", saida.omitidos.length === 0, saida.omitidos);
  check("tem >=3 secoes", saida.ficha.secoes.length >= 3, saida.ficha.secoes.length);
  check("toda secao tem titulo derivado (config.titulo) ou KPIRow", saida.ficha.secoes.every((s) => s.template === "KPIRow" || typeof s.config.titulo === "string"));

  // Resolve a tira de KPIs contra o dado real e confere que os valores NAO colidem.
  const kpiSec = saida.ficha.secoes.find((s) => s.template === "KPIRow");
  if (kpiSec) {
    const raw = await resolver(kpiSec.fato, "kpis");
    const campos = (kpiSec.config.campos as string[]) ?? Object.keys(raw.kpis ?? {});
    const valores = campos.map((k) => raw.kpis?.[k]);
    console.log(`  KPIs reais: ${campos.map((k, i) => `${k}=${valores[i]}`).join(", ")}`);
    const distintos = new Set(valores.map((v) => Number(v))).size === valores.length;
    check("KPIs do panorama tem valores DISTINTOS no dado real", distintos, valores);
  }

  // --- 2) Plano ADVERSARIAL (o Frankenstein) -> revisor com amostra real ---
  console.log(`\n=== 2) Plano Frankenstein (4 rankings + KPIs repetidos) -> revisor (dado real) ===`);
  const blocosFrankenstein: Bloco[] = [
    { tipo: "KpiStrip", metricas: ["estoque.valor_total", "estoque.produtos", "estoque.negativos"] },
    { tipo: "Ranking", metrica: "estoque.valor_armazem", recorte: "armazem" },
    { tipo: "Ranking", metrica: "estoque.valor_marca", recorte: "marca" },
    { tipo: "Ranking", metrica: "estoque.valor_familia", recorte: "familia" },
    { tipo: "Ranking", metrica: "estoque.top_movimentados", recorte: "produto" },
  ];
  const planoFrank: Plano = {
    titulo: "Relatorio de Estoque Nexus",
    objetivo: "tudo junto",
    dominio: "estoque",
    blocos: blocosFrankenstein,
    filtrosIniciais: {},
  };
  const amostra = await resolverAmostra(
    metricas.filter((m) => blocosFrankenstein.some((b) => metricaRef(b, m.id))),
    { resolver },
  );
  const revisado = revisarPlano(planoFrank, { metricas, amostra });
  const rankings = revisado.plano.blocos.filter((b) => b.tipo === "Ranking").length;
  console.log(`  Ajustes do revisor: ${revisado.ajustes.map((a) => a.regra).join(", ") || "(nenhum)"}`);
  check("4 rankings viraram no maximo 1 (teto por papel)", rankings <= 1, rankings);
  const { ficha: fichaFrank, omitidos: omitFrank } = buildFichaDoPlano(revisado.plano, metricas);
  check("ficha final enxuta (<=5 secoes)", fichaFrank.secoes.length <= 5, fichaFrank.secoes.length);
  console.log(`  Ficha final: ${fichaFrank.secoes.map((s) => s.template).join(", ")} | omitidos: ${omitFrank.length}`);

  console.log(`\n=== RESULTADO: ${falhas === 0 ? "TODOS OS CHECKS PASSARAM" : `${falhas} FALHA(S)`} ===\n`);
  process.exit(falhas === 0 ? 0 : 1);
}

function metricaRef(b: Bloco, id: string): boolean {
  if (b.tipo === "KpiStrip") return b.metricas.includes(id);
  if (b.tipo === "Ranking" || b.tipo === "Tabela" || b.tipo === "Cascata") return b.metrica === id;
  return b.metricaSerie === id || b.metricaComposicao === id;
}

main().catch((e) => {
  console.error("E2E falhou:", e);
  process.exit(1);
});
