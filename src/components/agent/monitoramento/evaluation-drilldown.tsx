"use client";

/**
 * EvaluationDrilldown , painel inline expansivel sob a linha clicada da
 * tabela. Mostra pergunta+resposta completas, badge de status, padroes,
 * razoes do judge, tool calls e tool results (JSON), e bloco de ajuste
 * manual com adjustEvaluation (super_admin).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Gauge,
  History,
  Loader2,
  Pencil,
  Save,
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
import { JsonBlock } from "./json-viewer";

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
        <p className="min-w-0 flex-1 text-[13px] [overflow-wrap:anywhere]">
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
// Horario da plataforma = Brasilia (UTC-3). O formatter ja resolve o fuso via
// timeZone; aqui so removemos a virgula entre data e hora.
function fmtBRT(d: Date): string {
  return dateTimeFmt.format(d).replace(",", "");
}
// Separa as razoes do JUIZ dos AJUSTES HUMANOS embutidos. O adjustEvaluation
// faz append "\n[AJUSTE HUMANO <iso-utc>] <reason>" a cada ajuste (cronologico).
// Aqui o diagnostico mostra so a parte do juiz; os ajustes viram historico
// (mais recente primeiro).
function parseRazoes(razoes: string): {
  judge: string;
  adjustments: { at: Date; reason: string }[];
} {
  const firstIdx = razoes.search(/\[AJUSTE HUMANO /);
  const judge = (firstIdx === -1 ? razoes : razoes.slice(0, firstIdx)).trim();
  const adjustments: { at: Date; reason: string }[] = [];
  if (firstIdx !== -1) {
    const rest = razoes.slice(firstIdx);
    const re = /\[AJUSTE HUMANO ([^\]]+)\]\s*([\s\S]*?)(?=\n*\[AJUSTE HUMANO |\s*$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rest)) !== null) {
      adjustments.push({ at: new Date(m[1].trim()), reason: m[2].trim() });
    }
  }
  adjustments.reverse(); // mais recente primeiro
  return { judge, adjustments };
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
  // Limites (largura/posição) do drill-down para o modal de expandir JSON.
  const rootRef = useRef<HTMLDivElement>(null);
  // Histórico de ajustes (colapsável).
  const [showHistory, setShowHistory] = useState(false);

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
  const { judge: judgeRazoes, adjustments } = parseRazoes(e.razoes ?? "");
  const temDiagnostico = Boolean(judgeRazoes) || e.patterns.length > 0;
  const temAjuste = !isFalha && e.status !== "PENDENTE";
  // Coluna de análise só existe quando há o que mostrar nela.
  const temAnalise =
    Boolean(detail.userFeedback) || temDiagnostico || temAjuste;

  return (
    <div
      ref={rootRef}
      className="border-l-2 border-violet-500/40 bg-muted/20 px-5 py-4"
    >
      {/* ───────────── META BAR: veredito + metadados, num relance ───────────── */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-foreground">
          {ajusteMudou ? (
            // Mesmo padrao do historico: o lapis abre, depois o status antigo
            // (cinza, riscado) -> o novo (tag colorida).
            <span
              className="inline-flex items-center gap-1.5"
              title="O veredito recebeu um ajuste humano"
            >
              <Pencil className="h-3.5 w-3.5 text-violet-400" />
              <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground line-through">
                {STATUS_LABEL[e.status]}
              </span>
              <span aria-hidden className="text-muted-foreground">
                →
              </span>
              <Badge variant="outline" className={cn("border", STATUS_TONE[effStatus])}>
                {STATUS_LABEL[effStatus]}
              </Badge>
            </span>
          ) : (
            <Badge variant="outline" className={cn("border", STATUS_TONE[effStatus])}>
              {STATUS_LABEL[effStatus]}
            </Badge>
          )}
          <span aria-hidden className="h-3.5 w-px bg-border/70" />
          {e.model && (
            <Badge variant="ghost" className="font-mono text-[11px]">
              {e.model}
            </Badge>
          )}
          {detail.durationMs != null ? (
            <span
              className="inline-flex items-center gap-1 text-xs tabular-nums text-foreground"
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
              {/* Uma embaixo da outra, na MESMA ordem oferecida ao usuário. */}
              <ol className="flex flex-col items-start gap-1.5">
                {e.suggestions.map((s, i) => (
                  <li
                    key={`${i}-${s}`}
                    className="inline-flex max-w-full items-center rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-700 [overflow-wrap:anywhere] dark:text-violet-300"
                  >
                    {s}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {!isFalha && (detail.toolCalls != null || detail.toolResults != null) && (
            <Section icon={Wrench} title="Tool calls & results">
              <div className="space-y-3">
                {detail.toolCalls != null && (
                  <JsonBlock label="Tool calls" data={detail.toolCalls} boundsRef={rootRef} />
                )}
                {detail.toolResults != null && (
                  <JsonBlock label="Tool results" data={detail.toolResults} boundsRef={rootRef} />
                )}
              </div>
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
                {judgeRazoes && (
                  <div className="mt-1.5 whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 text-[13px] leading-relaxed [overflow-wrap:anywhere]">
                    {judgeRazoes}
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
                      Último ajuste em {fmtBRT(e.humanReviewedAt)}.
                    </p>
                  )}
                </div>

                {/* Histórico de ajustes (colapsável), mais recente no topo. */}
                {adjustments.length > 0 && (
                  <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
                    <button
                      type="button"
                      onClick={() => setShowHistory((v) => !v)}
                      aria-expanded={showHistory}
                      className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showHistory ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <History className="h-3.5 w-3.5" />
                      Histórico de ajustes · {adjustments.length}
                    </button>
                    {showHistory && (
                      <ul className="divide-y divide-border border-t border-border">
                        {adjustments.map((a, i) => (
                          <li key={i} className="space-y-1 px-3 py-2.5 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                                {Number.isNaN(a.at.getTime()) ? "" : fmtBRT(a.at)}
                              </span>
                              {/* Transicao de status: so o ajuste MAIS RECENTE tem
                                  origem/destino confiavel (juiz -> efetivo); os
                                  anteriores nao guardam o status da epoca. */}
                              {i === 0 && ajusteMudou && (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground line-through">
                                    {STATUS_LABEL[e.status]}
                                  </span>
                                  <span aria-hidden className="text-muted-foreground">
                                    →
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn("border", STATUS_TONE[effStatus])}
                                  >
                                    {STATUS_LABEL[effStatus]}
                                  </Badge>
                                </span>
                              )}
                            </div>
                            <p className="[overflow-wrap:anywhere] text-foreground">
                              {a.reason || (
                                <span className="italic text-muted-foreground">
                                  (sem justificativa)
                                </span>
                              )}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
