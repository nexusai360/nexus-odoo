"use client";

/**
 * B2. Linha de mensagem na coluna 3 do monitoramento (read-only).
 * O AgentMessage absorve tudo dentro da bolha: sugestões (chevron igual ao
 * Raciocínio), a PERÍCIA (veredito do juiz) como chip rotulado no rodapé
 * (clicável pro Backtest) e a AVALIAÇÃO (voto do usuário) como badge de canto.
 * Por fora só sobra o selo de áudio nas mensagens do usuário.
 */

import * as React from "react";
import { Mic } from "lucide-react";
import { AgentMessage } from "@/components/agent/agent-message";
import type { ProgressStep } from "@/components/agent/progress-trail";
import { EVAL_STATUS_LABEL } from "@/components/agent/quality/eval-status-badge";
import type { EvalStatus } from "@/lib/agent/quality/queries";
import type { UserFeedbackRating } from "@/components/agent/rating-meta";
import type { FeedbackRating } from "@/components/agent/feedback-control";

// Status terminais que viram chip de perícia + deep-link pro Backtest.
const TERMINAL: EvalStatus[] = [
  "CORRETO",
  "PARCIAL",
  "ERRADO",
  "FORA_DO_ESCOPO",
  "FALHA_TECNICA",
];

// Cor sólida por status (alinhada ao EVAL_STATUS_TONE do EvalStatusBadge).
const PERICIA_COLOR: Record<string, string> = {
  CORRETO: "#10b981",
  PARCIAL: "#f59e0b",
  ERRADO: "#ef4444",
  FORA_DO_ESCOPO: "#64748b",
  FALHA_TECNICA: "#8b5cf6",
  PENDENTE: "#0ea5e9",
};

export type MonitorMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  kind?: string;
  steps?: { label: string }[];
  suggestions?: string[];
  clickedSuggestion?: string;
  evaluation?: { id: string; status: string } | null;
  feedback?: { rating: UserFeedbackRating; comment: string | null } | null;
};

export function BubbleMonitorRow({ msg }: { msg: MonitorMessage }) {
  const [stepsCollapsed, setStepsCollapsed] = React.useState(true);
  const isUser = msg.role === "user";
  const isAudio = msg.kind === "audio";

  const steps: ProgressStep[] = (msg.steps ?? []).map((s, i) => ({
    id: `${msg.id}_${i}`,
    label: s.label,
    state: "done" as const,
  }));

  // PERÍCIA: só para status terminal (PENDENTE não vira chip nem deep-link).
  const ev = msg.evaluation;
  const isTerminal = ev ? TERMINAL.includes(ev.status as EvalStatus) : false;
  const monitorPericia =
    !isUser && ev && isTerminal
      ? {
          label: EVAL_STATUS_LABEL[ev.status as EvalStatus],
          color: PERICIA_COLOR[ev.status] ?? "#64748b",
          href: `/agente/monitoramento?eval=${ev.id}`,
        }
      : null;

  return (
    <div className="w-full">
      <AgentMessage
        role={msg.role}
        content={msg.content}
        kind="text"
        createdAt={msg.createdAt}
        steps={steps.length > 0 ? steps : undefined}
        stepsCollapsed={stepsCollapsed}
        onToggleSteps={() => setStepsCollapsed((v) => !v)}
        reveal={false}
        streaming={false}
        suggestions={msg.suggestions}
        clickedSuggestion={msg.clickedSuggestion}
        monitorPericia={monitorPericia}
        monitorVote={
          !isUser && msg.feedback
            ? {
                rating: msg.feedback.rating as FeedbackRating,
                comment: msg.feedback.comment,
              }
            : null
        }
      />

      {isUser && isAudio ? (
        <div className="mt-1 flex justify-end">
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
            <Mic className="h-3 w-3" /> áudio transcrito
          </span>
        </div>
      ) : null}
    </div>
  );
}
