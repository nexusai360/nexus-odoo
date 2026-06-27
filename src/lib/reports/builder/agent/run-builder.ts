// src/lib/reports/builder/agent/run-builder.ts
// E2a/E2b , Loop do agente construtor. Recebe um pedido em linguagem natural,
// chama o modelo com o catalogo BUILDER_TOOLS, despacha as tool calls (mutando
// a ficha), valida o resultado e devolve {ficha, mensagem}. Inclui:
// - teto de quota (E3) antes de qualquer chamada;
// - reparo: ficha sem secao util volta como feedback (MAX_REPAIR);
// - recusa honesta (Caminho 3a): pedido sem fonte vira FeatureRequest + recusa;
// - billing isolado: logUsage({origin:"construtor"}) a cada chamada.
//
// A config de modelo vem do card em agente/configuracao (AgentSettings), nunca
// de um BuilderLlmConfig (cortado na correcao de 26/06).
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { buildLlmClient } from "@/lib/agent/llm/get-client";
import { logUsage } from "@/lib/agent/llm/usage-logger";
import type {
  ChatMessage,
  LlmProvider,
  ProviderClient,
  ToolCall,
} from "@/lib/agent/llm/types";
import type { LogUsageArgs } from "@/lib/agent/llm/usage-logger";
import type { BuilderReportEntry } from "../types";
import { construirToolDefs, despachar } from "./tool-bridge";
import { validarFicha } from "../tools";
import { obterConfigModeloConstrutor } from "./model-config";
import { verificarQuota, type ResultadoQuota } from "./quota";
import { obterRecursosConstrutor } from "./recursos-config";
import type { ReasoningEffort } from "@/lib/agent/llm/types";
import { SYSTEM_CONSTRUTOR } from "./prompt";
import { montarSystemJornada } from "./prompt-jornada";
import { builderProgressLabel } from "./builder-progress-labels";
import type { JourneyState, OpcaoCard } from "../journey/state";

/**
 * Evento emitido ao vivo durante o loop, para o stream SSE animar a trilha de
 * tools na bolha (igual ao Agente Nex). `label` ja vem humanizado e verbatim.
 */
export type BuilderRunEvent =
  | { type: "tool_call"; toolCallId: string; toolName: string; label: string }
  | { type: "tool_result"; toolCallId: string; toolName: string; label: string; erro: boolean }
  | { type: "choices"; titulo: string; opcoes: OpcaoCard[] };

/** Maximo de iteracoes do loop (cada uma = 1 chamada ao modelo). */
export const MAX_ITER = 8;
/** Maximo de realimentacoes de reparo quando o modelo conclui sem ficha util. */
export const MAX_REPAIR = 2;
/** Marcador que o modelo emite quando nao ha fonte para o pedido (Caminho 3a). */
export const MARCADOR_SEM_FONTE = "SEM_FONTE:";

export interface BuilderUser {
  id: string;
}

export interface RunBuilderInput {
  prompt: string;
  fichaAtual: BuilderReportEntry | null;
  user: BuilderUser;
  /** Callback ao vivo por tool call/result (alimenta a trilha do stream SSE). */
  onEvent?: (evt: BuilderRunEvent) => void;
  /** Historico de turnos anteriores (entrevista). Sem isso, a IA nao lembra. */
  historico?: { role: "user" | "assistant"; content: string }[];
  /** Estado da jornada (cobertura, fichaRascunho, fase). Modo jornada. */
  journeyState?: JourneyState;
  /** "jornada" = entrevistador adaptativo; "refino" = construtor direto (default). */
  modo?: "jornada" | "refino";
}

export interface RunBuilderResult {
  ficha: BuilderReportEntry | null;
  mensagem: string;
  /** true quando o pedido nao tem fonte (Caminho 3a). */
  recusa?: boolean;
  /** true quando o teto de uso foi atingido (E3). */
  bloqueado?: boolean;
  /** true quando houve falha tecnica (sem credencial, estouro de passos). */
  erro?: boolean;
  /** Rotulos das tools consultadas no turno (rebuild da trilha "Raciocinio"). */
  toolsCalled: { label: string }[];
  /** Duracao total do turno em ms (resumo "Raciocinio . N tools . Xs"). */
  reasoningMs: number;
  /** Estado da jornada atualizado no turno (modo jornada). */
  journeyState?: JourneyState;
}

/** Dependencias injetaveis (default = infra real). Facilita teste sem mock global. */
export interface RunBuilderDeps {
  criarCliente: () => Promise<ProviderClient | { erro: string }>;
  verificarQuota: (userId: string) => Promise<ResultadoQuota>;
  logUsage: (args: LogUsageArgs) => Promise<void>;
  registrarFeatureRequest: (
    userId: string,
    resumo: string,
    dominio: string | null,
  ) => Promise<void>;
  /** Config de raciocinio do construtor (liga o reasoning do modelo). */
  obterReasoning: () => Promise<{ ligado: boolean; effort: string | null }>;
}

/** Resolve config+credencial e constroi o ProviderClient do construtor. */
export async function criarClienteConstrutorPadrao(): Promise<
  ProviderClient | { erro: string }
> {
  const { provider, model, credentialId } = await obterConfigModeloConstrutor();
  // Usa a credencial escolhida no card; se nao houver (config antiga), cai na
  // 1a credencial cadastrada do provedor.
  const cred = credentialId
    ? await prisma.llmCredential.findUnique({ where: { id: credentialId } })
    : await prisma.llmCredential.findFirst({
        where: { provider },
        orderBy: { updatedAt: "desc" },
      });
  if (!cred?.encryptedApiKey) {
    return { erro: `sem_credencial:${provider}` };
  }
  try {
    return buildLlmClient(provider as LlmProvider, decrypt(cred.encryptedApiKey), model);
  } catch {
    return { erro: `credencial_invalida:${provider}` };
  }
}

/** Registra um gap (pedido sem fonte) deduplicando pelo resumo. */
async function registrarFeatureRequestPadrao(
  userId: string,
  resumo: string,
  dominio: string | null,
): Promise<void> {
  const perguntaResumo = resumo.slice(0, 300);
  const existente = await prisma.featureRequest.findFirst({ where: { perguntaResumo } });
  if (existente) return;
  await prisma.featureRequest.create({ data: { userId, perguntaResumo, dominio } });
}

const DEPS_PADRAO: RunBuilderDeps = {
  criarCliente: criarClienteConstrutorPadrao,
  verificarQuota,
  logUsage,
  registrarFeatureRequest: registrarFeatureRequestPadrao,
  obterReasoning: async () => {
    const r = await obterRecursosConstrutor();
    return { ligado: r.reasoningCheckpoint === "PRODUCTION", effort: r.reasoningEffort };
  },
};

/** Uma ficha so e entregavel se tem ao menos 1 secao e passa na validacao. */
function fichaUtilizavel(ficha: BuilderReportEntry | null): boolean {
  return !!ficha && ficha.secoes.length > 0 && validarFicha(ficha).ok;
}

/** Resumo compacto da ficha para o contexto do modo jornada (contem custo). */
function resumoFichaCompacto(ficha: BuilderReportEntry): string {
  const secoes = ficha.secoes.map((s) => `${s.template} sobre ${s.fato}`).join(", ");
  return `titulo "${ficha.titulo}"; secoes: ${secoes || "(nenhuma ainda)"}`;
}

function serializarResultadoTool(
  r: ReturnType<typeof despachar>,
  ficha: BuilderReportEntry | null,
): string {
  if (r.tipo === "ficha") return JSON.stringify({ ok: true, ficha });
  if (r.tipo === "leitura") return JSON.stringify(r.resultado);
  if (r.tipo === "jornada")
    return JSON.stringify({ ok: true, fase: r.journeyState.fase, entendimento: r.journeyState.entendimento });
  if (r.tipo === "opcoes")
    return JSON.stringify({ ok: true, opcoesOferecidas: r.opcoes.map((o) => o.rotulo) });
  return JSON.stringify({ erro: r.erro });
}

export async function runBuilder(
  input: RunBuilderInput,
  deps: RunBuilderDeps = DEPS_PADRAO,
): Promise<RunBuilderResult> {
  const { prompt, user, onEvent } = input;
  const t0 = Date.now();
  const toolsCalled: { label: string }[] = [];
  const tempo = () => Date.now() - t0;

  // E3 , teto antes de qualquer chamada ao modelo.
  const quota = await deps.verificarQuota(user.id);
  if (!quota.ok) {
    return {
      ficha: input.fichaAtual,
      mensagem: quota.motivo,
      bloqueado: true,
      toolsCalled,
      reasoningMs: tempo(),
      journeyState: input.journeyState,
    };
  }

  const cliente = await deps.criarCliente();
  if ("erro" in cliente) {
    return {
      ficha: null,
      mensagem:
        "Nao consegui falar com o modelo do construtor. Verifique a credencial do provedor configurado em Agente > Configuracao.",
      erro: true,
      toolsCalled,
      reasoningMs: tempo(),
      journeyState: input.journeyState,
    };
  }

  const toolDefs = construirToolDefs();
  const reasoning = await deps.obterReasoning();
  // Na jornada (entrevista), o raciocinio alto e OBRIGATORIO: a IA tem que pensar
  // bem para fazer a proxima pergunta certa / propor as opcoes, em mensagens curtas.
  const reasoningEffort: ReasoningEffort | undefined =
    (input.modo ?? "refino") === "jornada"
      ? "high"
      : reasoning.ligado
        ? ((reasoning.effort as ReasoningEffort | null) ?? "high")
        : undefined;
  const modo = input.modo ?? "refino";
  let journeyState = input.journeyState;
  let ficha: BuilderReportEntry | null = input.fichaAtual ?? journeyState?.fichaRascunho ?? null;
  let reparosRestantes = MAX_REPAIR;
  // A jornada faz mais tool calls por turno (atualizar_entendimento, oferecer_opcoes,
  // criar/adicionar secao...), entao precisa de mais iteracoes que o one-shot.
  const maxIter = modo === "jornada" ? 14 : MAX_ITER;

  const system = modo === "jornada" ? montarSystemJornada() : SYSTEM_CONSTRUTOR;
  const messages: ChatMessage[] = [{ role: "system", content: system }];
  // Historico dos turnos anteriores (entrevista). Sem isso a IA nao lembra.
  for (const h of input.historico ?? []) {
    messages.push({ role: h.role, content: h.content });
  }
  if (ficha) {
    // Modo jornada envia a ficha COMPACTA (titulo + secoes) para conter custo;
    // refino envia o JSON inteiro (precisao para ajustes).
    const fichaContexto =
      modo === "jornada"
        ? `Ficha em construcao (resumo): ${resumoFichaCompacto(ficha)}`
        : `Ficha atual (em construcao):\n${JSON.stringify(ficha)}`;
    messages.push({ role: "user", content: fichaContexto });
  }
  messages.push({ role: "user", content: prompt });

  for (let i = 0; i < maxIter; i++) {
    const res = await cliente.chat({
      messages,
      tools: toolDefs,
      temperature: modo === "jornada" ? 0.5 : 0.2,
      ...(reasoningEffort ? { reasoningEffort } : {}),
    });

    await deps.logUsage({
      provider: cliente.provider,
      model: cliente.model,
      tokensInput: res.usage.tokensInput,
      tokensOutput: res.usage.tokensOutput,
      tokensCachedInput: res.usage.tokensCachedInput,
      reasoningTokens: res.reasoningTokens ?? null,
      toolCallsCount: res.toolCalls?.length ?? 0,
      toolNames: res.toolCalls?.map((t) => t.name) ?? [],
      userId: user.id,
      origin: "construtor",
    });

    const toolCalls: ToolCall[] = res.toolCalls ?? [];
    if (toolCalls.length > 0) {
      messages.push({ role: "assistant", content: res.message ?? "", toolCalls });
      for (const tc of toolCalls) {
        const label = builderProgressLabel(tc.name);
        toolsCalled.push({ label });
        onEvent?.({ type: "tool_call", toolCallId: tc.id, toolName: tc.name, label });
        // Espelha a ficha de trabalho no rascunho ANTES de despachar, para o gate
        // de oferecer_geracao enxergar a ficha montada neste mesmo turno.
        if (journeyState) journeyState = { ...journeyState, fichaRascunho: ficha ?? undefined };
        const r = despachar(tc, ficha, journeyState);
        if (r.tipo === "ficha") {
          ficha = r.ficha;
          if (journeyState) journeyState = { ...journeyState, fichaRascunho: ficha };
        } else if (r.tipo === "jornada") {
          journeyState = r.journeyState;
        } else if (r.tipo === "opcoes") {
          onEvent?.({ type: "choices", titulo: r.titulo, opcoes: r.opcoes });
        }
        onEvent?.({
          type: "tool_result",
          toolCallId: tc.id,
          toolName: tc.name,
          label,
          erro: r.tipo === "erro",
        });
        messages.push({
          role: "tool",
          content: serializarResultadoTool(r, ficha),
          toolCallId: tc.id,
          toolName: tc.name,
        });
      }
      continue;
    }

    // Sem tool calls , o modelo deu uma resposta final.
    const msg = res.message ?? "";

    // Recusa honesta (Caminho 3a): pedido sem fonte.
    if (msg.includes(MARCADOR_SEM_FONTE)) {
      await deps.registrarFeatureRequest(user.id, prompt, ficha?.dominio ?? null);
      const limpa = msg.replace(MARCADOR_SEM_FONTE, "").trim();
      return {
        ficha,
        mensagem:
          limpa ||
          "Esse dado ainda nao tem fonte disponivel no construtor. Registrei o pedido para avaliacao.",
        recusa: true,
        toolsCalled,
        reasoningMs: tempo(),
        journeyState,
      };
    }

    // Reparo: concluiu sem ficha util -> realimenta.
    if (!fichaUtilizavel(ficha) && reparosRestantes > 0) {
      reparosRestantes--;
      const motivo = ficha
        ? validarFicha(ficha).ok
          ? "O relatorio ainda nao tem nenhuma secao."
          : `A ficha esta invalida: ${(validarFicha(ficha) as { ok: false; erros: string[] }).erros.join("; ")}.`
        : "Voce ainda nao criou o relatorio.";
      messages.push({ role: "assistant", content: msg });
      messages.push({
        role: "user",
        content: `${motivo} Use as tools para criar/ajustar e adicionar ao menos uma secao compativel, depois conclua.`,
      });
      continue;
    }

    return { ficha, mensagem: msg, toolsCalled, reasoningMs: tempo(), journeyState };
  }

  return {
    ficha,
    mensagem:
      "Nao consegui concluir o relatorio dentro do limite de passos. Tente reformular o pedido de forma mais simples.",
    erro: true,
    toolsCalled,
    reasoningMs: tempo(),
    journeyState,
  };
}
