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
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Gauge,
  Loader2,
  MessageCircle,
  Scale,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { exportConversationReport } from "@/lib/actions/agent-conversation-export";
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

/** Marcador discreto do canal da sessão (Bubble in-app vs WhatsApp). F5 E. */
function ChannelBadge({ channel }: { channel: string }) {
  const isWhatsapp = channel === "whatsapp";
  const Icon = isWhatsapp ? Smartphone : MessageCircle;
  const label = isWhatsapp ? "WhatsApp" : "Bubble";
  return (
    <span
      title={`Canal: ${label}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        isWhatsapp
          ? "bg-green-500/15 text-green-600 dark:text-green-400"
          : "bg-violet-500/15 text-violet-600 dark:text-violet-400",
      )}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  );
}

// Painel único: as 3 colunas dividem o mesmo card, separadas só por borda
// interna. Colaboradores e Sessões têm a MESMA largura; Conversa fica com o resto.
const PANEL =
  "flex h-[72vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:flex-row";
/**
 * Botão de download da conversa em .txt (mesmo relatório da bubble:
 * exportConversationReport, agora com a avaliação do usuário por resposta).
 * Reutilizado na coluna Sessões (1 por sessão) e no cabeçalho da Conversa.
 * Tem estado de carregando próprio e para a propagação do clique (não seleciona
 * a sessão ao baixar).
 */
function DownloadConvButton({
  conversationId,
  className,
  title = "Baixar conversa (.txt)",
  size = "md",
}: {
  conversationId: string;
  className?: string;
  title?: string;
  size?: "sm" | "md";
}) {
  const [loading, setLoading] = React.useState(false);
  const box = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const glyph = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const r = await exportConversationReport(conversationId);
      if (!r.ok) {
        toast.error(r.error || "Não foi possível baixar a conversa.");
        return;
      }
      const blob = new Blob([r.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Falha ao baixar a conversa.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={title}
      aria-label={title}
      className={cn(
        // Hover em tom violeta translúcido (a "bolinha" em volta): aparece tanto
        // na row normal quanto na SELECIONADA (que tem bg-muted e antes "comia"
        // o hover bg-muted, deixando o botão sem realce na sessão aberta).
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-violet-500/15 hover:text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60",
        box,
        className,
      )}
    >
      {loading ? (
        <Loader2 className={cn(glyph, "animate-spin")} aria-hidden />
      ) : (
        <Download className={glyph} aria-hidden />
      )}
    </button>
  );
}

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

// Cadência única do polling ao vivo (todas as 3 colunas). ~2.5s é imperceptível
// num monitor e mais leve que 1s nas agregações de Colaboradores/Sessões.
const LIVE_POLL_MS = 2500;

// Não trabalha com a aba em segundo plano (economiza query e bateria).
function tabHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

// Filtro das mensagens exibidas na coluna Conversa (mesmo critério em toda
// carga , inicial e polling): sem role "tool" e sem assistant intermediária
// vazia (tool-call). Genérico pra preservar o tipo do DTO de origem.
function keepVisible<T extends { role: string; content: string; kind?: string }>(
  msgs: T[],
): T[] {
  return msgs.filter(
    (m) =>
      m.role !== "tool" &&
      (m.content.trim().length > 0 || m.kind === "audio"),
  );
}

// Assinatura barata pra detectar mudança entre dois polls: cobre mensagem nova,
// conteúdo, sugestões que preencheram OU TROCARAM (baseline → contextual), a
// sugestão clicada, o status do juiz e o voto. Igual → não re-renderiza (evita
// jump de scroll e flicker da tag de data).
// IMPORTANTE (N3): usa o CONTEÚDO das sugestões, não só a contagem. O snapshot
// "suggestions-shown" troca o set cru pelo contextual mantendo a MESMA
// quantidade; assinar só por `length` deixava o monitor preso nas sugestões
// antigas (divergência bubble x monitoramento). Mesma lógica vale pro conteúdo
// da mensagem (assinar por texto, não por tamanho).
function messagesSignature(list: MonitorMessage[]): string {
  return list
    .map((m) =>
      [
        m.id,
        m.content,
        (m.suggestions ?? []).join("␟"),
        m.clickedSuggestion ?? "",
        m.evaluation?.status ?? "",
        m.feedback?.rating ?? "",
        m.feedback?.comment ?? "",
      ].join("␞"),
    )
    .join("┃");
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
  // Assinatura da última lista aplicada (detecção de novidade no polling) e modo
  // de scroll pra próxima aplicação de `messages` ("top" = abre na 1a carga,
  // "bottom" = gruda no fim num update ao vivo, "keep" = preserva a posição).
  const messagesSigRef = React.useRef<string | null>(null);
  const stickModeRef = React.useRef<"top" | "bottom" | "keep">("top");
  // Assinaturas das listas pra aplicar update só quando muda (sem flicker nem
  // perda de seleção). JSON da lista cobre campos e ordem (reordenar por
  // atividade conta como mudança e deve refletir).
  const collabsSigRef = React.useRef<string | null>(null);
  const sessionsSigRef = React.useRef<string | null>(null);

  // COLABORADORES ao vivo: carga inicial + repesca a cada LIVE_POLL_MS. Só
  // aplica quando a lista muda (contagem de sessões, sessão ativa, métricas,
  // ordem por atividade). A seleção (userId) é estado à parte , não se perde.
  React.useEffect(() => {
    let cancelled = false;
    const load = (initial: boolean) => {
      if (!initial && tabHidden()) return;
      void listBubbleCollaborators()
        .then((list) => {
          if (cancelled) return;
          const sig = JSON.stringify(list);
          if (!initial && sig === collabsSigRef.current) return;
          collabsSigRef.current = sig;
          setCollabs(list);
        })
        .catch(() => {
          if (initial) setCollabs([]);
        });
    };
    load(true);
    const id = setInterval(() => load(false), LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
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

  // Posicionamento ao aplicar `messages`. 1a carga da sessão ("top"): abre na
  // mensagem mais antiga. Update ao vivo do polling: "bottom" gruda no fim pra
  // revelar a nova quando o usuário já estava lá; "keep" preserva a posição
  // (não dá jump) quando ele está lendo histórico acima. Sempre recalcula data.
  React.useEffect(() => {
    const el = convScrollRef.current;
    if (messages && el) {
      if (stickModeRef.current === "top") {
        el.scrollTop = 0;
      } else if (stickModeRef.current === "bottom") {
        el.scrollTop = el.scrollHeight;
      }
      setShowScrollFab(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
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

  // SESSÕES ao vivo: ao trocar de colaborador reseta seleção + skeleton; depois
  // repesca a cada LIVE_POLL_MS, aplicando só quando muda (nova sessão, msgs,
  // badge "ativa", métricas). A sessão aberta (sessionId) não se perde.
  React.useEffect(() => {
    sessionsSigRef.current = null;
    if (!userId) {
      setSessions(null);
      setSessionId(null);
      setMessages(null);
      return;
    }
    setSessions(null);
    setSessionId(null);
    setMessages(null);
    let cancelled = false;
    const load = (initial: boolean) => {
      if (!initial && tabHidden()) return;
      void listBubbleSessions(userId)
        .then((list) => {
          if (cancelled) return;
          const sig = JSON.stringify(list);
          if (!initial && sig === sessionsSigRef.current) return;
          sessionsSigRef.current = sig;
          setSessions(list);
        })
        .catch(() => {
          if (initial) setSessions([]);
        });
    };
    load(true);
    const id = setInterval(() => load(false), LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [userId]);

  // Carga INICIAL ao trocar de sessão: skeleton → fetch → abre no topo.
  React.useEffect(() => {
    messagesSigRef.current = null;
    if (!sessionId) {
      setMessages(null);
      return;
    }
    setMessages(null);
    rowRefs.current.clear();
    stickModeRef.current = "top";
    void getBubbleSessionMessages(sessionId)
      .then((r) => {
        const list = r.ok ? (keepVisible(r.messages) as MonitorMessage[]) : [];
        messagesSigRef.current = messagesSignature(list);
        setMessages(list);
      })
      .catch(() => {
        messagesSigRef.current = null;
        setMessages([]);
      });
  }, [sessionId]);

  // ATUALIZAÇÃO AO VIVO (~2s): com uma sessão aberta, repesca as mensagens e só
  // aplica quando há novidade (mensagem nova do usuário/IA, voto, sugestão que
  // preencheu). Pausa em aba oculta. Reusa a action testada , sem infra de SSE.
  React.useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const tick = () => {
      if (tabHidden()) return;
      void getBubbleSessionMessages(sessionId)
        .then((r) => {
          if (cancelled || !r.ok) return;
          const list = keepVisible(r.messages) as MonitorMessage[];
          const sig = messagesSignature(list);
          if (sig === messagesSigRef.current) return; // nada mudou
          messagesSigRef.current = sig;
          const el = convScrollRef.current;
          const atBottom = el
            ? el.scrollHeight - el.scrollTop - el.clientHeight < 120
            : true;
          // No fim → gruda pra revelar a nova; lendo acima → preserva posição.
          stickModeRef.current = atBottom ? "bottom" : "keep";
          setMessages(list);
        })
        .catch(() => {});
    };
    const id = setInterval(tick, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
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
              <div key={s.conversationId} className="relative">
              <button
                onClick={() => setSessionId(s.conversationId)}
                className={cn(
                  "mb-1 w-full rounded-md p-2 pr-9 text-left transition-colors",
                  sessionId === s.conversationId ? "bg-muted" : "hover:bg-muted/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Sessão {s.index}</span>
                  <ChannelBadge channel={s.channel} />
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
                <DownloadConvButton
                  conversationId={s.conversationId}
                  className="absolute right-2 top-2"
                  title={`Baixar conversa da Sessão ${s.index} (.txt)`}
                />
              </div>
            ))
          )}
        </div>
      </SideColumn>

      {/* Coluna 3: conversa */}
      <div className={cn(SECTION, "relative")}>
        <div className={cn(HEAD, "flex items-center justify-between gap-2")}>
          <span>Conversa</span>
          {/* Download da conversa selecionada: MESMO tamanho (md, h-6) do botão
              por sessão da coluna 2. Pra borda inferior do header continuar
              ALINHADA com Colaboradores/Sessões (cujo chevron é h-5=20px), o
              -my-0.5 tira os 4px extras do h-6 da altura da linha , o botão fica
              maior sem empurrar a borda. Hover violeta mantido. */}
          {sessionId ? (
            <DownloadConvButton
              conversationId={sessionId}
              size="md"
              className="-mr-1 -my-0.5"
              title="Baixar esta conversa (.txt)"
            />
          ) : (
            <span aria-hidden className="h-5" />
          )}
        </div>
        <div
          ref={convScrollRef}
          onScroll={onConvScroll}
          className="flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-[21px]"
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
      {messages.map((m, idx) => (
        <div
          key={m.id}
          ref={(el) => registerRef(m.id, el)}
          // Só a PRIMEIRA mensagem ganha um respiro extra no topo, pra não ficar
          // encoberta pela tag de data flutuante ("Hoje").
          className={idx === 0 ? "mt-[5px]" : undefined}
        >
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
