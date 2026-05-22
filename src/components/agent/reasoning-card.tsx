"use client";

/**
 * ReasoningCard — card de Modo Raciocínio da seção Recursos do Agente Nex.
 *
 * Segue o padrão visual dos cards de `resources-toggles.tsx`: ícone + título +
 * subtítulo à esquerda, `FeatureCheckpoint` (3 status) à direita.
 *
 * - Quando o modelo de produção ativo não suporta raciocínio, o checkpoint
 *   fica travado em `OFF` (disabled) com uma nota explicativa.
 * - Quando suporta e o status `!= OFF`, a área do card expande com o seletor
 *   de nível de esforço e a exibição do custo de saída do modelo.
 *
 * O nível enviado à requisição é o "nível efetivo" (o salvo, se válido para o
 * modelo; senão o maior nível disponível) — resolvido em `effectiveLevel`.
 */

import { Brain, Loader2 } from "lucide-react";
import {
  FeatureCheckpoint,
  checkpointIconClass,
  type CheckpointState,
} from "@/components/ui/feature-checkpoint";
import { CustomSelect } from "@/components/ui/custom-select";
import { TierBadge } from "@/components/ui/tier-badge";
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

export interface ReasoningCardProps {
  /** Status do recurso (OFF / PLAYGROUND / PRODUCTION). */
  checkpoint: CheckpointState;
  /** Nível de esforço salvo (`null` = default do modelo). */
  effort: string | null;
  /** Id do modelo de produção ativo — determina o suporte a raciocínio. */
  activeModelId: string;
  onCheckpointChange: (cp: CheckpointState) => void;
  onEffortChange: (level: ReasoningLevel) => void;
  loading: boolean;
}

/**
 * Resolve o nível efetivo: o salvo, se válido para o modelo; senão o maior
 * disponível; `null` quando o modelo não tem níveis.
 */
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

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Brain
              className={`h-4 w-4 ${checkpointIconClass(cp)}`}
              aria-hidden
            />
            Modo raciocínio
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Deixa o modelo pensar antes de responder. A própria IA decide
            quando usar, conforme a complexidade da pergunta; o nível é o teto.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {loading && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
          <FeatureCheckpoint
            value={cp}
            onChange={onCheckpointChange}
            disabled={loading || !supports}
            aria-label="Estado do modo raciocínio"
          />
        </span>
      </div>

      {!supports ? (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            O modelo de produção atual não suporta raciocínio. Escolha um
            modelo compatível na conexão acima para liberar este recurso.
          </p>
        </div>
      ) : checkpoint !== "OFF" ? (
        <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Nível de esforço
            </span>
            <CustomSelect
              aria-label="Nível de raciocínio"
              value={effectiveLevel ?? ""}
              onChange={(v) => onEffortChange(v as ReasoningLevel)}
              options={levels.map((l) => ({
                value: l,
                label: LEVEL_LABELS[l],
              }))}
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Custo de saída do modelo
            </span>
            <div className="flex h-9 items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {outputPrice != null
                  ? `${usdPerMTok.format(outputPrice)} / 1M tokens`
                  : "preço sob consulta"}
              </span>
              {model ? <TierBadge tier={model.tier} /> : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              O raciocínio consome tokens de saída; níveis maiores geram mais
              desses tokens.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
