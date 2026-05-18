import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de carregamento da lista de relatórios. */
export default function Loading() {
  return (
    <PageShell variant="narrow">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="mt-6 flex flex-col gap-8">
        {[0, 1].map((s) => (
          <section key={s} className="flex flex-col gap-3">
            <Skeleton className="h-4 w-32" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((c) => (
                <Skeleton key={c} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
