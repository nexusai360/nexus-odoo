"use client";

// src/components/agent/builder-recursos-card.tsx
// G1 (Onda 2) , Recursos do construtor (F6) na tela de configuracao do agente:
// Raciocinio (+ nivel de esforco), Entrada de audio e Entrada de anexo. Mesmo
// padrao dos recursos do Nex (ResourceCard + checkpoint), porem com 2 estados
// (Desativado/Producao). Auto-save por mudanca + toast; sem botao salvar.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mic, Paperclip } from "lucide-react";
// (sem spinner de loading: a mudanca e otimista, igual aos recursos do Nex)
import { toast } from "sonner";
import { ResourceCard } from "@/components/agent/resource-card";
import { ReasoningCard } from "@/components/agent/reasoning-card";
import { checkpointIconClass, type CheckpointState } from "@/components/ui/feature-checkpoint";
import { salvarRecursoConstrutor } from "@/lib/actions/builder-config";
import type {
  RecursosConstrutor,
  PatchRecursosConstrutor,
} from "@/lib/reports/builder/agent/recursos-config";

const DOIS_ESTADOS: CheckpointState[] = ["OFF", "PRODUCTION"];

export function BuilderRecursosCard({
  initial,
  modelId,
}: {
  initial: RecursosConstrutor;
  /** Modelo do construtor (para o ReasoningCard calcular niveis + custo). */
  modelId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [reasoning, setReasoning] = useState<CheckpointState>(initial.reasoningCheckpoint);
  const [audio, setAudio] = useState<CheckpointState>(initial.audioCheckpoint);
  const [anexo, setAnexo] = useState<CheckpointState>(initial.anexoCheckpoint);

  function persist(patch: PatchRecursosConstrutor) {
    startTransition(async () => {
      const r = await salvarRecursoConstrutor(patch);
      if (!r.ok) {
        toast.error(r.error ?? "Erro ao salvar o recurso do construtor.");
        router.refresh();
        return;
      }
      toast.success("Recurso do construtor atualizado.");
      router.refresh();
    });
  }

  function asConstrutor(cp: CheckpointState): "OFF" | "PRODUCTION" {
    return cp === "PRODUCTION" ? "PRODUCTION" : "OFF";
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Raciocinio , reusa o MESMO card do Nex (esforco + custo/consumo) */}
      <ReasoningCard
        id="construtor-raciocinio"
        checkpoint={reasoning}
        effort={initial.reasoningEffort}
        activeModelId={modelId}
        onCheckpointChange={(next) => {
          setReasoning(next);
          persist({ reasoningCheckpoint: asConstrutor(next) });
        }}
        onEffortChange={(lvl) => persist({ reasoningEffort: lvl })}
        loading={false}
        checkpointAllowed={DOIS_ESTADOS}
      />

      {/* Audio */}
      <ResourceCard
        id="construtor-audio"
        collapsible
        defaultCollapsed
        icon={<Mic className={`h-4 w-4 ${checkpointIconClass(audio)}`} aria-hidden />}
        title="Entrada de áudio"
        subtitle="Transcrição de mensagens de voz enviadas pelo usuário."
        checkpoint={audio}
        onCheckpointChange={(next) => {
          setAudio(next);
          persist({ audioCheckpoint: asConstrutor(next) });
        }}
        loading={false}
        ariaLabel="Estado da entrada de áudio do construtor"
        checkpointAllowed={DOIS_ESTADOS}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          A transcrição usa o modelo fixo <strong>gpt-4o-mini-transcribe</strong> (OpenAI),
          com fallback automático para <strong>whisper-1</strong>, pela credencial OpenAI
          ativa da conversa (a mesma do modelo de conversa). Não há provedor ou modelo
          separado a configurar.
        </p>
      </ResourceCard>

      {/* Anexo */}
      <ResourceCard
        id="construtor-anexo"
        collapsible
        defaultCollapsed
        icon={<Paperclip className={`h-4 w-4 ${checkpointIconClass(anexo)}`} aria-hidden />}
        title="Entrada de anexo"
        subtitle="Imagens e arquivos enviados pelo usuário."
        checkpoint={anexo}
        onCheckpointChange={(next) => {
          setAnexo(next);
          persist({ anexoCheckpoint: asConstrutor(next) });
        }}
        loading={false}
        ariaLabel="Estado da entrada de anexo do construtor"
        checkpointAllowed={DOIS_ESTADOS}
      >
        <p className="text-xs leading-relaxed text-muted-foreground">
          As imagens enviadas são interpretadas pelo próprio <strong>modelo da conversa</strong>{" "}
          (com visão). Não há provedor ou modelo separado a configurar.
        </p>
      </ResourceCard>
    </div>
  );
}
