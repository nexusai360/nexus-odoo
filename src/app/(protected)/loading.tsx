import { PageShell } from "@/components/layout/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de carregamento padrao de QUALQUER rota protegida que nao tenha o
 * seu proprio loading.tsx (configuracoes, usuarios, integracoes, perfil...).
 * Sem ele, a navegacao entre menus "trava" esperando o Server Component resolver
 * (RSC com queries), sem feedback , o usuario clica e nada acontece por 2-3s.
 * Com este fallback, a troca de tela e instantanea (skeleton imediato) enquanto
 * os dados carregam por baixo.
 */
export default function Loading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="mt-8 flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((c) => (
            <Skeleton key={c} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-px w-full" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((r) => (
            <Skeleton key={r} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
