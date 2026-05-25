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
  reasoningCapsOf,
  reasoningLevelsOf,
  type ReasoningLevel,
} from "@/lib/agent/llm/catalog";

const LEVEL_LABELS: Record<ReasoningLevel, string> = {
  auto: "Auto",
  minimal: "Mínimo",
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
};

const LEVEL_CONSUMPTION: Record<ReasoningLevel, string> = {
  auto: "Modelo decide",
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
  auto: "medium",
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
  // Onda 7: 5 estados derivados do REASONING_CAPS canonico.
  const cap = reasoningCapsOf(activeModelId);
  // modelSupportsReasoning ainda usado por defaultCollapsed abaixo
  const supports = modelSupportsReasoning(activeModelId);
  const levels = reasoningLevelsOf(activeModelId);
  const effectiveLevel = resolveEffectiveLevel(effort, levels);

  // Estado computado:
  //   "no_reasoning"          => modelo sem cap ou cap.enabled=false (card disabled, banner cinza)
  //   "blocked_by_tools"      => cap.supportsWithTools=false (Haiku 4.5; banner amber, dropdown disabled)
  //   "auto_only"             => cap.levels === ["auto"] (Gemini 3.1 Pro; dropdown disabled mostrando "Auto")
  //   "adaptive_with_ceiling" => cap.adaptiveMode + levels multi (Claude 4.6+; dropdown habilitado, microcopy)
  //   "custom"                => default (4 niveis, dropdown habilitado)
  const state: "no_reasoning" | "blocked_by_tools" | "auto_only" | "adaptive_with_ceiling" | "custom" = !cap || !cap.enabled
    ? "no_reasoning"
    : !cap.supportsWithTools
      ? "blocked_by_tools"
      : cap.levels.length === 1 && cap.levels[0] === "auto"
        ? "auto_only"
        : cap.adaptiveMode
          ? "adaptive_with_ceiling"
          : "custom";

  const cp: CheckpointState =
    state === "no_reasoning" || state === "blocked_by_tools" ? "OFF" : checkpoint;

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
      {state === "no_reasoning" ? (
        <p className="text-xs text-muted-foreground">
          O modelo selecionado não tem suporte a raciocínio. Para usar
          raciocínio, escolha um modelo compatível na seção de conexão.
        </p>
      ) : state === "blocked_by_tools" ? (
        <p className="text-xs rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
          Este modelo suporta raciocínio, mas não junto com ferramentas. Como o
          agente usa ferramentas em toda consulta, o modo raciocínio foi
          desligado automaticamente. Para usar raciocínio, escolha outro modelo
          (Claude Sonnet 4.6+, Gemini 2.5 Pro, gpt-5.4-nano, entre outros).
        </p>
      ) : checkpoint !== "OFF" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Nível de esforço
            </span>
            {state === "auto_only" ? (
              <div
                aria-disabled="true"
                className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground cursor-not-allowed"
              >
                Modelo define automaticamente
                {cap?.autoModeHint ? (
                  <span className="ml-2 text-xs">({cap.autoModeHint})</span>
                ) : null}
              </div>
            ) : (
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
            )}
            {state === "adaptive_with_ceiling" ? (
              <p className="text-[11px] text-muted-foreground">
                O modelo decide automaticamente até este nível.
              </p>
            ) : null}
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
