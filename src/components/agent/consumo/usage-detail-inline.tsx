"use client";

/**
 * UsageDetailInline , drill-down compacto exibido como linha expansivel
 * abaixo da linha clicada na tabela de Historico de chamadas.
 *
 * Layout em duas colunas para aproveitar toda a largura da tabela:
 *   esquerda = Identificacao (IDs)  |  direita = Quebra de custo (calculo)
 * Botao Copiar JSON fica centralizado no header da expansao.
 */

import { AlertTriangle, Clipboard } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  IOF_RATE,
  BANK_SPREAD_RATE,
} from "@/lib/agent/llm/exchange-rate-constants";
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
    <div className="rounded-lg border border-violet-500/20 bg-violet-500/[0.03] px-4 py-3">
      {/* Header so com titulo (o botao Copiar JSON foi para o rodape
          centralizado, fora dos cantos). */}
      <div className="mb-3 border-b border-violet-500/15 pb-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Detalhes da chamada
        </h4>
      </div>

      {/* Layout em 2 colunas: Identificacao | Quebra de custo */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
        <IdentificationBlock row={row} />
        <CostBreakdownBlock row={row} />
      </div>

      {row.promptChars != null || row.responseChars != null ? (
        <div className="mt-3 grid grid-cols-3 items-center border-t border-violet-500/15 pt-2 text-[11px] text-muted-foreground">
          <div className="justify-self-start">
            {row.promptChars != null ? (
              <span className="mr-4">
                prompt:{" "}
                <span className="font-mono text-foreground">
                  {numberFmt.format(row.promptChars)} chars
                </span>
              </span>
            ) : null}
            {row.responseChars != null ? (
              <span>
                resposta:{" "}
                <span className="font-mono text-foreground">
                  {numberFmt.format(row.responseChars)} chars
                </span>
              </span>
            ) : null}
          </div>
          <div className="justify-self-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-7 gap-2 border-violet-500/40 bg-violet-500/[0.06] px-3 text-[11px] text-violet-700 shadow-sm transition-colors hover:bg-violet-500/15 hover:border-violet-500/60 dark:text-violet-300"
            >
              <Clipboard className="h-3 w-3" aria-hidden />
              <span>Copiar JSON</span>
            </Button>
          </div>
          <div aria-hidden />
        </div>
      ) : null}

      {row.errorMessage ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="break-words font-mono text-xs">{row.errorMessage}</span>
        </div>
      ) : null}

    </div>
  );
}

/* ---------------- Identificacao ---------------- */

function IdentificationBlock({ row }: { row: UsageDetailRow }) {
  return (
    <div>
      <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        Identificacao
      </h5>
      <dl className="space-y-1.5">
        <KvRow label="ID da chamada" value={row.id} mono />
        <KvRow
          label="ID da conversa"
          value={row.conversationId}
          mono
          fallback=","
        />
        <KvRow
          label="ID do usuario"
          value={row.userId}
          mono
          fallback=","
        />
      </dl>
    </div>
  );
}

function KvRow({
  label,
  value,
  mono = false,
  fallback,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  fallback?: string;
}) {
  const display = value ?? fallback ?? ",";
  const isDash = display === ",";
  return (
    <div className="flex items-start justify-between gap-3 text-[11px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "truncate text-right text-foreground",
          mono && !isDash && "font-mono tabular-nums",
          isDash && "text-muted-foreground",
        )}
        title={isDash ? undefined : display}
      >
        {display}
      </span>
    </div>
  );
}

/* ---------------- Quebra de custo ---------------- */

function CostBreakdownBlock({ row }: { row: UsageDetailRow }) {
  if (!row.costKnown) {
    return (
      <div>
        <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          Quebra de custo
        </h5>
        <div className="inline-flex w-fit items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          Preco desconhecido , sem catalogo para este modelo
        </div>
      </div>
    );
  }

  // A cotacao gravada na linha (usdToBrlRate) ja vem com encargos aplicados.
  // rate = commercial * (1+BANK_SPREAD) * (1+IOF). Decompomos para mostrar.
  const commercialRate =
    row.usdToBrlRate != null && row.rateSpread != null && row.rateSpread > 0
      ? row.usdToBrlRate / row.rateSpread
      : row.usdToBrlRate ?? null;

  const costUsd = row.costUsd ?? 0;
  // Cascata: USD * PTAX = base; +spread -> base banco; +IOF -> final.
  const subtotalBase =
    commercialRate != null ? +(costUsd * commercialRate).toFixed(6) : null;
  const bankAmount =
    subtotalBase != null ? +(subtotalBase * BANK_SPREAD_RATE).toFixed(6) : null;
  const afterSpread =
    subtotalBase != null && bankAmount != null
      ? +(subtotalBase + bankAmount).toFixed(6)
      : null;
  const iofAmount =
    afterSpread != null ? +(afterSpread * IOF_RATE).toFixed(6) : null;

  return (
    <div>
      <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        Quebra de custo
      </h5>
      <table className="w-full text-[11px] tabular-nums">
        <tbody>
          <CalcRow
            op=""
            label="Custo do modelo (USD)"
            value={costUsd ? usdFmt.format(costUsd) : ","}
          />
          <CalcRow
            op="×"
            label="PTAX venda do dia (USD/BRL)"
            value={commercialRate != null ? brlFmt.format(commercialRate) : ","}
          />
          <CalcRow
            op="="
            label="Subtotal (BRL)"
            value={subtotalBase != null ? brlFmt.format(subtotalBase) : ","}
            divider
          />
          <CalcRow
            op="+"
            label={`Spread bancario (${percentFmt.format(BANK_SPREAD_RATE)})`}
            value={bankAmount != null ? brlFmt.format(bankAmount) : ","}
          />
          <CalcRow
            op="="
            label="Base do banco (BRL)"
            value={afterSpread != null ? brlFmt.format(afterSpread) : ","}
            divider
          />
          <CalcRow
            op="+"
            label={`IOF (${percentFmt.format(IOF_RATE)})`}
            value={iofAmount != null ? brlFmt.format(iofAmount) : ","}
          />
          <CalcRow
            op="="
            label="Custo final (BRL)"
            value={row.costBrl != null ? brlFmt.format(row.costBrl) : ","}
            total
          />
        </tbody>
      </table>
      {row.rateStale ? (
        <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
          cotacao desatualizada
        </p>
      ) : null}
    </div>
  );
}

function CalcRow({
  op,
  label,
  value,
  divider = false,
  total = false,
}: {
  op: string;
  label: string;
  value: string;
  divider?: boolean;
  total?: boolean;
}) {
  return (
    <tr
      className={cn(
        divider && "border-t border-violet-500/15",
        total && "border-t border-violet-500/30",
      )}
    >
      <td
        className={cn(
          "w-4 py-1 text-center text-muted-foreground/70",
          total && "font-semibold text-violet-600 dark:text-violet-300",
        )}
      >
        {op}
      </td>
      <td
        className={cn(
          "py-1 pr-3 text-muted-foreground",
          total && "font-semibold text-foreground",
        )}
      >
        {label}
      </td>
      <td
        className={cn(
          "py-1 text-right font-mono",
          total && "font-semibold text-foreground",
        )}
      >
        {value}
      </td>
    </tr>
  );
}
