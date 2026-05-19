"use client";

/**
 * ResourcesToggles — recursos do Agente Nex: entrada de áudio, entrada de
 * imagem e sugestões clicáveis.
 *
 * - Áudio e imagem usam o controle de checkpoint de 3 estados (off / playground
 *   / produção). Quando o checkpoint != OFF, a seção expande com seletores
 *   próprios de Provedor + Modelo (modelo dedicado, independente do de
 *   produção). Lista apenas modelos que entendem áudio (resp. imagem).
 * - Sugestões continua um toggle on/off simples.
 *
 * Persiste via updateAgentResources / updateAgentSettings de agent-config.ts.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Loader2, MessageSquare, Mic } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  FeatureCheckpoint,
  checkpointIconClass,
  type CheckpointState,
} from "@/components/ui/feature-checkpoint";
import { CustomSelect } from "@/components/ui/custom-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TierBadge } from "@/components/ui/tier-badge";
import {
  PROVIDER_META,
  PROVIDERS_WITH_AUDIO,
  PROVIDERS_WITH_VISION,
  listAudioModels,
  listVisionModels,
  modelDescription,
  type ModelEntry,
} from "@/lib/agent/llm/catalog";
import {
  updateAgentResources,
  updateAgentSettings,
} from "@/lib/actions/agent-config";
import type { LlmProvider } from "@/lib/agent/llm/types";

interface ResourcesTogglesProps {
  initial: {
    personality: string;
    tone: string;
    guardrails: string[];
    advancedOverride: string | null;
    terminology: Record<string, string>;
    suggestionsEnabled: boolean;
    audioCheckpoint: CheckpointState;
    imageCheckpoint: CheckpointState;
    kbCheckpoint: CheckpointState;
    audioProvider: string | null;
    audioModel: string | null;
    imageProvider: string | null;
    imageModel: string | null;
  };
}

const DEFAULT_AUDIO_MODEL = "gpt-4o-mini-transcribe";

function modelOptions(models: ModelEntry[]) {
  return models.map((m) => ({
    value: m.id,
    label: m.label,
    notes: modelDescription(m),
    endAdornment: <TierBadge tier={m.tier} />,
  }));
}

export function ResourcesToggles({ initial }: ResourcesTogglesProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [audioCp, setAudioCp] = useState<CheckpointState>(initial.audioCheckpoint);
  const [imageCp, setImageCp] = useState<CheckpointState>(initial.imageCheckpoint);
  const [suggestions, setSuggestions] = useState(initial.suggestionsEnabled);

  const [audioProvider, setAudioProvider] = useState<LlmProvider>(
    (initial.audioProvider as LlmProvider | null) ??
      PROVIDERS_WITH_AUDIO[0] ??
      "openai",
  );
  const [audioModel, setAudioModel] = useState<string>(
    initial.audioModel ?? DEFAULT_AUDIO_MODEL,
  );
  const [imageProvider, setImageProvider] = useState<LlmProvider>(
    (initial.imageProvider as LlmProvider | null) ??
      PROVIDERS_WITH_VISION[0] ??
      "openai",
  );
  const [imageModel, setImageModel] = useState<string>(
    initial.imageModel ?? listVisionModels(imageProvider)[0]?.id ?? "",
  );

  const [pending, setPending] = useState<"audio" | "image" | "suggestions" | null>(
    null,
  );

  function persistResources(
    next: Partial<{
      audioCheckpoint: CheckpointState;
      imageCheckpoint: CheckpointState;
      audioProvider: string;
      audioModel: string;
      imageProvider: string;
      imageModel: string;
    }>,
    label: "audio" | "image",
  ) {
    setPending(label);
    startTransition(async () => {
      const result = await updateAgentResources({
        audioCheckpoint: next.audioCheckpoint ?? audioCp,
        imageCheckpoint: next.imageCheckpoint ?? imageCp,
        kbCheckpoint: initial.kbCheckpoint,
        audioProvider: next.audioProvider ?? audioProvider,
        audioModel: next.audioModel ?? audioModel,
        imageProvider: next.imageProvider ?? imageProvider,
        imageModel: next.imageModel ?? imageModel,
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

  function persistSuggestions(v: boolean) {
    setSuggestions(v);
    setPending("suggestions");
    startTransition(async () => {
      const result = await updateAgentSettings({
        personality: initial.personality,
        tone: initial.tone,
        guardrails: initial.guardrails,
        advancedOverride: initial.advancedOverride ?? undefined,
        terminology: initial.terminology,
        suggestionsEnabled: v,
      });
      setPending(null);
      if (!result.success) {
        setSuggestions((prev) => !prev);
        toast.error(result.error ?? "Erro ao salvar.");
        return;
      }
      router.refresh();
    });
  }

  const audioModels = listAudioModels(audioProvider);
  const visionModels = listVisionModels(imageProvider);

  return (
    <div className="space-y-3">
      {/* Entrada de áudio */}
      <ResourceCard
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
        {audioCp !== "OFF" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldBlock label="Provedor de áudio">
              <CustomSelect
                aria-label="Provedor de áudio"
                value={audioProvider}
                onChange={(v) => {
                  const p = v as LlmProvider;
                  setAudioProvider(p);
                  const firstModel = listAudioModels(p)[0]?.id ?? "";
                  setAudioModel(firstModel);
                  persistResources(
                    { audioProvider: p, audioModel: firstModel },
                    "audio",
                  );
                }}
                options={PROVIDERS_WITH_AUDIO.map((p) => ({
                  value: p,
                  label: PROVIDER_META[p].label,
                }))}
              />
            </FieldBlock>
            <FieldBlock label="Modelo de áudio">
              <SearchableSelect
                value={audioModel}
                onChange={(v) => {
                  setAudioModel(v);
                  persistResources({ audioModel: v }, "audio");
                }}
                options={modelOptions(audioModels)}
                placeholder="Selecionar modelo"
                searchPlaceholder="Buscar modelo de áudio…"
              />
            </FieldBlock>
          </div>
        )}
      </ResourceCard>

      {/* Entrada de imagem */}
      <ResourceCard
        icon={
          <ImageIcon className={`h-4 w-4 ${checkpointIconClass(imageCp)}`} aria-hidden />
        }
        title="Entrada de imagem"
        subtitle="Entendimento de imagens enviadas pelo usuário (visão multimodal)."
        checkpoint={imageCp}
        onCheckpointChange={(cp) => {
          setImageCp(cp);
          persistResources({ imageCheckpoint: cp }, "image");
        }}
        loading={pending === "image"}
        ariaLabel="Estado da entrada de imagem"
      >
        {imageCp !== "OFF" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldBlock label="Provedor de imagem">
              <CustomSelect
                aria-label="Provedor de imagem"
                value={imageProvider}
                onChange={(v) => {
                  const p = v as LlmProvider;
                  setImageProvider(p);
                  const firstModel = listVisionModels(p)[0]?.id ?? "";
                  setImageModel(firstModel);
                  persistResources(
                    { imageProvider: p, imageModel: firstModel },
                    "image",
                  );
                }}
                options={PROVIDERS_WITH_VISION.map((p) => ({
                  value: p,
                  label: PROVIDER_META[p].label,
                }))}
              />
            </FieldBlock>
            <FieldBlock label="Modelo de imagem">
              <SearchableSelect
                value={imageModel}
                onChange={(v) => {
                  setImageModel(v);
                  persistResources({ imageModel: v }, "image");
                }}
                options={modelOptions(visionModels)}
                placeholder="Selecionar modelo"
                searchPlaceholder="Buscar modelo de imagem…"
              />
            </FieldBlock>
          </div>
        )}
      </ResourceCard>

      {/* Sugestões */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div
            id="agent-toggle-suggestions-label"
            className="flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <MessageSquare className="h-4 w-4 text-violet-500" aria-hidden />
            Sugestões clicáveis
          </div>
          <p
            id="agent-toggle-suggestions-help"
            className="mt-0.5 text-xs text-muted-foreground"
          >
            O Agente Nex oferece perguntas de continuidade no fim das respostas.
          </p>
        </div>
        <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
          {pending === "suggestions" && (
            <Loader2
              className="absolute -left-6 h-3.5 w-3.5 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
          <Switch
            checked={suggestions}
            onCheckedChange={persistSuggestions}
            disabled={pending === "suggestions"}
            aria-labelledby="agent-toggle-suggestions-label"
            aria-describedby="agent-toggle-suggestions-help"
          />
        </span>
      </div>
    </div>
  );
}

interface ResourceCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  checkpoint: CheckpointState;
  onCheckpointChange: (cp: CheckpointState) => void;
  loading: boolean;
  ariaLabel: string;
  children?: React.ReactNode;
}

function ResourceCard({
  icon,
  title,
  subtitle,
  checkpoint,
  onCheckpointChange,
  loading,
  ariaLabel,
  children,
}: ResourceCardProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {icon}
            {title}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {loading && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
          <FeatureCheckpoint
            value={checkpoint}
            onChange={onCheckpointChange}
            disabled={loading}
            aria-label={ariaLabel}
          />
        </span>
      </div>
      {children && <div className="mt-3 border-t border-border/60 pt-3">{children}</div>}
    </div>
  );
}

function FieldBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
