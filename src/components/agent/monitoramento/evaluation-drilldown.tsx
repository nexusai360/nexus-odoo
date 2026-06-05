"use client";

/**
 * EvaluationDrilldown , painel inline expansivel sob a linha clicada da
 * tabela. Mostra pergunta+resposta completas, badge de status, padroes,
 * razoes do judge, tool calls e tool results (JSON), e bloco de ajuste
 * manual com adjustEvaluation (super_admin).
 */

import { useCallback, useEffect, useState, type ElementType, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clipboard,
  Clock,
  Gauge,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { Textarea } from "@/components/ui/textarea";
import { adjustEvaluation } from "@/lib/actions/agent-quality";
import { fetchQualityEvaluationDetail } from "@/lib/actions/quality-fetch";
import { cn } from "@/lib/utils";
import type { EvalStatus } from "@/lib/agent/quality/queries";
import { RATING_META, type UserFeedbackRating } from "@/components/agent/rating-meta";
import { MarkdownSnapshot } from "./markdown-snapshot";

/** Bloco padrão do drill-down: header (ícone + título uppercase + ação opcional)
 *  + conteúdo. Unifica TODAS as seções para um ritmo/hierarquia consistente. */
function Section({
  icon: Icon,
  title,
  action,
  tone,
  children,
}: {
  icon: ElementType;
  title: string;
  action?: ReactNode;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h4
          className={cn(
            "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
            tone === "danger"
              ? "text-red-600 dark:text-red-400"
              : "text-muted-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" /> {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Seção da AVALIAÇÃO do usuário (voto na bubble): header com ícone (como
 *  Pergunta/Resposta) + card na COR OFICIAL da categoria, no formato
 *  "[ícone] Categoria: comentário" (ou "sem comentário"). */
function UserAvaliacaoSection({
  rating,
  comment,
}: {
  rating: string;
  comment: string | null;
}) {
  const meta = RATING_META[rating as UserFeedbackRating];
  if (!meta) return null;
  const Icon = meta.Icon;
  const hasComment = Boolean(comment && comment.trim().length > 0);
  return (
    <Section icon={Gauge} title="Avaliação do usuário">
      <div
        className="flex items-start gap-2 rounded-lg border px-3 py-2"
        style={{ borderColor: `${meta.color}40`, background: `${meta.color}14` }}
      >
        <Icon className="mt-px h-3.5 w-3.5 shrink-0" style={{ color: meta.color }} />
        <p className="text-[13px] [overflow-wrap:anywhere]">
          <span className="font-semibold" style={{ color: meta.color }}>
            {meta.label}:
          </span>{" "}
          {hasComment ? (
            comment
          ) : (
            <span className="italic text-muted-foreground">sem comentário</span>
          )}
        </p>
      </div>
    </Section>
  );
}

const STATUS_LABEL: Record<EvalStatus, string> = {
  CORRETO: "Correto",
  PARCIAL: "Parcial",
  ERRADO: "Errado",
  FORA_DO_ESCOPO: "Fora de escopo",
  PENDENTE: "Pendente",
  FALHA_TECNICA: "Falha técnica",
};

const STATUS_TONE: Record<EvalStatus, string> = {
  CORRETO:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  PARCIAL:
    "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300",
  ERRADO: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300",
  FORA_DO_ESCOPO:
    "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300",
  PENDENTE: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300",
  FALHA_TECNICA:
    "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300",
};

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
// Sufixo padrao de fuso: a plataforma opera no horario de Brasilia (UTC-3).
const TZ_LABEL = "(Brasil, UTC-3)";
// Horario da plataforma = Brasilia (UTC-3). O formatter ja resolve o fuso via
// timeZone; aqui so removemos a virgula entre data e hora.
function fmtBRT(d: Date): string {
  return dateTimeFmt.format(d).replace(",", "");
}
// Reescreve o marcador "[AJUSTE HUMANO <iso-utc>]" das razoes para o horario
// de Brasilia com segundos e rotulo de fuso (o ISO e' gravado em UTC no banco).
function humanizeRazoes(razoes: string): string {
  return razoes.replace(/\[AJUSTE HUMANO ([^\]]+)\]/g, (full, iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return full;
    return `[AJUSTE HUMANO ${fmtBRT(d)} ${TZ_LABEL}]`;
  });
}

type Detail = NonNullable<
  Awaited<ReturnType<typeof fetchQualityEvaluationDetail>>
>;

interface Props {
  evaluationId: string;
  onAdjusted?: () => void;
}

export function EvaluationDrilldown({ evaluationId, onAdjusted }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ajuste manual
  const [adjustStatus, setAdjustStatus] = useState<EvalStatus>("CORRETO");
  const [adjustReason, setAdjustReason] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchQualityEvaluationDetail(evaluationId);
      if (!d) {
        setError("Avaliação não encontrada.");
      } else {
        setDetail(d);
        // O seletor de ajuste parte do status EFETIVO (humanStatus ?? status),
        // pra refletir o ajuste anterior em vez de voltar pro veredito automatico.
        const eff = (d.evaluation.humanStatus ?? d.evaluation.status) as string;
        if (
          eff === "CORRETO" ||
          eff === "PARCIAL" ||
          eff === "ERRADO" ||
          eff === "FORA_DO_ESCOPO"
        ) {
          setAdjustStatus(eff);
        }
      }
    } catch (err) {
      setError((err as Error).message ?? "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [evaluationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCopyJson = (label: string, payload: unknown) => {
    void navigator.clipboard
      .writeText(JSON.stringify(payload, null, 2))
      .then(() => toast.success(`${label} copiado para a área de transferência.`))
      .catch(() => toast.error("Não foi possível copiar."));
  };

  const handleSave = async () => {
    if (!detail) return;
    if (!adjustReason.trim()) {
      toast.error("Informe a justificativa do ajuste.");
      return;
    }
    setSaving(true);
    const res = await adjustEvaluation({
      evaluationId,
      humanStatus: adjustStatus as
        | "CORRETO"
        | "PARCIAL"
        | "ERRADO"
        | "FORA_DO_ESCOPO",
      reason: adjustReason.trim(),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Ajuste salvo.");
      setAdjustReason("");
      onAdjusted?.();
      await load();
    } else {
      toast.error(res.error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-6 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando detalhe…
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex items-center gap-2 px-6 py-4 text-sm text-red-600 dark:text-red-400">
        <AlertTriangle className="h-4 w-4" /> {error ?? "Sem dados."}
      </div>
    );
  }

  const e = detail.evaluation;
  const isFalha = e.status === "FALHA_TECNICA";
  const human = e.humanStatus as EvalStatus | null;
  const effStatus = human ?? e.status;
  const ajusteMudou = human != null && human !== e.status;
  const temDiagnostico = Boolean(e.razoes) || e.patterns.length > 0;
  const temAjuste = !isFalha && e.status !== "PENDENTE";
  // Coluna de análise só existe quando há o que mostrar nela.
  const temAnalise =
    Boolean(detail.userFeedback) || temDiagnostico || temAjuste;

  return (
    <div className="border-l-2 border-violet-500/40 bg-muted/20 px-5 py-4">
      {/* ───────────── META BAR: veredito + metadados, num relance ───────────── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Perícia
          </span>
          <Badge variant="outline" className={cn("border", STATUS_TONE[effStatus])}>
            {STATUS_LABEL[effStatus]}
          </Badge>
          {ajusteMudou && (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              title="Ajuste humano sobrescreveu o veredito automático"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span className="line-through">{STATUS_LABEL[e.status]}</span>
              <span aria-hidden>→</span>
              <span className="font-medium text-foreground">{STATUS_LABEL[effStatus]}</span>
            </span>
          )}
          <span aria-hidden className="h-3.5 w-px bg-border/70" />
          {e.model && (
            <Badge variant="ghost" className="font-mono text-[11px]">
              {e.model}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {fmtBRT(e.createdAt)} {TZ_LABEL}
          </span>
          {detail.durationMs != null ? (
            <span
              className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground"
              title="Tempo de geração da resposta"
            >
              <Clock className="h-3.5 w-3.5" />
              {(detail.durationMs / 1000).toFixed(1)}s
            </span>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          {/* judgeModel so existe quando um LLM julgou; o heuristico deixa nulo. */}
          Judge: {e.judgeModel ? `${e.judgeModel} · ` : ""}
          {e.judgeVersion}
        </div>
      </div>

      {/* ── 2 COLUNAS: esquerda = a CONVERSA, direita = a ANÁLISE ── */}
      <div
        className={cn(
          "mt-4 grid grid-cols-1 gap-5",
          temAnalise && "lg:grid-cols-[1.5fr_1fr]",
        )}
      >
        {/* ESQUERDA , a conversa (o que aconteceu) */}
        <div className="min-w-0 space-y-4">
          <Section icon={UserIcon} title="Pergunta">
            <div className="rounded-lg border border-border bg-background px-3 py-2">
              {e.questionSnapshot ? (
                <MarkdownSnapshot content={e.questionSnapshot} />
              ) : (
                <span className="text-sm text-muted-foreground">(vazio)</span>
              )}
            </div>
          </Section>

          {isFalha && e.technicalError ? (
            <Section icon={AlertTriangle} title="Erro técnico" tone="danger">
              <pre className="overflow-x-auto rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 font-mono text-xs text-red-700 dark:text-red-300">
                {e.technicalError}
              </pre>
            </Section>
          ) : (
            <Section icon={Bot} title="Resposta">
              <div className="rounded-lg border border-border bg-background px-3 py-2">
                {isFalha ? (
                  <span className="text-sm italic text-muted-foreground">
                    (sem resposta , falha técnica)
                  </span>
                ) : e.answerSnapshot ? (
                  <MarkdownSnapshot content={e.answerSnapshot} />
                ) : (
                  <span className="text-sm text-muted-foreground">(vazio)</span>
                )}
              </div>
            </Section>
          )}

          {!isFalha && e.suggestions.length > 0 && (
            <Section icon={Sparkles} title="Sugestões oferecidas">
              <div className="flex flex-wrap gap-1.5">
                {e.suggestions.map((s, i) => (
                  <span
                    key={`${i}-${s}`}
                    className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-700 dark:text-violet-300"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {!isFalha && (detail.toolCalls != null || detail.toolResults != null) && (
            <Section
              icon={Wrench}
              title="Tool calls & results"
              action={
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => handleCopyJson("Tool calls", detail.toolCalls ?? {})}
                  >
                    <Clipboard className="h-3.5 w-3.5" /> Calls
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => handleCopyJson("Tool results", detail.toolResults ?? {})}
                  >
                    <Clipboard className="h-3.5 w-3.5" /> Results
                  </Button>
                </div>
              }
            >
              <details className="group rounded-lg border border-border bg-background">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
                  Expandir JSON
                </summary>
                <div className="grid grid-cols-1 gap-3 border-t border-border px-3 py-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tool calls
                    </div>
                    <pre className="max-h-72 overflow-auto rounded bg-muted px-2 py-1.5 font-mono text-[11px]">
                      {JSON.stringify(detail.toolCalls ?? null, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tool results
                    </div>
                    <pre className="max-h-72 overflow-auto rounded bg-muted px-2 py-1.5 font-mono text-[11px]">
                      {JSON.stringify(detail.toolResults ?? null, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            </Section>
          )}
        </div>

        {/* DIREITA , a análise (avaliações + ação), separada por borda */}
        {temAnalise && (
          <div className="min-w-0 space-y-4 lg:border-l lg:border-border/60 lg:pl-5">
            {detail.userFeedback ? (
              <UserAvaliacaoSection
                rating={detail.userFeedback.rating}
                comment={detail.userFeedback.comment}
              />
            ) : null}

            {temDiagnostico && (
              <Section icon={CheckCircle2} title="Diagnóstico da perícia">
                {e.patterns.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {e.patterns.map((p) => (
                      <Badge key={p} variant="outline" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                  </div>
                )}
                {e.razoes && (
                  <div className="mt-1.5 whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 text-[13px] leading-relaxed">
                    {humanizeRazoes(e.razoes)}
                  </div>
                )}
              </Section>
            )}

            {temAjuste && (
              <Section icon={Save} title="Ajuste manual">
                <div className="space-y-2 rounded-lg border border-dashed border-border bg-background px-3 py-3">
                  <CustomSelect
                    value={adjustStatus}
                    onChange={(v) => setAdjustStatus(v as EvalStatus)}
                    triggerClassName="w-full"
                    aria-label="Novo status"
                    options={(
                      ["CORRETO", "PARCIAL", "ERRADO", "FORA_DO_ESCOPO"] as const
                    ).map((s) => ({
                      value: s,
                      label: (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            STATUS_TONE[s],
                          )}
                        >
                          {STATUS_LABEL[s]}
                        </span>
                      ),
                    }))}
                  />
                  <Textarea
                    value={adjustReason}
                    onChange={(ev) => setAdjustReason(ev.target.value)}
                    placeholder="Por que está sendo ajustado?"
                    rows={2}
                    className="w-full"
                    aria-label="Justificativa do ajuste"
                  />
                  <Button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !adjustReason.trim()}
                    className="w-full gap-1.5"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Salvar ajuste
                  </Button>
                  {e.humanReviewedAt && (
                    <p className="text-[11px] text-muted-foreground">
                      Último ajuste em {fmtBRT(e.humanReviewedAt)} {TZ_LABEL}.
                    </p>
                  )}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
