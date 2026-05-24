"use client";

/**
 * UsageDetailInline — drill-down de uma chamada exibido como linha expandida
 * imediatamente abaixo da linha clicada na tabela de Historico. Substitui o
 * drawer lateral (UsageDetailSheet), mostrando APENAS informacoes que NAO
 * estao na linha (id, conversa, usuario, quebra de custo com IOF/spread,
 * texto pre-prompt/resposta), evitando repeticao.
 */

import { AlertTriangle, Clipboard } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  IOF_RATE,
  BANK_SPREAD_RATE,
} from "@/lib/agent/llm/exchange-rate";
import type { UsageDetailRow } from "@/lib/agent/llm/usage-stats";
import { cn } from "@/lib/utils";

const numberFmt = new Intl.NumberFormat("pt-BR");
const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 6,
  maximumFractionDigits: 6,
});
const brlFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});
const percentFmt = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function UsageDetailInline({ row }: { row: UsageDetailRow }) {
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
      toast.success("JSON copiado para a area de transferencia");
    } catch (err) {
      console.warn("[usage-detail-inline] clipboard error:", err);
      toast.error("Nao foi possivel copiar o JSON");
    }
  }, [row]);

  return (
    <div className="space-y-5 rounded-lg border border-violet-500/20 bg-violet-500/[0.03] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Detalhes da chamada
        </h4>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2 text-xs"
        >
          <Clipboard className="h-3 w-3" aria-hidden />
          Copiar JSON
        </Button>
      </div>

      <IdentificationSection row={row} />
      {row.promptChars != null || row.responseChars != null ? (
        <CharsSection row={row} />
      ) : null}
      <CostBreakdownSection row={row} />
      {row.errorMessage ? <ErrorSection message={row.errorMessage} /> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        {title}
      </h5>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {children}
      </dl>
    </section>
  );
}

function Field({
  label,
  value,
  mono = false,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-xs text-foreground break-all",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function IdentificationSection({ row }: { row: UsageDetailRow }) {
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <Section title="Identificacao">
      <Field
        label="ID da chamada"
        value={row.id}
        mono
        className="sm:col-span-2"
      />
      <Field
        label="ID da conversa"
        value={
          row.conversationId ? (
            <span className="font-mono">{row.conversationId}</span>
          ) : (
            dash
          )
        }
      />
      <Field
        label="ID do usuario"
        value={
          row.userId ? <span className="font-mono">{row.userId}</span> : dash
        }
      />
    </Section>
  );
}

function CharsSection({ row }: { row: UsageDetailRow }) {
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <Section title="Texto bruto">
      <Field
        label="Prompt (chars)"
        value={
          row.promptChars == null ? dash : numberFmt.format(row.promptChars)
        }
        mono={row.promptChars != null}
      />
      <Field
        label="Resposta (chars)"
        value={
          row.responseChars == null
            ? dash
            : numberFmt.format(row.responseChars)
        }
        mono={row.responseChars != null}
      />
    </Section>
  );
}

function CostBreakdownSection({ row }: { row: UsageDetailRow }) {
  if (!row.costKnown) {
    return (
      <Section title="Quebra de custo">
        <div className="sm:col-span-2 inline-flex w-fit items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          Preco desconhecido — sem catalogo para este modelo
        </div>
      </Section>
    );
  }

  const commercialRate =
    row.usdToBrlRate != null && row.rateSpread != null && row.rateSpread > 0
      ? row.usdToBrlRate / row.rateSpread
      : row.usdToBrlRate ?? null;

  const costUsd = row.costUsd ?? 0;
  const baseBrl =
    commercialRate != null ? +(costUsd * commercialRate).toFixed(6) : null;
  const iofBrl = baseBrl != null ? +(baseBrl * IOF_RATE).toFixed(6) : null;
  const bankBrl = baseBrl != null ? +(baseBrl * BANK_SPREAD_RATE).toFixed(6) : null;

  return (
    <Section title="Quebra de custo">
      <Field
        label="Custo base (USD)"
        value={costUsd ? usdFmt.format(costUsd) : "—"}
        mono
      />
      <Field
        label="Cotacao USD/BRL (comercial)"
        value={
          commercialRate != null ? (
            <span className="font-mono tabular-nums">
              {commercialRate.toFixed(4)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
      />
      <Field
        label="Conversao base"
        value={
          baseBrl != null ? (
            <span className="font-mono tabular-nums">
              {brlFmt.format(baseBrl)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
      />
      <Field
        label={`IOF (${percentFmt.format(IOF_RATE)})`}
        value={
          iofBrl != null ? (
            <span className="font-mono tabular-nums">
              + {brlFmt.format(iofBrl)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
      />
      <Field
        label={`Spread bancario (${percentFmt.format(BANK_SPREAD_RATE)})`}
        value={
          bankBrl != null ? (
            <span className="font-mono tabular-nums">
              + {brlFmt.format(bankBrl)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
      />
      <Field
        label="Custo final (BRL)"
        value={
          row.costBrl != null ? (
            <span className="flex flex-col gap-0.5">
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {brlFmt.format(row.costBrl)}
              </span>
              {row.rateStale ? (
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  cotacao desatualizada
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
      />
    </Section>
  );
}

function ErrorSection({ message }: { message: string }) {
  return (
    <section
      role="alert"
      className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive"
    >
      <h5 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
        <AlertTriangle className="h-3 w-3" aria-hidden />
        Erro
      </h5>
      <p className="break-words font-mono text-xs">{message}</p>
    </section>
  );
}
