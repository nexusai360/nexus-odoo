import { cn } from "@/lib/utils";

/**
 * Primitivos compartilhados entre os timelines de log: o do Servidor MCP
 * (`logs-timeline.tsx`) e o do Plugar MCP (`external-mcp-logs.tsx`). Apenas
 * helpers puros e neutros de domínio, sem regra de negócio.
 */

/** Data e hora curtas, padrão pt-BR. */
export function formatDatetime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

/** Duração em ms, virando segundos quando passa de 1000. */
export function formatMs(ms: number | null): string {
  if (ms == null) return "-";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms} ms`;
}

/** Verdadeiro para null/undefined, array vazio ou objeto sem chaves. */
export function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/** Bloco de JSON formatado, rolável. */
export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="whitespace-pre-wrap break-all text-xs font-mono bg-muted/50 border border-border rounded-lg p-3 max-h-72 overflow-auto">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Par rótulo + valor numa linha, usado no detalhe de um log. */
export function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <span className={cn("text-xs", mono && "font-mono")}>{value}</span>
    </div>
  );
}
