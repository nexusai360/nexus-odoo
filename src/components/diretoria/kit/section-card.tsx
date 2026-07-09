// Card de seção premium do KIT da Diretoria. Header denso (ícone + título +
// subtítulo + slot de ação à direita) e corpo. Densidade BI: borda sutil, fundo
// de card translúcido, cantos 2xl, padding contido. Server-safe (sem "use
// client") para poder compor tanto em server quanto client components.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Conteúdo à direita do header (filtros, busca, botão). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Classe extra do corpo (ex.: remover padding para tabelas full-bleed). */
  bodyClassName?: string;
}

export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-border/70 bg-card/50",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600/10">
              <Icon className="h-4 w-4 text-violet-400" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">{title}</h2>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
