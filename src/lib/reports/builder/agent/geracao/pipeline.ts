// src/lib/reports/builder/agent/geracao/pipeline.ts
// ORQUESTRADOR do motor de geracao (clique do Gerar). Encadeia 4 fases:
//   blueprint (LLM medio) -> revisao adversarial (LLM alto) -> build (deterministico)
//   -> validacao (deterministico). Emite progresso REAL: pctBase ao entrar na fase +
// heartbeats conforme os tokens chegam (barra avanca de verdade, sem rastejar e
// saltar). Degrade elegante: se a revisao falha, segue com o blueprint da fase 1.
// Billing isolado: logUsage por chamada LLM.
import type { ProviderClient } from "@/lib/agent/llm/types";
import { criarClienteConstrutorPadrao } from "../run-builder";
import { logUsage as logUsagePadrao } from "@/lib/agent/llm/usage-logger";
import type { EntradaGeracao, SaidaGeracao, GeracaoDeps, ProgressoGeracao, FaseGeracao } from "./types";
import type { Blueprint } from "./blueprint-types";
import { promptBlueprint, parseBlueprint } from "./blueprint";
import { promptRevisao, parseRevisao } from "./revisar";
import { buildFicha } from "./build";
import { validarFichaGerada } from "./validar";
import { FAIXAS, frasesDe } from "./progresso";

const DEPS_PADRAO: GeracaoDeps = {
  criarCliente: criarClienteConstrutorPadrao,
  logUsage: logUsagePadrao,
};

type Emit = (p: ProgressoGeracao) => void;

/** Roda uma fase LLM emitindo heartbeats reais dentro da faixa da fase. */
async function rodarFaseLLM(args: {
  cliente: ProviderClient;
  messages: ReturnType<typeof promptBlueprint>;
  effort: "medium" | "high";
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
    reasoningEffort: args.effort,
    stream: true,
    onToken: () => {
      tokens += 1;
      // Avanco assintotico ate (ate-1): a barra se move a cada token sem nunca
      // alcancar o alvo antes da fase concluir.
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

export async function pipelineGeracao(
  entrada: EntradaGeracao,
  onProgresso: Emit,
  deps: GeracaoDeps = DEPS_PADRAO,
): Promise<SaidaGeracao> {
  const clienteOuErro = await deps.criarCliente();
  if ("erro" in clienteOuErro) throw new Error(`geracao_sem_cliente: ${clienteOuErro.erro}`);
  const cliente = clienteOuErro as ProviderClient;

  const omitidos: string[] = [];

  // --- Fase 1: blueprint ---
  const rawBlueprint = await rodarFaseLLM({
    cliente, messages: promptBlueprint(entrada), effort: "medium",
    fase: "blueprint", emit: onProgresso, deps, userId: entrada.user.id,
  });
  let blueprint: Blueprint;
  try {
    const parsed = parseBlueprint(rawBlueprint);
    blueprint = parsed.blueprint;
    omitidos.push(...parsed.omitidos);
  } catch (e) {
    throw new Error(`blueprint_invalido: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (blueprint.secoes.length === 0) throw new Error("blueprint_vazio");

  // --- Fase 2: revisao (degrade elegante se falhar) ---
  try {
    const rawRevisao = await rodarFaseLLM({
      cliente, messages: promptRevisao(blueprint), effort: "high",
      fase: "revisao", emit: onProgresso, deps, userId: entrada.user.id,
    });
    const r = parseRevisao(rawRevisao, blueprint);
    if (r.blueprint.secoes.length > 0) blueprint = r.blueprint;
  } catch {
    // Critica e melhoria, nao bloqueio: segue com o blueprint da fase 1. A barra
    // ja avancou pela faixa de revisao; nao anunciamos trabalho que nao ocorreu.
  }

  // --- Fase 3: build (deterministico) ---
  onProgresso({ fase: "build", pct: FAIXAS.build.de, frase: frasesDe("build")[0] });
  const { ficha, omitidos: omitidosBuild } = buildFicha(blueprint);
  omitidos.push(...omitidosBuild);

  // --- Fase 4: validacao (deterministico) ---
  onProgresso({ fase: "validacao", pct: FAIXAS.validacao.de, frase: frasesDe("validacao")[0] });
  validarFichaGerada(ficha);
  onProgresso({ fase: "validacao", pct: 100, frase: frasesDe("validacao")[0] });

  return { ficha, omitidos, blueprint };
}
