"use client";

/**
 * B2. Linha de mensagem na coluna 3 do monitoramento (read-only).
 * Envelopa o AgentMessage (que agora renderiza as sugestões DENTRO da bolha,
 * com chevron igual ao Raciocínio e selo "usada") e adiciona, por fora, os
 * badges de monitoramento: avaliação do juiz (clicável pro Backtest), voto do
 * usuário (B1) e selo de áudio.
 */

import * as React from "react";
import Link from "next/link";
import { Mic } from "lucide-react";
import { AgentMessage } from "@/components/agent/agent-message";
import type { ProgressStep } from "@/components/agent/progress-trail";
import { EvalStatusBadge } from "@/components/agent/quality/eval-status-badge";
import type { EvalStatus } from "@/lib/agent/quality/queries";
import { RATING_META, type UserFeedbackRating } from "@/components/agent/rating-meta";

const TERMINAL: EvalStatus[] = [
  "CORRETO",
  "PARCIAL",
  "ERRADO",
  "FORA_DO_ESCOPO",
  "FALHA_TECNICA",
];

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
      />

      {isUser && isAudio ? (
        <div className="mt-1 flex justify-end">
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
            <Mic className="h-3 w-3" /> áudio transcrito
          </span>
        </div>
      ) : null}

      {!isUser ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {msg.evaluation ? (
            TERMINAL.includes(msg.evaluation.status as EvalStatus) ? (
              <Link
                href={`/agente/monitoramento?eval=${msg.evaluation.id}`}
                className="transition-opacity hover:opacity-80"
                title="Ver esta avaliação no Backtest"
              >
                <EvalStatusBadge status={msg.evaluation.status as EvalStatus} />
              </Link>
            ) : (
              <EvalStatusBadge status={msg.evaluation.status as EvalStatus} />
            )
          ) : null}

          {msg.feedback ? (
            <span
              title={msg.feedback.comment ?? "Voto do usuário"}
              style={{ background: RATING_META[msg.feedback.rating].color }}
              className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white"
            >
              voto: {RATING_META[msg.feedback.rating].label}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
