"use client";

// Barra de filtros GLOBAIS do construtor (Onda 2). Dropdowns por dimensão
// (família/marca/local) que cruzam TODOS os componentes de estoque ao mesmo
// tempo (via derivar-estoque). Tags clicáveis dos filtros ativos + limpar,
// padrão Router/Consumo. ui-ux-pro-max: data-dense, dark+violeta, foco acessível.

import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FiltrosEstoque } from "@/lib/diretoria/derivar-estoque";

type Dim = keyof FiltrosEstoque;

const ROTULO_DIM: Record<Dim, string> = { familia: "Família", marca: "Marca", local: "Local" };

function Dropdown({
  dim,
  opcoes,
  valor,
  onChange,
}: {
  dim: Dim;
  opcoes: string[];
  valor: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{ROTULO_DIM[dim]}</span>
      <select
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(
          "min-w-[7rem] max-w-[12rem] cursor-pointer rounded-lg border bg-muted/30 px-2.5 py-1.5 text-xs text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          valor ? "border-violet-500/50 bg-violet-600/10 text-violet-100" : "border-border hover:border-foreground/25",
        )}
      >
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function FiltrosGlobais({
  opcoes,
  filtros,
  onChange,
  ativo,
  contagem,
}: {
  opcoes: { familias: string[]; marcas: string[]; locais: string[] };
  filtros: FiltrosEstoque;
  onChange: (f: FiltrosEstoque) => void;
  ativo: boolean;
  /** Resumo do efeito: ex. "312 de 1.894 modelos". */
  contagem?: string;
}) {
  const set = (dim: Dim, v: string | null) => onChange({ ...filtros, [dim]: v });
  const chips = (Object.keys(filtros) as Dim[]).filter((d) => filtros[d] != null);

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
          <Filter className="h-3.5 w-3.5 text-violet-300" /> Filtros globais
        </span>
        <Dropdown dim="familia" opcoes={opcoes.familias} valor={filtros.familia} onChange={(v) => set("familia", v)} />
        <Dropdown dim="marca" opcoes={opcoes.marcas} valor={filtros.marca} onChange={(v) => set("marca", v)} />
        <Dropdown dim="local" opcoes={opcoes.locais} valor={filtros.local} onChange={(v) => set("local", v)} />
        {ativo && contagem ? (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{contagem}</span>
        ) : null}
      </div>

      {/* Tags clicáveis dos filtros ativos + limpar */}
      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
          {chips.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => set(d, null)}
              className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-600/15 px-2.5 py-1 text-xs text-violet-100 hover:bg-violet-600/25"
            >
              <span className="text-violet-300/80">{ROTULO_DIM[d]}:</span> {filtros[d]}
              <X className="h-3 w-3" aria-label={`Remover filtro de ${ROTULO_DIM[d]}`} />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ familia: null, marca: null, local: null })}
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Limpar tudo
          </button>
        </div>
      ) : null}
    </div>
  );
}
