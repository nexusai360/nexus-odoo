"use client";

/**
 * EvalStatusBadge , tag de status de avaliacao reutilizavel entre o Backtest
 * (evaluations-table) e a aba Bubble. Mostra o status efetivo (ajuste humano
 * sobrescreve o veredito automatico) e, quando houve ajuste humano, exibe um
 * ShieldCheck com o original preservado no title/aria-label (auditavel).
 */

import { Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { EvalStatus } from "@/lib/agent/quality/queries";
import { cn } from "@/lib/utils";

export const EVAL_STATUS_LABEL: Record<EvalStatus, string> = {
  CORRETO: "Correto",
  PARCIAL: "Parcial",
  ERRADO: "Errado",
  FORA_DO_ESCOPO: "Fora de escopo",
  PENDENTE: "Pendente",
  REAVALIAR: "Reavaliação",
  FALHA_TECNICA: "Falha técnica",
};

export const EVAL_STATUS_TONE: Record<EvalStatus, string> = {
  CORRETO:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  PARCIAL:
    "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  ERRADO: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300",
  FORA_DO_ESCOPO:
    "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300",
  PENDENTE: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  REAVALIAR:
    "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300",
  FALHA_TECNICA:
    "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300",
};

interface EvalStatusBadgeProps {
  status: EvalStatus;
  humanStatus?: EvalStatus | null;
}

export function EvalStatusBadge({ status, humanStatus }: EvalStatusBadgeProps) {
  // Status efetivo = ajuste humano sobrescreve o veredito automatico. A tag
  // mostra o efetivo; o shield + tooltip preservam o original (auditavel).
  const human = humanStatus ?? null;
  const eff = human ?? status;
  return (
    <div
      className="flex items-center gap-1"
      title={
        human
          ? `Veredito automático: ${EVAL_STATUS_LABEL[status]} → ajuste humano: ${EVAL_STATUS_LABEL[eff]}`
          : undefined
      }
    >
      <Badge
        variant="outline"
        className={cn("border text-[11px]", EVAL_STATUS_TONE[eff])}
      >
        {EVAL_STATUS_LABEL[eff]}
      </Badge>
      {human && (
        <Pencil
          className="h-3 w-3 text-violet-400"
          aria-label={`Ajustado manualmente (era ${EVAL_STATUS_LABEL[status]})`}
        />
      )}
    </div>
  );
}
