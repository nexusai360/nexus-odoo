import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Esqueleto de carregamento de um gráfico. */
export function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-64 w-full", className)} />;
}

function StateBox({
  children, className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-64 flex-col items-center justify-center gap-2 rounded-xl",
        "ring-1 ring-foreground/10 text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Builder do fato ainda não rodou. */
export function ChartPreparing() {
  return <StateBox>Relatório ainda sendo preparado.</StateBox>;
}

/** Builder rodou, mas não há dado para o filtro atual. */
export function ChartEmpty() {
  return <StateBox>Sem dado no período.</StateBox>;
}

/** Erro ao carregar o relatório, com ação de repetir. */
export function ChartError({
  message, onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <StateBox className="text-destructive">
      <span>{message}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Repetir
      </Button>
    </StateBox>
  );
}
