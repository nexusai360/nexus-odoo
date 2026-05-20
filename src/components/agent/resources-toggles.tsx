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

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Image as ImageIcon, KeyRound, Loader2, MessageSquare, Mic } from "lucide-react";
import { toast } from "sonner";
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
import { updateAgentResources } from "@/lib/actions/agent-config";
import type { LlmProvider } from "@/lib/agent/llm/types";

export interface CredentialOption {
  id: string;
  label: string;
}

interface ResourcesTogglesProps {
  initial: {
    personality: string;
    tone: string;
    guardrails: string[];
    advancedOverride: string | null;
    terminology: Record<string, string>;
    /** @deprecated G7 — usa suggestionsCheckpoint. */
    suggestionsEnabled: boolean;
    suggestionsCheckpoint: CheckpointState;
    audioCheckpoint: CheckpointState;
    imageCheckpoint: CheckpointState;
    kbCheckpoint: CheckpointState;
    audioProvider: string | null;
    audioModel: string | null;
    audioCredentialId: string | null;
    imageProvider: string | null;
    imageModel: string | null;
    imageCredentialId: string | null;
  };
  /** G6 — credenciais cadastradas, agrupadas por provedor. */
  credentialsByProvider?: Record<string, CredentialOption[]>;
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

export function ResourcesToggles({
  initial,
  credentialsByProvider = {},
}: ResourcesTogglesProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [audioCp, setAudioCp] = useState<CheckpointState>(initial.audioCheckpoint);
  const [imageCp, setImageCp] = useState<CheckpointState>(initial.imageCheckpoint);
  const [suggestionsCp, setSuggestionsCp] = useState<CheckpointState>(
    initial.suggestionsCheckpoint,
  );

  // G6: filtra provedores cadastrados para os que entendem áudio/imagem.
  const audioProviders = useMemo(
    () =>
      PROVIDERS_WITH_AUDIO.filter(
        (p) => (credentialsByProvider[p]?.length ?? 0) > 0,
      ),
    [credentialsByProvider],
  );
  const imageProviders = useMemo(
    () =>
      PROVIDERS_WITH_VISION.filter(
        (p) => (credentialsByProvider[p]?.length ?? 0) > 0,
      ),
    [credentialsByProvider],
  );

  const [audioProvider, setAudioProvider] = useState<LlmProvider | "">(
    (initial.audioProvider as LlmProvider | null) ??
      audioProviders[0] ??
      "",
  );
  const [audioModel, setAudioModel] = useState<string>(
    initial.audioModel ?? (audioProvider ? listAudioModels(audioProvider as LlmProvider)[0]?.id ?? DEFAULT_AUDIO_MODEL : ""),
  );
  const [audioCredentialId, setAudioCredentialId] = useState<string>(
    initial.audioCredentialId ??
      (audioProvider ? credentialsByProvider[audioProvider]?.[0]?.id ?? "" : ""),
  );

  const [imageProvider, setImageProvider] = useState<LlmProvider | "">(
    (initial.imageProvider as LlmProvider | null) ??
      imageProviders[0] ??
      "",
  );
  const [imageModel, setImageModel] = useState<string>(
    initial.imageModel ?? (imageProvider ? listVisionModels(imageProvider as LlmProvider)[0]?.id ?? "" : ""),
  );
  const [imageCredentialId, setImageCredentialId] = useState<string>(
    initial.imageCredentialId ??
      (imageProvider ? credentialsByProvider[imageProvider]?.[0]?.id ?? "" : ""),
  );

  const [pending, setPending] = useState<"audio" | "image" | "suggestions" | null>(
    null,
  );

  function persistResources(
    next: Partial<{
      audioCheckpoint: CheckpointState;
      imageCheckpoint: CheckpointState;
      suggestionsCheckpoint: CheckpointState;
      audioProvider: string;
      audioModel: string;
      audioCredentialId: string | null;
      imageProvider: string;
      imageModel: string;
      imageCredentialId: string | null;
    }>,
    label: "audio" | "image" | "suggestions",
  ) {
    setPending(label);
    startTransition(async () => {
      const result = await updateAgentResources({
        audioCheckpoint: next.audioCheckpoint ?? audioCp,
        imageCheckpoint: next.imageCheckpoint ?? imageCp,
        kbCheckpoint: initial.kbCheckpoint,
        suggestionsCheckpoint: next.suggestionsCheckpoint ?? suggestionsCp,
        audioProvider: next.audioProvider ?? audioProvider ?? null,
        audioModel: next.audioModel ?? audioModel ?? null,
        audioCredentialId:
          next.audioCredentialId !== undefined
            ? next.audioCredentialId
            : audioCredentialId || null,
        imageProvider: next.imageProvider ?? imageProvider ?? null,
        imageModel: next.imageModel ?? imageModel ?? null,
        imageCredentialId:
          next.imageCredentialId !== undefined
            ? next.imageCredentialId
            : imageCredentialId || null,
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

  const audioModels = audioProvider
    ? listAudioModels(audioProvider as LlmProvider)
    : [];
  const visionModels = imageProvider
    ? listVisionModels(imageProvider as LlmProvider)
    : [];
  const audioCreds = audioProvider
    ? credentialsByProvider[audioProvider] ?? []
    : [];
  const imageCreds = imageProvider
    ? credentialsByProvider[imageProvider] ?? []
    : [];

  return (
    <div className="space-y-5">
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
          audioProviders.length === 0 ? (
            <NoCredentialsCta provider="áudio" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <FieldBlock label="Provedor">
                <CustomSelect
                  aria-label="Provedor"
                  value={audioProvider}
                  onChange={(v) => {
                    const p = v as LlmProvider;
                    setAudioProvider(p);
                    const firstModel = listAudioModels(p)[0]?.id ?? "";
                    setAudioModel(firstModel);
                    const firstCred = credentialsByProvider[p]?.[0]?.id ?? "";
                    setAudioCredentialId(firstCred);
                    persistResources(
                      {
                        audioProvider: p,
                        audioModel: firstModel,
                        audioCredentialId: firstCred || null,
                      },
                      "audio",
                    );
                  }}
                  options={audioProviders.map((p) => ({
                    value: p,
                    label: PROVIDER_META[p].label,
                  }))}
                />
              </FieldBlock>
              <FieldBlock label="Modelo">
                <SearchableSelect
                  value={audioModel}
                  onChange={(v) => {
                    setAudioModel(v);
                    persistResources({ audioModel: v }, "audio");
                  }}
                  options={modelOptions(audioModels)}
                  placeholder="Selecionar modelo"
                  searchPlaceholder="Buscar modelo…"
                />
              </FieldBlock>
              <FieldBlock label="Chave de API">
                <CustomSelect
                  aria-label="Chave de API de áudio"
                  value={audioCredentialId}
                  onChange={(v) => {
                    setAudioCredentialId(v);
                    persistResources({ audioCredentialId: v || null }, "audio");
                  }}
                  options={audioCreds.map((c) => ({
                    value: c.id,
                    label: c.label,
                  }))}
                />
              </FieldBlock>
            </div>
          )
        )}
      </ResourceCard>

      {/* Entrada de imagem */}
      <ResourceCard
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
        {imageCp !== "OFF" && (
          imageProviders.length === 0 ? (
            <NoCredentialsCta provider="anexo" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <FieldBlock label="Provedor">
                <CustomSelect
                  aria-label="Provedor"
                  value={imageProvider}
                  onChange={(v) => {
                    const p = v as LlmProvider;
                    setImageProvider(p);
                    const firstModel = listVisionModels(p)[0]?.id ?? "";
                    setImageModel(firstModel);
                    const firstCred = credentialsByProvider[p]?.[0]?.id ?? "";
                    setImageCredentialId(firstCred);
                    persistResources(
                      {
                        imageProvider: p,
                        imageModel: firstModel,
                        imageCredentialId: firstCred || null,
                      },
                      "image",
                    );
                  }}
                  options={imageProviders.map((p) => ({
                    value: p,
                    label: PROVIDER_META[p].label,
                  }))}
                />
              </FieldBlock>
              <FieldBlock label="Modelo">
                <SearchableSelect
                  value={imageModel}
                  onChange={(v) => {
                    setImageModel(v);
                    persistResources({ imageModel: v }, "image");
                  }}
                  options={modelOptions(visionModels)}
                  placeholder="Selecionar modelo"
                  searchPlaceholder="Buscar modelo…"
                />
              </FieldBlock>
              <FieldBlock label="Chave de API">
                <CustomSelect
                  aria-label="Chave de API de imagem"
                  value={imageCredentialId}
                  onChange={(v) => {
                    setImageCredentialId(v);
                    persistResources({ imageCredentialId: v || null }, "image");
                  }}
                  options={imageCreds.map((c) => ({
                    value: c.id,
                    label: c.label,
                  }))}
                />
              </FieldBlock>
            </div>
          )
        )}
      </ResourceCard>

      {/* Sugestões clicáveis (G7) — checkpoint de 3 estados */}
      <ResourceCard
        icon={
          <MessageSquare
            className={`h-4 w-4 ${checkpointIconClass(suggestionsCp)}`}
            aria-hidden
          />
        }
        title="Sugestões clicáveis"
        subtitle="O Agente Nex oferece perguntas de continuidade no fim das respostas. Não enviadas no WhatsApp."
        checkpoint={suggestionsCp}
        onCheckpointChange={(cp) => {
          setSuggestionsCp(cp);
          persistResources({ suggestionsCheckpoint: cp }, "suggestions");
        }}
        loading={pending === "suggestions"}
        ariaLabel="Estado das sugestões clicáveis"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function NoCredentialsCta({ provider }: { provider: "áudio" | "anexo" }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Nenhuma chave de API cadastrada para provedores de {provider}.
      </span>
      <Link
        href="/agente/chaves"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-500/20 dark:text-violet-300"
      >
        <KeyRound className="h-3.5 w-3.5" aria-hidden />
        Nova chave
      </Link>
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
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3.5">
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
