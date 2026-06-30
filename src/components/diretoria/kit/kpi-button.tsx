"use client";

// KPI-card clicável , bloco premium do KIT da Diretoria. Diferente do KPICard
// estático: este pode ser um BOTÃO que filtra a tela (estado `selecionado` com
// realce de borda/anel violeta). Densidade BI: padding contido, número grande
// tabular, ícone em pílula com tom semântico. Hover suave (150ms), cursor e foco
// acessíveis. Quando `onClick` não é passado, vira um card de leitura.

import type { LucideIcon } from "lucide-react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

export type KpiTone = "default" | "success" | "danger" | "warning" | "info";

const iconColor: Record<KpiTone, string> = {
  default: "text-violet-400",
  success: "text-emerald-400",
  danger: "text-rose-400",
  warning: "text-amber-400",
  info: "text-sky-400",
};

const iconBg: Record<KpiTone, string> = {
  default: "bg-violet-600/10",
  success: "bg-emerald-500/10",
  danger: "bg-rose-500/10",
  warning: "bg-amber-500/10",
  info: "bg-sky-500/10",
};

// Anel/realce quando selecionado, por tom.
const selectedRing: Record<KpiTone, string> = {
  default: "border-violet-500/60 bg-violet-600/10 ring-1 ring-violet-500/40",
  success: "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40",
  danger: "border-rose-500/60 bg-rose-500/10 ring-1 ring-rose-500/40",
  warning: "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/40",
  info: "border-sky-500/60 bg-sky-500/10 ring-1 ring-sky-500/40",
};

interface KpiButtonProps {
  rotulo: string;
  /** Valor já formatado (BRL/número/texto), abreviado quando grande. */
  valor: string;
  /** Valor por extenso (cheio) exibido no hover/title do número. */
  valorCompleto?: string;
  icone?: LucideIcon;
  tone?: KpiTone;
  /** Texto auxiliar abaixo do valor. */
  hint?: string;
  /** Quando presente, o card vira botão clicável (filtro). */
  onClick?: () => void;
  /** Estado de seleção (realce). Só faz sentido com `onClick`. */
  selecionado?: boolean;
  /** Série para mini-gráfico (sparkline) no rodapé do card. */
  sparkline?: number[];
  className?: string;
}

export function KpiButton({
  rotulo,
  valor,
  valorCompleto,
  icone: Icon = Activity,
  tone = "default",
  hint,
  onClick,
  selecionado = false,
  sparkline,
  className,
}: KpiButtonProps) {
  const clicavel = typeof onClick === "function";
  const temSpark = Array.isArray(sparkline) && sparkline.length >= 2;

  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2.5">
        <p className="min-w-0 text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
          {rotulo}
        </p>
        <span
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            iconBg[tone],
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", iconColor[tone])} aria-hidden />
        </span>
      </div>
      {/* Tooltip instantâneo (CSS group-hover, sem o atraso de 1-2s do title nativo). */}
      <div className="group/val relative mt-2.5 w-fit max-w-full">
        <div className="truncate text-2xl font-bold leading-none tracking-tight tabular-nums">
          {valor}
        </div>
        {valorCompleto && valorCompleto !== valor ? (
          <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-semibold tabular-nums text-popover-foreground opacity-0 shadow-lg transition-opacity duration-100 group-hover/val:opacity-100">
            {valorCompleto}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {temSpark ? (
        <Sparkline data={sparkline!} className={cn("mt-2", iconColor[tone])} />
      ) : null}
    </>
  );

  const base =
    "rounded-xl border bg-muted/30 p-4 text-left transition-all duration-150";

  if (!clicavel) {
    return (
      <div className={cn(base, "border-border", className)}>{conteudo}</div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecionado}
      className={cn(
        base,
        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selecionado
          ? selectedRing[tone]
          : "border-border hover:border-foreground/25 hover:bg-muted/50",
        className,
      )}
    >
      {conteudo}
    </button>
  );
}
