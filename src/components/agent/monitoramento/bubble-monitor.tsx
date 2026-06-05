"use client";

/**
 * B2. Monitoramento das conversas (read-only, super_admin), 3 colunas JUNTAS
 * num painel único (colaboradores | sessões | conversa), divididas só por
 * borda interna. Colaboradores e Sessões têm a MESMA largura (homogêneas) e os
 * cards a mesma altura; a Conversa fica com o resto. Cada card mostra DOIS
 * eixos de qualidade: AVALIAÇÃO (usuário) e PERÍCIA (plataforma/juiz). A coluna
 * 3 espelha a bubble viva: tag de data flutuante no topo + FAB de descer.
 */

import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Gauge, Scale } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
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

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Administrador",
  manager: "Gerente",
  viewer: "Visualizador",
};

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

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role] ?? role;
  const isSuper = role === "super_admin";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide",
        isSuper
          ? "bg-violet-500/20 text-violet-300"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

// Contagens coloridas (não-zero) de um eixo, num agrupador sutil para separar
// visualmente do percentual (em vez de números soltos).
function CountChips({ counts }: { counts: RatingCounts }) {
  const order: UserFeedbackRating[] = ["CORRETO", "PARCIAL", "ERRADO", "ALUCINOU"];
  const any = order.some((r) => counts[r] > 0);
  if (!any) return null;
  return (
    <span className="flex items-center gap-1 rounded bg-muted/60 px-1.5 py-px text-[10px]">
      {order.map((r) =>
        counts[r] > 0 ? (
          <span
            key={r}
            title={`${RATING_META[r].label}: ${counts[r]}`}
            style={{ color: RATING_META[r].color }}
            className="font-semibold tabular-nums"
          >
            {counts[r]}
          </span>
        ) : null,
      )}
    </span>
  );
}

// Uma métrica: ícone (eixo) + percentual em destaque + contagens agrupadas.
// O ícone substitui a palavra (Gauge=Avaliação do usuário, Scale=Perícia da
// plataforma); o title traz o nome completo.
function Metric({
  Icon,
  title,
  pct,
  counts,
}: {
  Icon: React.ElementType;
  title: string;
  pct: number | null;
  counts: RatingCounts;
}) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap" title={title}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {pct === null ? (
        <span className="text-[11px] text-muted-foreground/50">sem dados</span>
      ) : (
        <>
          <b className="text-[12px] font-bold tabular-nums text-foreground">{pct}%</b>
          <CountChips counts={counts} />
        </>
      )}
    </span>
  );
}

// Par de métricas numa linha: AVALIAÇÃO (Gauge) | PERÍCIA (Scale), com divisória.
function MetricsPair({
  avaliacaoPct,
  avaliacaoCounts,
  periciaPct,
  periciaCounts,
}: {
  avaliacaoPct: number | null;
  avaliacaoCounts: RatingCounts;
  periciaPct: number | null;
  periciaCounts: RatingCounts;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <Metric
        Icon={Gauge}
        title="Avaliação (voto do usuário)"
        pct={avaliacaoPct}
        counts={avaliacaoCounts}
      />
      <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" />
      <Metric
        Icon={Scale}
        title="Perícia (avaliação da plataforma)"
        pct={periciaPct}
        counts={periciaCounts}
      />
    </div>
  );
}

function fmtRange(startedAt: string, endedAt: string | null): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = (x: Date) =>
    `${p(x.getDate())}/${p(x.getMonth() + 1)}/${p(x.getFullYear() % 100)} ${p(x.getHours())}:${p(x.getMinutes())}:${p(x.getSeconds())}`;
  return `${d(new Date(startedAt))} ${endedAt ? "até " + d(new Date(endedAt)) : "até agora"}`;
}

// Painel único: as 3 colunas dividem o mesmo card, separadas só por borda
// interna. Colaboradores e Sessões têm a MESMA largura; Conversa fica com o resto.
const PANEL =
  "flex h-[72vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:flex-row";
const SECTION = "flex min-h-0 min-w-0 flex-1 flex-col";
const DIVIDER = "border-b border-border lg:border-b-0 lg:border-r";
const SIDE_COL = "lg:w-[330px] lg:flex-none";
const HEAD =
  "shrink-0 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
// Tira/largura quando recolhida (faixa estreita só com o título vertical).
const SIDE_COLLAPSED = "lg:w-9 lg:flex-none";

/**
 * Coluna lateral recolhível (Colaboradores / Sessões). Recolhida vira uma faixa
 * estreita com o título na vertical + chevron pra reabrir; expandida tem o
 * header com o botão de recolher. A Conversa (flex-1) cresce sozinha quando uma
 * lateral encolhe.
 */
function SideColumn({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  if (collapsed) {
    return (
      <div className={cn(SECTION, DIVIDER, SIDE_COLLAPSED)}>
        <button
          type="button"
          onClick={onToggle}
          title={`Expandir ${title}`}
          aria-label={`Expandir ${title}`}
          className="flex h-full w-full cursor-pointer flex-col items-center gap-2 py-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wide [writing-mode:vertical-rl]">
            {title}
          </span>
        </button>
      </div>
    );
  }
  return (
    <div className={cn(SECTION, DIVIDER, SIDE_COL)}>
      <div className={cn(HEAD, "flex items-center justify-between gap-2")}>
        <span>{title}</span>
        <button
          type="button"
          onClick={onToggle}
          title={`Recolher ${title}`}
          aria-label={`Recolher ${title}`}
          className="-mr-1 inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

export function BubbleMonitor() {
  const [collabCollapsed, setCollabCollapsed] = React.useState(false);
  const [sessionsCollapsed, setSessionsCollapsed] = React.useState(false);
  const [collabs, setCollabs] = React.useState<Collaborator[] | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<SessionRow[] | null>(null);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<MonitorMessage[] | null>(null);
  const convScrollRef = React.useRef<HTMLDivElement>(null);
  const [showScrollFab, setShowScrollFab] = React.useState(false);
  const rowRefs = React.useRef<Map<string, HTMLElement>>(new Map());
  const [dateLabel, setDateLabel] = React.useState("");

  React.useEffect(() => {
    void listBubbleCollaborators().then(setCollabs).catch(() => setCollabs([]));
  }, []);

  const recomputeDateLabel = React.useCallback(() => {
    const scrollEl = convScrollRef.current;
    if (!scrollEl) return;
    const list = messages ?? [];
    if (list.length === 0) {
      setDateLabel("");
      return;
    }
    const topEdge = scrollEl.getBoundingClientRect().top;
    let label = "";
    for (const m of list) {
      const el = rowRefs.current.get(m.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top - topEdge <= 16) label = formatDayLabel(m.createdAt);
      else break;
    }
    if (!label) {
      const first = list[0];
      if (first) label = formatDayLabel(first.createdAt);
    }
    setDateLabel((prev) => (prev === label ? prev : label));
  }, [messages]);

  // Ao carregar a sessão, abre no INÍCIO (mensagem mais antiga no topo); o
  // usuário rola pra baixo (ou usa o FAB de descer). Recalcula a tag de data.
  React.useEffect(() => {
    const el = convScrollRef.current;
    if (messages && el) {
      el.scrollTop = 0;
      setShowScrollFab(el.scrollHeight - el.clientHeight > 120);
      recomputeDateLabel();
    }
  }, [messages, recomputeDateLabel]);

  const onConvScroll = React.useCallback(() => {
    const el = convScrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollFab(distanceFromBottom > 120);
    recomputeDateLabel();
  }, [recomputeDateLabel]);

  const scrollConvToBottom = React.useCallback(() => {
    const el = convScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setShowScrollFab(false);
  }, []);

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
    rowRefs.current.clear();
    void getBubbleSessionMessages(sessionId)
      .then((r) =>
        setMessages(
          r.ok
            ? (r.messages.filter(
                (m) =>
                  m.role !== "tool" &&
                  (m.content.trim().length > 0 || m.kind === "audio"),
              ) as MonitorMessage[])
            : [],
        ),
      )
      .catch(() => setMessages([]));
  }, [sessionId]);

  return (
    <div className={PANEL}>
      {/* Coluna 1: colaboradores (recolhível) */}
      <SideColumn
        title="Colaboradores"
        collapsed={collabCollapsed}
        onToggle={() => setCollabCollapsed((v) => !v)}
      >
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
                  "mb-1 w-full rounded-md p-2 text-left transition-colors",
                  userId === c.userId ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <Avatar name={c.name} url={c.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {c.name}
                      </span>
                      <span
                        title={c.hasActiveSession ? "Sessão ativa" : "Sem sessão ativa"}
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          c.hasActiveSession ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                      />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <RoleBadge role={c.role} />
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {c.sessionCount} {c.sessionCount === 1 ? "sessão" : "sessões"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-1.5">
                  <MetricsPair
                    avaliacaoPct={c.avaliacaoPct}
                    avaliacaoCounts={c.avaliacaoCounts}
                    periciaPct={c.periciaPct}
                    periciaCounts={c.periciaCounts}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </SideColumn>

      {/* Coluna 2: sessões (recolhível) */}
      <SideColumn
        title="Sessões"
        collapsed={sessionsCollapsed}
        onToggle={() => setSessionsCollapsed((v) => !v)}
      >
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
                <div className="whitespace-nowrap text-[11px] text-muted-foreground">
                  {fmtRange(s.startedAt, s.endedAt)} ·{" "}
                  <span className="tabular-nums">{s.messageCount}</span> msgs
                </div>
                <div className="mt-1">
                  <MetricsPair
                    avaliacaoPct={s.avaliacaoPct}
                    avaliacaoCounts={s.avaliacaoCounts}
                    periciaPct={s.periciaPct}
                    periciaCounts={s.periciaCounts}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </SideColumn>

      {/* Coluna 3: conversa */}
      <div className={cn(SECTION, "relative")}>
        <div className={HEAD}>Conversa</div>
        <div
          ref={convScrollRef}
          onScroll={onConvScroll}
          className="flex-1 space-y-4 overflow-y-auto p-4"
        >
          {!sessionId ? (
            <Empty>Escolha uma sessão.</Empty>
          ) : messages === null ? (
            <Skeletons />
          ) : messages.length === 0 ? (
            <Empty>Sessão sem mensagens.</Empty>
          ) : (
            <Conversation
              messages={messages}
              registerRef={(id, el) => {
                if (el) rowRefs.current.set(id, el);
                else rowRefs.current.delete(id);
              }}
            />
          )}
        </div>

        <FloatingDateTag label={messages && messages.length > 0 ? dateLabel : ""} />
        <ScrollToBottomFab visible={showScrollFab} onClick={scrollConvToBottom} />
      </div>
    </div>
  );
}

function FloatingDateTag({ label }: { label: string }) {
  const reduce = useReducedMotion();
  if (!label) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-[44px] z-30 -translate-x-1/2">
      <span className="block rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-bold text-violet-200 shadow-sm ring-1 ring-violet-400/25 backdrop-blur-md">
        <motion.span
          key={label}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="block whitespace-nowrap"
        >
          {label}
        </motion.span>
      </span>
    </div>
  );
}

// FAB de descer na conversa, espelhando o da bubble viva (chat-panel).
function ScrollToBottomFab({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ir para o fim da conversa"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "absolute bottom-4 right-4 z-30 flex h-9 w-9 items-center justify-center rounded-full",
        "bg-violet-500/20 text-violet-200 shadow-sm ring-1 ring-violet-400/25 backdrop-blur-md",
        "transition-all duration-200 hover:bg-violet-500/45 hover:text-white hover:ring-violet-400/50",
        "focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none",
        visible
          ? "translate-y-0 cursor-pointer opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ChevronDown className="h-4 w-4" />
    </button>
  );
}

function Conversation({
  messages,
  registerRef,
}: {
  messages: MonitorMessage[];
  registerRef: (id: string, el: HTMLElement | null) => void;
}) {
  return (
    <>
      {messages.map((m) => (
        <div key={m.id} ref={(el) => registerRef(m.id, el)}>
          <BubbleMonitorRow msg={m} />
        </div>
      ))}
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
