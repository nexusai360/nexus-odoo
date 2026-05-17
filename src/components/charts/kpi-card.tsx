import type { LucideIcon } from "lucide-react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChartPreparing, ChartEmpty, ChartError } from "./chart-states";

export type NumberFormat = "inteiro" | "decimal" | "moeda";
export type ChartState = "ok" | "preparando" | "vazio" | "erro";

/**
 * Formata um número no padrão pt-BR conforme o formato pedido.
 *
 * `decimal` e `moeda` usam `minimumFractionDigits: 0` — casas decimais só
 * aparecem quando o valor realmente as tem. Inteiros nunca exibem ",00".
 */
export function formatNumber(valor: number, formato: NumberFormat): string {
  if (!Number.isFinite(valor)) return "—";
  if (formato === "moeda") {
    // Centavos só aparecem quando o valor realmente os tem — valores
    // redondos saem como "R$ 1.234", nunca "R$ 1.234,00".
    const temCentavos = Math.round(valor * 100) % 100 !== 0;
    return valor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: temCentavos ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }
  if (formato === "decimal") {
    return valor.toLocaleString("pt-BR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export type KpiTone = "default" | "success" | "danger" | "warning";

const toneIconColor: Record<KpiTone, string> = {
  default: "text-violet-400",
  success: "text-emerald-400",
  danger: "text-red-400",
  warning: "text-amber-400",
};

const toneBgColor: Record<KpiTone, string> = {
  default: "bg-violet-600/10",
  success: "bg-emerald-500/10",
  danger: "bg-red-500/10",
  warning: "bg-amber-500/10",
};

interface KPICardProps {
  valor: number;
  rotulo: string;
  formato: NumberFormat;
  estado?: ChartState;
  onRetry?: () => void;
  /** Ícone semântico exibido no canto — default `Activity`. */
  icone?: LucideIcon;
  tone?: KpiTone;
  /** Texto auxiliar abaixo do valor. */
  hint?: string;
}

/**
 * Cartão de indicador — número único com rótulo, ícone e tom semântico.
 * Visual alinhado ao projeto irmão `nexus-insights` (rounded-2xl, ícone em
 * pílula, hover de borda).
 */
export function KPICard({
  valor,
  rotulo,
  formato,
  estado = "ok",
  onRetry,
  icone: Icon = Activity,
  tone = "default",
  hint,
}: KPICardProps) {
  if (estado === "preparando") return <ChartPreparing />;
  if (estado === "vazio") return <ChartEmpty />;
  if (estado === "erro") {
    return (
      <ChartError
        message="Erro ao carregar o indicador."
        onRetry={onRetry ?? (() => {})}
      />
    );
  }
  return (
    <div className="group relative min-h-[128px] rounded-2xl border border-border bg-muted/30 p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {rotulo}
          </p>
          <div className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
            {formatNumber(valor, formato)}
          </div>
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            toneBgColor[tone],
          )}
        >
          <Icon className={cn("h-5 w-5", toneIconColor[tone])} aria-hidden />
        </div>
      </div>
    </div>
  );
}
