// src/app/(protected)/relatorios/relatorios-meus.tsx
// F3 , Secao "Meus relatorios": lista os rascunhos do usuario (SavedReport) como
// cards que abrem a rota dinamica, e oferece o atalho "Novo relatorio" para o
// construtor (so para quem pode construir: admin/super_admin).
import Link from "next/link";
import { FileBarChart, Plus } from "lucide-react";

export interface RelatorioMeuItem {
  id: string;
  titulo: string;
  atualizadoEm: string;
}

interface RelatoriosMeusProps {
  itens: RelatorioMeuItem[];
  podeConstruir: boolean;
}

function formatarData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function RelatoriosMeus({ itens, podeConstruir }: RelatoriosMeusProps) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Meus relatorios</h2>
          <p className="text-sm text-muted-foreground">
            Relatorios que voce montou no construtor.
          </p>
        </div>
        {podeConstruir ? (
          <Link
            href="/relatorios-2/construtor"
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:outline-none"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Novo relatorio
          </Link>
        ) : null}
      </div>

      {itens.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
          <FileBarChart className="mx-auto h-9 w-9 text-muted-foreground/50" aria-hidden />
          <p className="mt-2 text-sm text-muted-foreground">
            Voce ainda nao criou relatorios.
            {podeConstruir ? " Use o construtor para montar o primeiro." : ""}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((it) => (
            <Link
              key={it.id}
              href={`/relatorios-2/d/${it.id}`}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-colors hover:border-violet-500/50 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:outline-none"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-violet-500">
                <FileBarChart className="h-5 w-5" aria-hidden />
              </div>
              <span className="line-clamp-2 text-sm font-medium text-foreground">
                {it.titulo}
              </span>
              <span className="text-xs text-muted-foreground">
                Atualizado em {formatarData(it.atualizadoEm)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
