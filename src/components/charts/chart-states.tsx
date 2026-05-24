import type { LucideIcon } from "lucide-react";
import { BarChart3, Clock, TriangleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Esqueleto de carregamento de um gráfico. */
export function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-72 w-full rounded-xl", className)} />;
}

interface StateBoxProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  className?: string;
  iconClassName?: string;
  role?: "status" | "alert";
  children?: React.ReactNode;
}

/**
 * Placeholder padrão dos charts , ícone em pílula + título + dica opcional.
 * Altura fixa (`h-72`) evita layout shift ao alternar estado.
 */
function StateBox({
  icon: Icon,
  title,
  hint,
  className,
  iconClassName,
  role = "status",
  children,
}: StateBoxProps) {
  return (
    <div
      role={role}
      aria-live={role === "status" ? "polite" : "assertive"}
      className={cn(
        "flex h-72 w-full flex-col items-center justify-center gap-3",
        "rounded-xl border border-dashed border-border bg-muted/20",
        "text-center text-muted-foreground",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl bg-muted/50",
          iconClassName,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-sm font-medium text-foreground/80">{title}</p>
        {hint ? <p className="text-xs">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Builder do fato ainda não rodou. */
export function ChartPreparing() {
  return (
    <StateBox
      icon={Clock}
      title="Relatório ainda sendo preparado"
      hint="Os dados aparecem após o próximo ciclo de sincronização."
    />
  );
}

/** Builder rodou, mas não há dado para o filtro atual. */
export function ChartEmpty() {
  return (
    <StateBox
      icon={BarChart3}
      title="Sem dados para exibir"
      hint="Tente ajustar os filtros ou o período selecionado."
    />
  );
}

/** Erro ao carregar o relatório, com ação de repetir. */
export function ChartError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <StateBox
      role="alert"
      icon={TriangleAlert}
      title={message}
      hint="Verifique a conexão e tente novamente."
      iconClassName="bg-destructive/10"
      className="border-destructive/30"
    >
      <Button variant="outline" size="sm" onClick={onRetry}>
        Repetir
      </Button>
    </StateBox>
  );
}
