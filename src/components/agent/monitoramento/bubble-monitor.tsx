"use client";

/**
 * B2. Monitoramento das conversas (read-only, super_admin), 3 colunas:
 * colaboradores -> sessões -> conversa fiel à bubble. Reusa AgentMessage
 * (via BubbleMonitorRow) e o design system do monitoramento.
 */

import * as React from "react";
import {
  listBubbleCollaborators,
  listBubbleSessions,
  getBubbleSessionMessages,
  type Collaborator,
  type SessionRow,
} from "@/lib/actions/monitoramento-bubble";
import type { RatingCounts } from "@/lib/actions/monitoramento-bubble-helpers";
import { BubbleMonitorRow, type MonitorMessage } from "./bubble-monitor-row";
import { RATING_META, type UserFeedbackRating } from "@/components/agent/rating-meta";
import { formatDayLabel } from "@/lib/format-datetime-relative";
import { cn } from "@/lib/utils";

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />;
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/20 text-xs font-semibold text-violet-300">
      {initial}
    </div>
  );
}

function Summary({ counts, pct }: { counts: RatingCounts; pct: number | null }) {
  const total = counts.CORRETO + counts.PARCIAL + counts.ERRADO + counts.ALUCINOU;
  if (total === 0)
    return <span className="text-[11px] text-muted-foreground">sem avaliações</span>;
  const order: UserFeedbackRating[] = ["CORRETO", "PARCIAL", "ERRADO", "ALUCINOU"];
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="font-semibold text-foreground">{pct}% acerto</span>
      <span className="flex items-center gap-1.5">
        {order.map((r) =>
          counts[r] > 0 ? (
            <span
              key={r}
              title={RATING_META[r].label}
              style={{ color: RATING_META[r].color }}
              className="tabular-nums"
            >
              {counts[r]}
            </span>
          ) : null,
        )}
      </span>
    </div>
  );
}

function fmtRange(startedAt: string, endedAt: string | null): string {
  const s = new Date(startedAt);
  const d = (x: Date) =>
    `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
  return `${d(s)} ${endedAt ? "ate " + d(new Date(endedAt)) : "ate agora"}`;
}

const COL = "flex h-[68vh] flex-col overflow-hidden rounded-lg border border-border bg-card";
const HEAD = "border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground";

export function BubbleMonitor() {
  const [collabs, setCollabs] = React.useState<Collaborator[] | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<SessionRow[] | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<MonitorMessage[] | null>(null);
  const convScrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    void listBubbleCollaborators().then(setCollabs).catch(() => setCollabs([]));
  }, []);

  // Ao carregar a sessão, abre já no fim (mensagem mais recente embaixo).
  React.useEffect(() => {
    if (messages && convScrollRef.current) {
      convScrollRef.current.scrollTop = convScrollRef.current.scrollHeight;
    }
  }, [messages]);

  React.useEffect(() => {
    if (!userId) {
      setSessions(null);
      setSessionId(null);
      setMessages(null);
      return;
    }
    setSessions(null);
    setSessionId(null);
    setMessages(null);
    void listBubbleSessions(userId).then(setSessions).catch(() => setSessions([]));
  }, [userId]);

  React.useEffect(() => {
    if (!sessionId) {
      setMessages(null);
      return;
    }
    setMessages(null);
    void getBubbleSessionMessages(sessionId)
      .then((r) => setMessages(r.ok ? (r.messages.filter((m) => m.role !== "tool") as MonitorMessage[]) : []))
      .catch(() => setMessages([]));
  }, [sessionId]);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_300px_1fr]">
      {/* Coluna 1: colaboradores */}
      <div className={COL}>
        <div className={HEAD}>Colaboradores</div>
        <div className="flex-1 overflow-y-auto p-2">
          {collabs === null ? (
            <Skeletons />
          ) : collabs.length === 0 ? (
            <Empty>Nenhuma conversa ainda.</Empty>
          ) : (
            collabs.map((c) => (
              <button
                key={c.userId}
                onClick={() => setUserId(c.userId)}
                className={cn(
                  "mb-1 flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors",
                  userId === c.userId ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <Avatar name={c.name} url={c.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-foreground">{c.name}</span>
                    <span
                      title={c.hasActiveSession ? "Sessão ativa" : "Sem sessão ativa"}
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        c.hasActiveSession ? "bg-emerald-500" : "bg-muted-foreground/40",
                      )}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.sessionCount} {c.sessionCount === 1 ? "sessão" : "sessões"}
                  </div>
                  <Summary counts={c.ratingCounts} pct={c.accuracyPct} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Coluna 2: sessões */}
      <div className={COL}>
        <div className={HEAD}>Sessões</div>
        <div className="flex-1 overflow-y-auto p-2">
          {!userId ? (
            <Empty>Escolha um colaborador.</Empty>
          ) : sessions === null ? (
            <Skeletons />
          ) : sessions.length === 0 ? (
            <Empty>Sem sessão ativa.</Empty>
          ) : (
            sessions.map((s) => (
              <button
                key={s.conversationId}
                onClick={() => setSessionId(s.conversationId)}
                className={cn(
                  "mb-1 w-full rounded-md p-2 text-left transition-colors",
                  sessionId === s.conversationId ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Sessão {s.index}</span>
                  {s.isActive ? (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                      ativa
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground">{fmtRange(s.startedAt, s.endedAt)}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{s.messageCount} msgs</span>
                  <Summary counts={s.ratingCounts} pct={s.accuracyPct} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Coluna 3: conversa */}
      <div className={COL}>
        <div className={HEAD}>Conversa</div>
        <div ref={convScrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {!sessionId ? (
            <Empty>Escolha uma sessão.</Empty>
          ) : messages === null ? (
            <Skeletons />
          ) : messages.length === 0 ? (
            <Empty>Sessão sem mensagens.</Empty>
          ) : (
            <Conversation messages={messages} />
          )}
        </div>
      </div>
    </div>
  );
}

function Conversation({ messages }: { messages: MonitorMessage[] }) {
  return (
    <>
      {messages.map((m, i) => {
        const day = formatDayLabel(m.createdAt);
        const prevDay = i > 0 ? formatDayLabel(messages[i - 1]!.createdAt) : null;
        const showSep = day !== prevDay;
        return (
          <React.Fragment key={m.id}>
            {showSep ? (
              <div className="my-2 flex justify-center">
                <span className="rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-bold text-violet-300">
                  {day}
                </span>
              </div>
            ) : null}
            <BubbleMonitorRow msg={m} />
          </React.Fragment>
        );
      })}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Skeletons() {
  return (
    <div className="space-y-2 p-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-muted/60" />
      ))}
    </div>
  );
}
