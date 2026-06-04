"use client";

/**
 * B2. Linha de mensagem na coluna 3 do monitoramento (read-only).
 * O AgentMessage agora absorve TUDO dentro da bolha: sugestões (chevron igual
 * ao Raciocínio), o veredito do juiz no rodapé (slot `footer`, clicável pro
 * Backtest) e o voto do usuário como badge de canto (igual à bubble viva).
 * Por fora só sobra o selo de áudio nas mensagens do usuário.
 */

import * as React from "react";
import Link from "next/link";
import { Mic } from "lucide-react";
import { AgentMessage } from "@/components/agent/agent-message";
import type { ProgressStep } from "@/components/agent/progress-trail";
import { EvalStatusBadge } from "@/components/agent/quality/eval-status-badge";
import type { EvalStatus } from "@/lib/agent/quality/queries";
import type { UserFeedbackRating } from "@/components/agent/rating-meta";
import type { FeedbackRating } from "@/components/agent/feedback-control";

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

  // Veredito do juiz no rodapé da bolha. Quando terminal, vira link pro Backtest
  // (deep-link via ?eval=). Quando ainda não-terminal, badge estático.
  const ev = msg.evaluation;
  const footer =
    !isUser && ev ? (
      TERMINAL.includes(ev.status as EvalStatus) ? (
        <Link
          href={`/agente/monitoramento?eval=${ev.id}`}
          className="inline-flex transition-opacity hover:opacity-80"
          title="Ver esta avaliação no Backtest"
        >
          <EvalStatusBadge status={ev.status as EvalStatus} />
        </Link>
      ) : (
        <EvalStatusBadge status={ev.status as EvalStatus} />
      )
    ) : null;

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
        footer={footer}
        monitorVote={
          !isUser && msg.feedback
            ? { rating: msg.feedback.rating as FeedbackRating }
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
