"use client";

/**
 * ResourcesToggles , recursos do Agente Nex: entrada de áudio, entrada de
 * imagem e sugestões clicáveis.
 *
 * - Áudio e imagem usam o controle de checkpoint de 3 estados (off / playground
 *   / produção) , esse é o único controle que APLICA em runtime (libera/bloqueia
 *   a entrada). Não há provedor/modelo dedicado: a transcrição usa modelo fixo
 *   (gpt-4o-mini-transcribe, fallback whisper-1) pela credencial OpenAI ativa da
 *   conversa; as imagens vão para o próprio modelo da conversa (com visão). Os
 *   antigos seletores de provedor/modelo/chave de áudio e imagem eram
 *   decorativos (não eram lidos em runtime) e foram removidos.
 * - Sugestões continua um toggle on/off simples.
 *
 * Persiste via updateAgentResources / updateAgentSettings de agent-config.ts.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Image as ImageIcon, MessageSquare, Mic } from "lucide-react";
import { ReasoningCard } from "@/components/agent/reasoning-card";
import { ResourceCard } from "@/components/agent/resource-card";
import { ContextWindowCard } from "@/components/agent/context-window-card";
import { RouterConfigCard } from "@/components/agent/router-config-card";
import type { ModelEntry as ModelEntryType } from "@/lib/agent/llm/catalog";
import { toast } from "sonner";
import {
  checkpointIconClass,
  type CheckpointState,
} from "@/components/ui/feature-checkpoint";
import { updateAgentResources } from "@/lib/actions/agent-config";
import { cn } from "@/lib/utils";
import type { LlmProvider, ReasoningEffort } from "@/lib/agent/llm/types";

export interface CredentialOption {
  id: string;
  label: string;
  /** R2-ctx: sufixo mascarado da chave (ex.: "••••DFYA") para o ApiKeySelect. */
  maskedSuffix?: string | null;
}

interface ResourcesTogglesProps {
  initial: {
    personality: string;
    tone: string;
    guardrails: string[];
    advancedOverride: string | null;
    terminology: Record<string, string>;
    /** @deprecated G7 , usa suggestionsCheckpoint. */
    suggestionsEnabled: boolean;
    suggestionsCheckpoint: CheckpointState;
    audioCheckpoint: CheckpointState;
    imageCheckpoint: CheckpointState;
    feedbackCheckpoint: CheckpointState;
    kbCheckpoint: CheckpointState;
    audioProvider: string | null;
    audioModel: string | null;
    audioCredentialId: string | null;
    imageProvider: string | null;
    imageModel: string | null;
    imageCredentialId: string | null;
    reasoningEffort: string | null;
    reasoningCheckpoint: CheckpointState;
    maxSuggestions: number;
    /** R2-ctx: janela de contexto. */
    contextWindowCheckpoint: CheckpointState;
    contextWindowSize: number;
    contextWindowIncludeSystem: boolean;
  };
  /** G6 , credenciais cadastradas, agrupadas por provedor. */
  credentialsByProvider?: Record<string, CredentialOption[]>;
  /** Id do modelo de produção ativo , determina o suporte a raciocínio. */
  activeModelId: string;
  /** R2-ctx: config do bloco "Configuração de Router". */
  routerConfig: {
    routerReformCheckpoint: CheckpointState;
    routerReformProvider: string | null;
    routerReformModel: string | null;
    routerReformCredentialId: string | null;
    routerReformNPairs: number;
    routerEmbeddingModel: string | null;
  };
  /** Provedores de chat com credencial (para a Construção da pergunta). */
  reformProviders?: LlmProvider[];
  /** Modelos de chat por provedor (catálogo efetivo). */
  chatModelsByProvider?: Record<string, ModelEntryType[]>;
  /** Embeddings (fonte única do RAG): chave ativa + opções. */
  embeddingActiveId?: string | null;
  embeddingOptions?: Array<{ id: string; label: string; maskedSuffix?: string | null }>;
}

export function ResourcesToggles({
  initial,
  credentialsByProvider = {},
  activeModelId,
  routerConfig,
  reformProviders = [],
  chatModelsByProvider = {},
  embeddingActiveId = null,
  embeddingOptions = [],
}: ResourcesTogglesProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Modelo exibido no ReasoningCard , espelha em tempo real o que está
  // selecionado no LlmConfigForm (via CustomEvent), independente de teste ou
  // save. O efeito real só persiste em Save; um refresh recoloca o salvo.
  const [displayedModelId, setDisplayedModelId] = useState(activeModelId);
  useEffect(() => {
    setDisplayedModelId(activeModelId);
  }, [activeModelId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onModelChange(ev: Event) {
      const detail = (ev as CustomEvent<{ model?: string }>).detail;
      const next = (detail?.model ?? "").trim();
      if (next) setDisplayedModelId(next);
      else setDisplayedModelId(activeModelId);
    }
    window.addEventListener("agent-config:model-change", onModelChange);
    return () =>
      window.removeEventListener("agent-config:model-change", onModelChange);
  }, [activeModelId]);

  const [audioCp, setAudioCp] = useState<CheckpointState>(initial.audioCheckpoint);
  const [imageCp, setImageCp] = useState<CheckpointState>(initial.imageCheckpoint);
  const [feedbackCp, setFeedbackCp] = useState<CheckpointState>(initial.feedbackCheckpoint);
  const [suggestionsCp, setSuggestionsCp] = useState<CheckpointState>(
    initial.suggestionsCheckpoint,
  );

  // Áudio e imagem não têm mais provedor/modelo/chave dedicados (eram
  // decorativos , não lidos em runtime). Os valores persistidos antigos são
  // repassados intactos no save (sem migração); só o checkpoint é editável aqui.

  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort | "">(
    (initial.reasoningEffort as ReasoningEffort | null) ?? "",
  );
  const [reasoningCp, setReasoningCp] = useState<CheckpointState>(
    initial.reasoningCheckpoint,
  );
  const [maxSuggestions, setMaxSuggestions] = useState<number>(
    initial.maxSuggestions ?? 3,
  );
  // R2-ctx: janela de contexto.
  const [ctxCp, setCtxCp] = useState<CheckpointState>(initial.contextWindowCheckpoint);
  const [ctxSize, setCtxSize] = useState<number>(initial.contextWindowSize ?? 20);
  const [ctxIncludeSystem, setCtxIncludeSystem] = useState<boolean>(
    initial.contextWindowIncludeSystem ?? true,
  );

  const [pending, setPending] = useState<
    "audio" | "image" | "feedback" | "suggestions" | "reasoning" | "context" | null
  >(null);

  function persistResources(
    next: Partial<{
      audioCheckpoint: CheckpointState;
      imageCheckpoint: CheckpointState;
      feedbackCheckpoint: CheckpointState;
      suggestionsCheckpoint: CheckpointState;
      reasoningEffort: ReasoningEffort | null;
      reasoningCheckpoint: CheckpointState;
      maxSuggestions: number;
      contextWindowCheckpoint: CheckpointState;
      contextWindowSize: number;
      contextWindowIncludeSystem: boolean;
    }>,
    label: "audio" | "image" | "feedback" | "suggestions" | "reasoning" | "context",
  ) {
    setPending(label);
    startTransition(async () => {
      const result = await updateAgentResources({
        audioCheckpoint: next.audioCheckpoint ?? audioCp,
        imageCheckpoint: next.imageCheckpoint ?? imageCp,
        feedbackCheckpoint: next.feedbackCheckpoint ?? feedbackCp,
        kbCheckpoint: initial.kbCheckpoint,
        suggestionsCheckpoint: next.suggestionsCheckpoint ?? suggestionsCp,
        // Decorativos: repassa intacto o que veio do banco (sem migração).
        audioProvider: initial.audioProvider,
        audioModel: initial.audioModel,
        audioCredentialId: initial.audioCredentialId,
        imageProvider: initial.imageProvider,
        imageModel: initial.imageModel,
        imageCredentialId: initial.imageCredentialId,
        reasoningEffort:
          next.reasoningEffort !== undefined
            ? next.reasoningEffort
            : reasoningEffort || null,
        reasoningCheckpoint: next.reasoningCheckpoint ?? reasoningCp,
        maxSuggestions: next.maxSuggestions ?? maxSuggestions,
        contextWindowCheckpoint: next.contextWindowCheckpoint ?? ctxCp,
        contextWindowSize: next.contextWindowSize ?? ctxSize,
        contextWindowIncludeSystem:
          next.contextWindowIncludeSystem !== undefined
            ? next.contextWindowIncludeSystem
            : ctxIncludeSystem,
      });
      setPending(null);
      if (!result.success) {
        toast.error(result.error ?? "Erro ao salvar recurso.");
        router.refresh();
        return;
      }
      toast.success("Recursos atualizados.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Modo raciocínio , antes da entrada de áudio */}
      <ReasoningCard
        checkpoint={reasoningCp}
        effort={reasoningEffort || null}
        activeModelId={displayedModelId}
        onCheckpointChange={(cp) => {
          setReasoningCp(cp);
          persistResources({ reasoningCheckpoint: cp }, "reasoning");
        }}
        onEffortChange={(level) => {
          setReasoningEffort(level as ReasoningEffort);
          persistResources({ reasoningEffort: level as ReasoningEffort }, "reasoning");
        }}
        loading={pending === "reasoning"}
      />

      {/* Entrada de áudio */}
      <ResourceCard
        id="audio"
        collapsible
        defaultCollapsed={audioCp === "OFF"}
        icon={<Mic className={`h-4 w-4 ${checkpointIconClass(audioCp)}`} aria-hidden />}
        title="Entrada de áudio"
        subtitle="Transcrição de mensagens de voz enviadas pelo usuário."
        checkpoint={audioCp}
        onCheckpointChange={(cp) => {
          setAudioCp(cp);
          persistResources({ audioCheckpoint: cp }, "audio");
        }}
        loading={pending === "audio"}
        ariaLabel="Estado da entrada de áudio"
      >
        {audioCp !== "OFF" ? (
          <ConsolidatedNote>
            A transcrição usa o modelo fixo{" "}
            <b className="font-semibold text-foreground">gpt-4o-mini-transcribe</b>{" "}
            (OpenAI), com fallback automático para{" "}
            <b className="font-semibold text-foreground">whisper-1</b>, pela
            credencial OpenAI ativa da conversa (a mesma do modelo de conversa).
            Não há provedor ou modelo separado a configurar.
          </ConsolidatedNote>
        ) : null}
      </ResourceCard>

      {/* Entrada de imagem */}
      <ResourceCard
        id="anexo"
        collapsible
        defaultCollapsed={imageCp === "OFF"}
        icon={
          <ImageIcon className={`h-4 w-4 ${checkpointIconClass(imageCp)}`} aria-hidden />
        }
        title="Entrada de anexo"
        subtitle="Imagens e arquivos enviados pelo usuário (clip de anexo na bubble e WhatsApp). Controle master: PRODUÇÃO libera no chat e no WhatsApp; PLAYGROUND só nas sessões de teste; OFF desativa em todos."
        checkpoint={imageCp}
        onCheckpointChange={(cp) => {
          setImageCp(cp);
          persistResources({ imageCheckpoint: cp }, "image");
        }}
        loading={pending === "image"}
        ariaLabel="Estado da entrada de imagem"
      >
        {imageCp !== "OFF" ? (
          <ConsolidatedNote>
            As imagens enviadas são interpretadas pelo próprio{" "}
            <b className="font-semibold text-foreground">modelo da conversa</b>{" "}
            (com visão). Não há provedor ou modelo separado a configurar.
          </ConsolidatedNote>
        ) : null}
      </ResourceCard>

      {/* B1. Feedback do usuário , depois do anexo, antes das sugestões */}
      <ResourceCard
        id="feedback"
        icon={
          <Gauge className={`h-4 w-4 ${checkpointIconClass(feedbackCp)}`} aria-hidden />
        }
        title="Feedback do usuário"
        subtitle="Botão de avaliação (correto/parcial/errado/alucinou) na resposta da IA, com comentário opcional. PRODUÇÃO libera no chat in-app; OFF desativa."
        checkpoint={feedbackCp}
        onCheckpointChange={(cp) => {
          setFeedbackCp(cp);
          persistResources({ feedbackCheckpoint: cp }, "feedback");
        }}
        loading={pending === "feedback"}
        ariaLabel="Estado do feedback do usuário"
      />

      {/* Sugestões na Bubble: cobre as iniciais (welcome quando a conversa
          comeca) e as de continuidade no fim de cada resposta. WhatsApp nao
          recebe esse formato (la o usuario digita ou usa atalho numerico). */}
      <ResourceCard
        id="sugestoes-bubble"
        collapsible
        defaultCollapsed={suggestionsCp === "OFF"}
        icon={
          <MessageSquare
            className={`h-4 w-4 ${checkpointIconClass(suggestionsCp)}`}
            aria-hidden
          />
        }
        title="Sugestões na Bubble"
        subtitle="Perguntas clicáveis que o Agente Nex mostra na bubble: as iniciais quando a conversa começa e as de continuidade no fim de cada resposta. O limite definido aqui vale para os dois casos. Não vão para o WhatsApp."
        checkpoint={suggestionsCp}
        onCheckpointChange={(cp) => {
          setSuggestionsCp(cp);
          persistResources({ suggestionsCheckpoint: cp }, "suggestions");
        }}
        loading={pending === "suggestions"}
        ariaLabel="Estado das sugestões de pergunta"
      >
        {suggestionsCp !== "OFF" ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Máximo por resposta
            </span>
            <div
              role="group"
              aria-label="Máximo de sugestões por resposta"
              className="inline-flex w-fit rounded-lg border border-border bg-background p-0.5"
            >
              {[1, 2, 3, 4, 5].map((n) => {
                const isActive = maxSuggestions === n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={isActive}
                    aria-label={`Máximo de ${n} sugestão${n === 1 ? "" : "ões"}`}
                    disabled={pending === "suggestions"}
                    onClick={() => {
                      if (maxSuggestions === n) return;
                      setMaxSuggestions(n);
                      persistResources({ maxSuggestions: n }, "suggestions");
                    }}
                    className={cn(
                      "flex h-7 w-8 cursor-pointer items-center justify-center rounded-md text-xs font-medium transition-colors",
                      isActive
                        ? "bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/40 dark:text-violet-300"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    )}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </ResourceCard>

      {/* R2-ctx: Janela de contexto */}
      <ContextWindowCard
        checkpoint={ctxCp}
        size={ctxSize}
        includeSystem={ctxIncludeSystem}
        loading={pending === "context"}
        onCheckpointChange={(cp) => {
          setCtxCp(cp);
          persistResources({ contextWindowCheckpoint: cp }, "context");
        }}
        onSizeChange={(size) => {
          setCtxSize(size);
          persistResources({ contextWindowSize: size }, "context");
        }}
        onIncludeSystemChange={(inc) => {
          setCtxIncludeSystem(inc);
          persistResources({ contextWindowIncludeSystem: inc }, "context");
        }}
      />

      {/* R2-ctx: Configuração de Router */}
      <RouterConfigCard
        initial={routerConfig}
        reformProviders={reformProviders}
        credentialsByProvider={credentialsByProvider}
        chatModelsByProvider={chatModelsByProvider}
        embeddingActiveId={embeddingActiveId}
        embeddingOptions={embeddingOptions}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

// Nota informativa (substitui os antigos seletores decorativos de áudio/imagem):
// explica, em linguagem natural, o que de fato roda em runtime.
function ConsolidatedNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}
