"use client";

/**
 * UsageDetail — drawer de drill-down de uma chamada de LLM.
 *
 * Task 5.2c (Onda 5, F5).
 * Exibe todos os campos de um UsageDetailRow em painel lateral (Dialog full-info).
 * Badge "preço desconhecido" para costKnown=false (BUG 2).
 * Indicador rateStale (BUG 5).
 *
 * Design: docs/superpowers/research/2026-05-18-f5-ui-design.md §10
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { UsageDetailRow } from "@/lib/agent/llm/usage-stats";

// ---------------------------------------------------------------------------
// Formatadores
// ---------------------------------------------------------------------------

const TZ = "America/Sao_Paulo";

const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const numberFmt = new Intl.NumberFormat("pt-BR");

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

function formatVal(v: number | null | undefined, fmt: (n: number) => string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return fmt(v);
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface UsageDetailProps {
  row: UsageDetailRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FieldProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function Field({ label, value, mono }: FieldProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-sm text-foreground", mono && "font-mono text-xs")}>{value}</p>
    </div>
  );
}

export function UsageDetail({ row, open, onOpenChange }: UsageDetailProps) {
  if (!row) return null;

  const isWhisper = /whisper/i.test(row.model);

  const originLabel = row.isPlayground ? "Playground" : "Chat";
  const originClass = row.isPlayground
    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
    : "bg-violet-500/10 text-violet-700 dark:text-violet-300";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" aria-label="Detalhes da chamada de LLM">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Detalhes da chamada
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", originClass)}>
              {originLabel}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {dateTimeFmt.format(new Date(row.createdAt))}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field label="Provider" value={row.provider} />
          <Field label="Modelo" value={row.model} mono />

          {/* Tokens (escondido para Whisper) */}
          {!isWhisper && (
            <>
              <Field label="Tokens entrada" value={numberFmt.format(row.tokensInput)} />
              <Field label="Tokens saída" value={numberFmt.format(row.tokensOutput)} />
            </>
          )}

          {/* Custo USD — BUG 2: badge "preço desconhecido" */}
          <Field
            label="Custo USD"
            value={
              !row.costKnown ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                    preço desconhecido
                  </span>
                </span>
              ) : (
                formatVal(row.costUsd, (v) => usdFmt.format(v))
              )
            }
          />

          {/* Custo BRL — BUG 5: indicador rateStale */}
          <Field
            label="Custo BRL"
            value={
              <span className="flex flex-col gap-0.5">
                <span>{!row.costKnown ? "—" : formatVal(row.costBrl, (v) => brlFmt.format(v))}</span>
                {row.rateStale && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">
                    cotação desatualizada
                  </span>
                )}
              </span>
            }
          />

          {/* Taxa de câmbio e spread */}
          {row.usdToBrlRate != null && (
            <Field
              label="Taxa USD/BRL"
              value={`${row.usdToBrlRate.toFixed(4)}${row.rateSpread != null ? ` (+${(row.rateSpread * 100).toFixed(2)}% spread)` : ""}`}
            />
          )}

          {/* Duração */}
          <Field
            label="Duração"
            value={row.durationMs != null ? `${numberFmt.format(row.durationMs)} ms` : "—"}
          />

          {/* Chars */}
          {row.promptChars != null && (
            <Field label="Chars prompt" value={numberFmt.format(row.promptChars)} />
          )}
          {row.responseChars != null && (
            <Field label="Chars resposta" value={numberFmt.format(row.responseChars)} />
          )}

          {/* Usuário */}
          {row.userId && (
            <Field label="Usuário ID" value={row.userId} mono />
          )}

          {/* Conversa */}
          {row.conversationId && (
            <Field label="Conversa ID" value={row.conversationId} mono />
          )}

          {/* Erro */}
          {row.errorMessage && (
            <div className="col-span-2">
              <Field
                label="Erro"
                value={
                  <span className="text-destructive">{row.errorMessage}</span>
                }
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
