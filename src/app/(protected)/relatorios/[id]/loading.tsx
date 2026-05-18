import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartSkeleton } from "@/components/charts/chart-states";

/** Esqueleto de carregamento da página de um relatório. */
export default function Loading() {
  return (
    <PageShell variant="narrow">
      <Skeleton className="h-4 w-32" />
      <div className="mt-2 flex flex-col gap-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="mt-6 flex flex-col gap-6">
        {[0, 1].map((s) => (
          <ChartSkeleton key={s} />
        ))}
      </div>
    </PageShell>
  );
}
