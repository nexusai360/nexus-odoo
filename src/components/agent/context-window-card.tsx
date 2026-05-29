"use client";

/**
 * R2-ctx: bloco "Janela de contexto" da Configuração do Agente Nex.
 * Controla quantas mensagens (10..50) e quais papéis (Usuário+IA ou
 * +Sistema/tools) o agente puxa para responder, valendo em bubble, WhatsApp e
 * playground conforme o checkpoint. Presentational: o estado e a persistência
 * vivem no ResourcesToggles (reusa updateAgentResources).
 */

import { History } from "lucide-react";
import { ResourceCard } from "@/components/agent/resource-card";
import { RangeSlider } from "@/components/ui/range-slider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  checkpointIconClass,
  type CheckpointState,
} from "@/components/ui/feature-checkpoint";

interface ContextWindowCardProps {
  checkpoint: CheckpointState;
  size: number;
  includeSystem: boolean;
  loading?: boolean;
  onCheckpointChange: (cp: CheckpointState) => void;
  onSizeChange: (size: number) => void;
  onIncludeSystemChange: (includeSystem: boolean) => void;
}

export function ContextWindowCard({
  checkpoint,
  size,
  includeSystem,
  loading = false,
  onCheckpointChange,
  onSizeChange,
  onIncludeSystemChange,
}: ContextWindowCardProps) {
  return (
    <ResourceCard
      id="janela-contexto"
      collapsible
      defaultCollapsed={checkpoint === "OFF"}
      icon={<History className={`h-4 w-4 ${checkpointIconClass(checkpoint)}`} aria-hidden />}
      title="Janela de contexto"
      subtitle="Quantas mensagens recentes o agente considera para responder, e se inclui as mensagens de sistema (tools). Vale na bubble, no WhatsApp e no playground conforme o estado."
      checkpoint={checkpoint}
      onCheckpointChange={onCheckpointChange}
      loading={loading}
      ariaLabel="Estado da janela de contexto"
    >
      {checkpoint !== "OFF" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Quantidade de mensagens
            </span>
            <RangeSlider
              value={size}
              min={10}
              max={50}
              onChange={onSizeChange}
              disabled={loading}
              unitLabel="msgs"
              aria-label="Quantidade de mensagens da janela de contexto"
            />
            <span className="text-xs text-muted-foreground">
              Conta cada mensagem: do usuário, da IA e (se incluído) do sistema. Entre 10 e 50.
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Tipos de mensagem
            </span>
            <SegmentedControl<"user_ai" | "all">
              value={includeSystem ? "all" : "user_ai"}
              onChange={(v) => onIncludeSystemChange(v === "all")}
              disabled={loading}
              aria-label="Tipos de mensagem na janela de contexto"
              options={[
                { value: "user_ai", label: "Usuário + IA" },
                { value: "all", label: "Usuário + IA + Sistema" },
              ]}
            />
          </div>
        </div>
      ) : null}
    </ResourceCard>
  );
}
