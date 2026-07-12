// src/lib/reports/builder/agent/geracao/pipeline.ts
// ORQUESTRADOR do motor de geracao (clique do Gerar). Ordem:
//   compositor (LLM alto) -> amostra leve -> critico semantico (LLM alto) ->
//   revisor deterministico (codigo) -> build -> validacao.
// "gerar_ja": template deterministico (0 LLM). "regenerar": reusa o ultimoPlano (pula
// o compositor). A COERENCIA e garantida pelo revisor (codigo), nao pelo prompt; o
// critico so faz o juizo semantico. Billing isolado: logUsage por chamada LLM.
import type { ChatMessage, ProviderClient } from "@/lib/agent/llm/types";
import { criarClienteConstrutorPadrao } from "../run-builder";
import { logUsage as logUsagePadrao } from "@/lib/agent/llm/usage-logger";
import { obterProdutor } from "../../source-registry";
import type { ShapeDerivado } from "../../types";
import type { EntradaGeracao, SaidaGeracao, GeracaoDeps, ProgressoGeracao, FaseGeracao } from "./types";
import { listarMetricas, obterMetrica, dominiosRegistrados } from "./metric-catalog";
import type { Metrica } from "./metric-catalog";
import type { Plano } from "./plano-types";
import { intencaoCuradaDeColeta } from "../../journey/intencao-curada";
import { promptCompositor, parseCompositor } from "./compositor";
import { resolverAmostra } from "./amostra";
import type { AmostraMetrica } from "./amostra";
import { promptCritico, parseCritico } from "./critico";
import { revisarPlano } from "./revisor";
import { buildFichaDoPlano } from "./build-plano";
import { validarFichaGerada } from "./validar";
import { FAIXAS, frasesDe } from "./progresso";

const DEPS_PADRAO: GeracaoDeps = {
  criarCliente: criarClienteConstrutorPadrao,
  logUsage: logUsagePadrao,
  // A amostra que o critico (LLM) e o revisor (codigo) usam para decidir o formato do
  // relatorio (escalares, cardinalidade, topN, numero de pontos da serie) sai daqui.
  // `produtor({})` NAO le o historico inteiro: o piso da data de inicio das analises vive
  // dentro do produtor (source-registry), entao a amostra ja nasce dentro da janela que a
  // plataforma analisa , do contrario o critico decidiria com base em meses pre-corte
  // ("a serie tem pontos suficientes" seria verdade so por causa deles).
  resolver: async (fato, shape) => {
    const produtor = obterProdutor(fato, shape as ShapeDerivado);
    if (!produtor) return { linhas: [] };
    const raw = await produtor({});
    return { linhas: raw.linhas, kpis: raw.kpis };
  },
};

type Emit = (p: ProgressoGeracao) => void;

/** Roda uma fase LLM emitindo heartbeats reais dentro da faixa da fase. */
async function rodarFaseLLM(args: {
  cliente: ProviderClient;
  messages: ChatMessage[];
  fase: FaseGeracao;
  emit: Emit;
  deps: GeracaoDeps;
  userId: string;
}): Promise<string> {
  const { de, ate } = FAIXAS[args.fase];
  const frases = frasesDe(args.fase);
  let pct = de;
  let tokens = 0;
  args.emit({ fase: args.fase, pct, frase: frases[0] });

  const res = await args.cliente.chat({
    messages: args.messages,
    reasoningEffort: "high",
    stream: true,
    onToken: () => {
      tokens += 1;
      pct = Math.min(ate - 1, pct + (ate - 1 - pct) * 0.08);
      args.emit({ fase: args.fase, pct: Math.round(pct), frase: frases[Math.floor(tokens / 6) % frases.length] });
    },
  });

  await args.deps.logUsage({
    provider: args.cliente.provider,
    model: args.cliente.model,
    tokensInput: res.usage.tokensInput,
    tokensOutput: res.usage.tokensOutput,
    tokensCachedInput: res.usage.tokensCachedInput,
    reasoningTokens: res.reasoningTokens ?? null,
    toolCallsCount: 0,
    toolNames: [],
    userId: args.userId,
    origin: "construtor",
  });

  return res.message ?? "";
}

/** Metricas referenciadas por um plano (para resolver a amostra). */
function metricasDoPlano(plano: Plano, metricas: Metrica[]): Metrica[] {
  const ids = new Set<string>();
  for (const b of plano.blocos) {
    if (b.tipo === "KpiStrip") b.metricas.forEach((id) => ids.add(id));
    else if (b.tipo === "Ranking" || b.tipo === "Tabela" || b.tipo === "Cascata" || b.tipo === "Medidor") ids.add(b.metrica);
    else if (b.tipo === "TendenciaDistribuicao") {
      ids.add(b.metricaSerie);
      ids.add(b.metricaComposicao);
    }
  }
  return Array.from(ids)
    .map((id) => obterMetrica(metricas, id))
    .filter((m): m is Metrica => !!m);
}

export async function pipelineGeracao(
  entrada: EntradaGeracao,
  onProgresso: Emit,
  deps: GeracaoDeps = DEPS_PADRAO,
): Promise<SaidaGeracao> {
  // Sem RBAC explicito, cobre TODOS os dominios registrados (estoque + financeiro + ...).
  const dominios = entrada.dominiosPermitidos ?? dominiosRegistrados();
  const metricas = listarMetricas({ dominiosPermitidos: dominios });
  const curada = intencaoCuradaDeColeta(entrada.intencao, entrada.entendimento);
  const omitidos: string[] = [];
  const ehGerarJa = entrada.modo === "gerar_ja";
  const ehRegenerar = !!entrada.ajuste && !!entrada.ultimoPlano;

  let plano: Plano;
  let amostra: AmostraMetrica[];

  if (ehGerarJa) {
    // Atalho deterministico (0 LLM): template padrao do dominio.
    const { templatePadrao } = await import("./template-padrao");
    plano = templatePadrao(entrada.dominioTemplate ?? curada.dominio, metricas);
    if (plano.blocos.length === 0) throw new Error("template_padrao_vazio");
    onProgresso({ fase: "amostra", pct: FAIXAS.amostra.de, frase: frasesDe("amostra")[0] });
    amostra = await resolverAmostra(metricasDoPlano(plano, metricas), { resolver: deps.resolver });
  } else {
    const clienteOuErro = await deps.criarCliente();
    if ("erro" in clienteOuErro) throw new Error(`geracao_sem_cliente: ${clienteOuErro.erro}`);
    const cliente = clienteOuErro as ProviderClient;

    // --- Compositor (ou reuso do ultimoPlano no regenerar) ---
    if (ehRegenerar) {
      plano = entrada.ultimoPlano!;
    } else {
      const raw = await rodarFaseLLM({
        cliente, messages: promptCompositor(curada, metricas),
        fase: "compositor", emit: onProgresso, deps, userId: entrada.user.id,
      });
      const parsed = parseCompositor(raw, metricas);
      plano = parsed.plano;
      omitidos.push(...parsed.omitidos);
      if (plano.blocos.length === 0) throw new Error("plano_vazio");
    }

    // --- Amostra leve (para o critico julgar com base no dado) ---
    onProgresso({ fase: "amostra", pct: FAIXAS.amostra.de, frase: frasesDe("amostra")[0] });
    const amostraCritico = await resolverAmostra(metricasDoPlano(plano, metricas), { resolver: deps.resolver });

    // --- Critico semantico (degrade elegante: mantem o plano se falhar) ---
    const rawC = await rodarFaseLLM({
      cliente, messages: promptCritico(curada, plano, amostraCritico),
      fase: "critico", emit: onProgresso, deps, userId: entrada.user.id,
    });
    try {
      const c = parseCritico(rawC, metricas);
      if (c.plano.blocos.length > 0) plano = c.plano;
    } catch {
      // mantem o plano do compositor
    }
    amostra = await resolverAmostra(metricasDoPlano(plano, metricas), { resolver: deps.resolver });
  }

  // --- Revisor deterministico: forca as invariantes (resolve valores) ---
  const revisado = revisarPlano(plano, { metricas, amostra });

  // --- Build deterministico ---
  onProgresso({ fase: "build", pct: FAIXAS.build.de, frase: frasesDe("build")[0] });
  const { ficha, omitidos: omitidosBuild } = buildFichaDoPlano(revisado.plano, metricas);
  omitidos.push(...omitidosBuild);

  // --- Validacao deterministica ---
  onProgresso({ fase: "validacao", pct: FAIXAS.validacao.de, frase: frasesDe("validacao")[0] });
  validarFichaGerada(ficha);
  onProgresso({ fase: "validacao", pct: 100, frase: frasesDe("validacao")[0] });

  return { ficha, omitidos, plano: revisado.plano };
}
