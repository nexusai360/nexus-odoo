"use client";

/**
 * ReasoningCard, card de Modo Raciocinio da secao Recursos do Agente Nex.
 *
 * Consome o `ResourceCard` shared (ganha chevron de expandir/recolher).
 *
 * - Quando o modelo de producao ativo nao suporta raciocinio, o checkpoint
 *   fica travado em OFF (disabled) com uma nota explicativa.
 * - Quando suporta e o status != OFF, expande com seletor de nivel + tarifa
 *   fixa + indicador qualitativo de consumo por nivel.
 */

import { Brain } from "lucide-react";
import {
  checkpointIconClass,
  type CheckpointState,
} from "@/components/ui/feature-checkpoint";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TierBadge } from "@/components/ui/tier-badge";
import { ResourceCard } from "@/components/agent/resource-card";
import {
  getModel,
  modelSupportsReasoning,
  reasoningLevelsOf,
  type ReasoningLevel,
} from "@/lib/agent/llm/catalog";

const LEVEL_LABELS: Record<ReasoningLevel, string> = {
  minimal: "Mínimo",
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
};

const LEVEL_CONSUMPTION: Record<ReasoningLevel, string> = {
  minimal: "Consumo leve",
  low: "Consumo moderado",
  medium: "Consumo alto",
  high: "Consumo intenso",
};

/**
 * Multiplicador qualitativo de tokens de raciocinio por nivel.
 * Provedores nao publicam custo direto por nivel: a tarifa por token de
 * saida e a mesma; o que muda e a QUANTIDADE de tokens de raciocinio
 * gerados antes da resposta. Estes valores sao estimativas internas
 * (nao oficiais) usadas apenas para indicar grau qualitativo.
 */
const LEVEL_TIER: Record<ReasoningLevel, "low" | "medium" | "high" | "premium"> = {
  minimal: "low",
  low: "medium",
  medium: "high",
  high: "premium",
};

export interface ReasoningCardProps {
  checkpoint: CheckpointState;
  effort: string | null;
  activeModelId: string;
  onCheckpointChange: (cp: CheckpointState) => void;
  onEffortChange: (level: ReasoningLevel) => void;
  loading: boolean;
}

export function resolveEffectiveLevel(
  effort: string | null,
  levels: ReasoningLevel[],
): ReasoningLevel | null {
  if (levels.length === 0) return null;
  if (effort && (levels as string[]).includes(effort)) {
    return effort as ReasoningLevel;
  }
  return levels[levels.length - 1];
}

const usdPerMTok = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function ReasoningCard({
  checkpoint,
  effort,
  activeModelId,
  onCheckpointChange,
  onEffortChange,
  loading,
}: ReasoningCardProps) {
  const supports = modelSupportsReasoning(activeModelId);
  const levels = reasoningLevelsOf(activeModelId);
  const effectiveLevel = resolveEffectiveLevel(effort, levels);
  const cp: CheckpointState = supports ? checkpoint : "OFF";

  const model = getModel(activeModelId);
  const outputPrice = model?.pricing?.outputPerMTok ?? null;
  const consumptionLabel = effectiveLevel
    ? LEVEL_CONSUMPTION[effectiveLevel]
    : null;

  return (
    <ResourceCard
      id="raciocinio"
      collapsible
      defaultCollapsed={!supports || checkpoint === "OFF"}
      icon={
        <Brain className={`h-4 w-4 ${checkpointIconClass(cp)}`} aria-hidden />
      }
      title="Modo raciocínio"
      subtitle="Deixa o modelo pensar antes de responder. A própria IA decide quando usar, conforme a complexidade da pergunta; o nível é o teto."
      checkpoint={cp}
      onCheckpointChange={onCheckpointChange}
      loading={loading}
      ariaLabel="Estado do modo raciocínio"
    >
      {!supports ? (
        <p className="text-xs text-muted-foreground">
          O modelo selecionado não tem suporte a raciocínio. Para usar
          raciocínio, escolha um modelo compatível na seção de conexão.
        </p>
      ) : checkpoint !== "OFF" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Nível de esforço
            </span>
            <SearchableSelect
              value={effectiveLevel ?? ""}
              onChange={(v) => onEffortChange(v as ReasoningLevel)}
              searchPlaceholder="Buscar nível..."
              options={levels.map((l) => ({
                value: l,
                label: LEVEL_LABELS[l],
                notes: LEVEL_CONSUMPTION[l],
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Custo e consumo
            </span>
            <div className="flex h-9 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {outputPrice != null
                  ? `${usdPerMTok.format(outputPrice)} / 1M tokens`
                  : "preço sob consulta"}
              </span>
              {model ? <TierBadge tier={model.tier} /> : null}
            </div>
            {consumptionLabel ? (
              <p className="text-[11px] font-medium text-foreground/80">
                {consumptionLabel} neste nível
              </p>
            ) : null}
            <p
              className="text-[11px] text-muted-foreground"
              title="A tarifa por token de saída é a mesma. O nível controla quantos tokens de raciocínio o modelo gera antes de responder. Estimativa, não valor de fatura."
            >
              Tarifa fixa por token de saída. Níveis maiores geram mais tokens
              de raciocínio.
            </p>
          </div>
        </div>
      ) : null}
    </ResourceCard>
  );
}
