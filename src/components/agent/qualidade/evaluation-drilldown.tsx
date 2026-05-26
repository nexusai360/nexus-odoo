"use client";

/**
 * EvaluationDrilldown , painel inline expansivel sob a linha clicada da
 * tabela. Mostra pergunta+resposta completas, badge de status, padroes,
 * razoes do judge, tool calls e tool results (JSON), e bloco de ajuste
 * manual com adjustEvaluation (super_admin).
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clipboard,
  Loader2,
  Save,
  ShieldCheck,
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
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

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
        if (
          d.evaluation.status === "CORRETO" ||
          d.evaluation.status === "PARCIAL" ||
          d.evaluation.status === "ERRADO" ||
          d.evaluation.status === "FORA_DO_ESCOPO"
        ) {
          setAdjustStatus(d.evaluation.status);
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

  return (
    <div className="space-y-4 border-l-2 border-violet-500/40 bg-muted/20 px-5 py-4">
      {/* Cabecalho do drill-down */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn("border", STATUS_TONE[e.status])}
          >
            {STATUS_LABEL[e.status]}
          </Badge>
          {e.humanStatus && (
            <Badge variant="outline" className="border-emerald-500/40">
              <ShieldCheck className="mr-1 h-3 w-3" />
              Ajustado:{" "}
              {STATUS_LABEL[e.humanStatus as EvalStatus] ?? e.humanStatus}
            </Badge>
          )}
          {e.model && (
            <Badge variant="ghost" className="font-mono text-[11px]">
              {e.model}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {dateTimeFmt.format(e.createdAt)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          Judge: {e.judgeModel ?? "—"} · {e.judgeVersion}
        </div>
      </div>

      {/* Pergunta e resposta */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="space-y-1.5">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <UserIcon className="h-3.5 w-3.5" /> Pergunta
          </h4>
          <div className="whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {e.questionSnapshot ? (
              e.questionSnapshot
            ) : (
              <span className="text-muted-foreground">(vazio)</span>
            )}
          </div>
        </section>
        <section className="space-y-1.5">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Bot className="h-3.5 w-3.5" /> Resposta
          </h4>
          <div className="whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {isFalha ? (
              <span className="text-muted-foreground italic">
                (sem resposta , falha técnica)
              </span>
            ) : e.answerSnapshot ? (
              e.answerSnapshot
            ) : (
              <span className="text-muted-foreground">(vazio)</span>
            )}
          </div>
        </section>
      </div>

      {/* Erro técnico se FALHA_TECNICA */}
      {isFalha && e.technicalError && (
        <section className="space-y-1.5">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Erro técnico
          </h4>
          <pre className="overflow-x-auto rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 font-mono text-xs text-red-700 dark:text-red-300">
            {e.technicalError}
          </pre>
        </section>
      )}

      {/* Tool calls + results , so quando ha assistantMessageId */}
      {!isFalha && (detail.toolCalls != null || detail.toolResults != null) && (
        <section className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Wrench className="h-3.5 w-3.5" /> Tool calls & results
            </h4>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() =>
                  handleCopyJson("Tool calls", detail.toolCalls ?? {})
                }
              >
                <Clipboard className="h-3.5 w-3.5" /> Calls
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() =>
                  handleCopyJson("Tool results", detail.toolResults ?? {})
                }
              >
                <Clipboard className="h-3.5 w-3.5" /> Results
              </Button>
            </div>
          </div>
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
        </section>
      )}

      {/* Razoes do judge + patterns */}
      {(e.razoes || e.patterns.length > 0) && (
        <section className="space-y-1.5">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" /> Diagnóstico
          </h4>
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
            <div className="whitespace-pre-wrap rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {e.razoes}
            </div>
          )}
        </section>
      )}

      {/* Ajuste manual (super_admin) , so para evals com status fechado */}
      {!isFalha && e.status !== "PENDENTE" && (
        <section className="space-y-2 rounded-lg border border-dashed border-border bg-background px-3 py-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ajuste manual
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            <CustomSelect
              value={adjustStatus}
              onChange={(v) => setAdjustStatus(v as EvalStatus)}
              triggerClassName="min-w-[160px]"
              aria-label="Novo status"
              options={[
                { value: "CORRETO", label: "Correto" },
                { value: "PARCIAL", label: "Parcial" },
                { value: "ERRADO", label: "Errado" },
                { value: "FORA_DO_ESCOPO", label: "Fora de escopo" },
              ]}
            />
            <Textarea
              value={adjustReason}
              onChange={(ev) => setAdjustReason(ev.target.value)}
              placeholder="Por que está sendo ajustado?"
              rows={2}
              className="flex-1 min-w-[240px]"
              aria-label="Justificativa do ajuste"
            />
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !adjustReason.trim()}
              className="gap-1.5"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Salvar ajuste
            </Button>
          </div>
          {e.humanReviewedAt && (
            <p className="text-[11px] text-muted-foreground">
              Último ajuste em {dateTimeFmt.format(e.humanReviewedAt)}.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
