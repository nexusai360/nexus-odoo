"use client";

/**
 * ResourcesToggles — toggles de áudio e sugestões do agente.
 *
 * Portado de nexus-insights/src/components/agente-nex/resources-toggles.tsx.
 * Adaptações:
 * - Renomeação nex→agent; usa updateAgentSettings de agent-config.ts.
 * - KB toggle NÃO entra aqui (onda 7) — apenas áudio e sugestões.
 * - Optimistic update: state local primeiro, action assíncrona, reverte se falhar.
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Mic } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { updateAgentSettings } from "@/lib/actions/agent-config";
import type { LlmProvider } from "@/lib/agent/llm/types";

interface ResourcesTogglesProps {
  initial: {
    personality: string;
    tone: string;
    guardrails: string[];
    advancedOverride: string | null;
    terminology: Record<string, string>;
    audioInputEnabled: boolean;
    kbEnabled: boolean;
    suggestionsEnabled: boolean;
  };
  /** Provider ativo (ex.: "openai") para indicar se áudio é suportado. */
  activeProvider: LlmProvider | null;
}

type Field = "audio" | "suggestions";

export function ResourcesToggles({ initial, activeProvider }: ResourcesTogglesProps) {
  const router = useRouter();

  const [audio, setAudio] = useState(initial.audioInputEnabled);
  const [suggestions, setSuggestions] = useState(initial.suggestionsEnabled);
  const [pendingField, setPendingField] = useState<Field | null>(null);
  const [, startTransition] = useTransition();

  const audioSupported = activeProvider === "openai";

  function persist(
    next: { audio: boolean; suggestions: boolean },
    field: Field,
  ) {
    setPendingField(field);
    startTransition(async () => {
      const result = await updateAgentSettings({
        personality: initial.personality,
        tone: initial.tone,
        guardrails: initial.guardrails,
        advancedOverride: initial.advancedOverride ?? undefined,
        terminology: initial.terminology,
        audioInputEnabled: next.audio,
        kbEnabled: initial.kbEnabled,
        suggestionsEnabled: next.suggestions,
      });
      setPendingField(null);
      if (!result.success) {
        if (field === "audio") setAudio((prev) => !prev);
        else setSuggestions((prev) => !prev);
        toast.error(result.error ?? "Erro ao salvar recurso.");
        return;
      }
      toast.success(
        field === "audio"
          ? next.audio
            ? "Entrada de áudio ativada."
            : "Entrada de áudio desativada."
          : next.suggestions
            ? "Sugestões ativadas."
            : "Sugestões desativadas.",
      );
      router.refresh();
    });
  }

  function handleAudioChange(v: boolean) {
    setAudio(v);
    persist({ audio: v, suggestions }, "audio");
  }

  function handleSuggestionsChange(v: boolean) {
    setSuggestions(v);
    persist({ audio, suggestions: v }, "suggestions");
  }

  return (
    <div className="space-y-3">
      {/* Entrada de áudio */}
      <ToggleRow
        icon={<Mic className="h-4 w-4 text-violet-500" aria-hidden="true" />}
        label={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Entrada de áudio do usuário</span>
            {!audioSupported && (
              <span className="text-[11px] font-normal text-amber-700 dark:text-amber-300">
                (inativo — provider atual não suporta)
              </span>
            )}
          </span>
        }
        subtitle="Mostra o microfone no chat para transcrição via Whisper."
        checked={audio}
        onCheckedChange={handleAudioChange}
        loading={pendingField === "audio"}
        controlsId="agent-toggle-audio"
      />

      {/* Sugestões */}
      <ToggleRow
        icon={<MessageSquare className="h-4 w-4 text-violet-500" aria-hidden="true" />}
        label="Sugestões clicáveis"
        subtitle="O agente oferece perguntas de continuidade no fim das respostas."
        checked={suggestions}
        onCheckedChange={handleSuggestionsChange}
        loading={pendingField === "suggestions"}
        controlsId="agent-toggle-suggestions"
      />
    </div>
  );
}

interface ToggleRowProps {
  icon: React.ReactNode;
  label: React.ReactNode;
  subtitle: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  loading: boolean;
  controlsId: string;
}

function ToggleRow({
  icon,
  label,
  subtitle,
  checked,
  onCheckedChange,
  loading,
  controlsId,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div
          id={`${controlsId}-label`}
          className="flex items-center gap-2 text-sm font-medium text-foreground"
        >
          {icon}
          <span className="min-w-0">{label}</span>
        </div>
        <p id={`${controlsId}-help`} className="mt-0.5 text-xs text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
        {loading && (
          <Loader2
            className="absolute -left-6 h-3.5 w-3.5 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={loading}
          aria-labelledby={`${controlsId}-label`}
          aria-describedby={`${controlsId}-help`}
        />
      </span>
    </div>
  );
}
