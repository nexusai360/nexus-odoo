"use client";

/**
 * UsageDetailSheet — drill-down de uma chamada de LLM em drawer lateral.
 *
 * Clone do `usage-detail-sheet.tsx` do nexus-insights, adaptado ao
 * `UsageDetailRow` V2 do nexus-odoo: badge `preço desconhecido` (costKnown),
 * nota `cotação desatualizada` (rateStale), spread por linha (rateSpread),
 * campos `requestKind` e `conversationId`.
 */

import { AlertTriangle, Clipboard } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetFooter,
  SheetHeader,
} from "@/components/ui/sheet";
import { formatDuration } from "@/lib/agent/llm/format";
import { providerLabel } from "@/lib/agent/llm/provider-labels";
import type { UsageDetailRow } from "@/lib/agent/llm/usage-stats";
import { cn } from "@/lib/utils";

export interface UsageDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: UsageDetailRow | null;
}

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
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const REQUEST_KIND_LABELS: Record<string, string> = {
  texto: "Texto",
  imagem: "Imagem",
  audio: "Áudio",
  arquivo: "Arquivo",
};

function formatDateBr(iso: string): string {
  try {
    return dateFmt.format(new Date(iso));
  } catch {
    return iso;
  }
}

function isWhisperModel(model: string): boolean {
  return /whisper/i.test(model);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
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
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-sm text-foreground",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function UsageDetailSheet({
  open,
  onOpenChange,
  row,
}: UsageDetailSheetProps) {
  const handleCopy = useCallback(async () => {
    if (!row) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
      toast.success("JSON copiado para a área de transferência");
    } catch (err) {
      console.warn("[usage-detail-sheet] clipboard error:", err);
      toast.error("Não foi possível copiar o JSON");
    }
  }, [row]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} width={520}>
      {row ? (
        <>
          <SheetHeader onClose={handleClose}>Detalhes da chamada</SheetHeader>
          <SheetBody className="space-y-6 px-5 py-5">
            <IdentificationSection row={row} />
            <TokensSection row={row} />
            <DurationSection row={row} />
            <CostSection row={row} />
            {row.errorMessage ? (
              <ErrorSection message={row.errorMessage} />
            ) : null}
          </SheetBody>
          <SheetFooter className="justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
            >
              <Clipboard aria-hidden />
              Copiar JSON
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleClose}
            >
              Fechar
            </Button>
          </SheetFooter>
        </>
      ) : null}
    </Sheet>
  );
}

function IdentificationSection({ row }: { row: UsageDetailRow }) {
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <Section title="Identificação">
      <Field label="ID" value={row.id} mono className="sm:col-span-2" />
      <Field label="Data / hora (BRT)" value={formatDateBr(row.createdAt)} />
      <Field label="Origem" value={row.isPlayground ? "Playground" : "Agente Nex"} />
      <Field label="Provider" value={providerLabel(row.provider)} />
      <Field
        label="Modelo"
        value={<span className="font-mono">{row.model}</span>}
      />
      <Field
        label="Tipo"
        value={REQUEST_KIND_LABELS[row.requestKind] ?? "Texto"}
      />
      <Field
        label="Conversa"
        value={
          row.conversationId ? (
            <span className="font-mono">{row.conversationId}</span>
          ) : (
            dash
          )
        }
      />
      <Field
        label="Usuário"
        value={
          row.userId ? <span className="font-mono">{row.userId}</span> : dash
        }
        className="sm:col-span-2"
      />
    </Section>
  );
}

function TokensSection({ row }: { row: UsageDetailRow }) {
  const isWhisper = isWhisperModel(row.model);
  const dash = <span className="text-muted-foreground">—</span>;
  return (
    <Section title="Tokens">
      <Field
        label="Entrada"
        value={isWhisper ? dash : numberFmt.format(row.tokensInput)}
        mono={!isWhisper}
      />
      <Field
        label="Saída"
        value={isWhisper ? dash : numberFmt.format(row.tokensOutput)}
        mono={!isWhisper}
      />
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
      {isWhisper ? (
        <p className="col-span-full text-xs italic text-muted-foreground">
          Modelos Whisper (transcrição de áudio) são cobrados por minuto, não
          por tokens. Os campos de token não se aplicam a essas chamadas.
        </p>
      ) : null}
    </Section>
  );
}

function DurationSection({ row }: { row: UsageDetailRow }) {
  return (
    <Section title="Duração">
      <Field
        label="Tempo total"
        value={
          row.durationMs == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            formatDuration(row.durationMs)
          )
        }
        mono={row.durationMs != null}
      />
    </Section>
  );
}

function CostSection({ row }: { row: UsageDetailRow }) {
  const hasRate = row.usdToBrlRate != null;
  const hasSpread = row.rateSpread != null;

  return (
    <Section title="Custo">
      <Field
        label="Custo bruto (USD)"
        value={
          !row.costKnown ? (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              preço desconhecido
            </span>
          ) : row.costUsd != null ? (
            usdFmt.format(row.costUsd)
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        mono={row.costKnown && row.costUsd != null}
      />
      <Field
        label={
          <span
            className="cursor-help underline underline-offset-2 decoration-dotted decoration-muted-foreground/40"
            title="Cotação USD/BRL gravada no momento da chamada."
          >
            Cotação aplicada (USD→BRL)
          </span>
        }
        value={
          hasRate ? (
            <span className="font-mono tabular-nums">
              {(row.usdToBrlRate as number).toFixed(4)}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Cotação não armazenada
            </span>
          )
        }
      />
      <Field
        label="Spread aplicado"
        value={
          hasSpread ? (
            <span className="font-mono tabular-nums">
              {((row.rateSpread as number) * 100).toFixed(2)}%
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
      />
      <Field
        label="Custo final (BRL)"
        value={
          !row.costKnown ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className="flex flex-col gap-0.5">
              <span className="font-mono tabular-nums">
                {row.costBrl != null ? brlFmt.format(row.costBrl) : "—"}
              </span>
              {row.rateStale ? (
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  cotação desatualizada
                </span>
              ) : null}
            </span>
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
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Erro
      </h3>
      <p className="break-words font-mono text-sm">{message}</p>
    </section>
  );
}
