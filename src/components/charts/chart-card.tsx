import { cn } from "@/lib/utils";

interface ChartCardProps {
  /** Título da seção , opcional. */
  title?: string;
  /** Linha de apoio abaixo do título. */
  subtitle?: string;
  /** Slot à direita do cabeçalho (toggles, ações). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Cartão que envolve um chart/tabela , borda sutil, cantos arredondados e
 * cabeçalho opcional. Padroniza o enquadramento visual de toda seção de
 * relatório, alinhado ao projeto irmão `nexus-insights`.
 */
export function ChartCard({
  title,
  subtitle,
  action,
  className,
  children,
}: ChartCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card/40 p-5",
        className,
      )}
    >
      {title || action ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-sm font-semibold text-foreground">
                {title}
              </h3>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
