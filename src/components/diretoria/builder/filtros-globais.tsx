"use client";

// Barra de filtros GLOBAIS do construtor (genérica). Recebe DIMENSÕES dinâmicas
// (família/marca/local em estoque; UF/marca em vendas; etc) e cruza todos os
// componentes ao mesmo tempo. Tags clicáveis dos filtros ativos + limpar, padrão
// Router. ui-ux-pro-max: data-dense, dark+violeta, foco acessível.

import { Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DimensaoFiltro {
  /** Chave no objeto de filtros (ex.: "familia"). */
  chave: string;
  /** Rótulo exibido (ex.: "Família"). */
  rotulo: string;
  /** Valores possíveis. */
  opcoes: string[];
}

export type ValoresFiltro = Record<string, string | null>;

function Dropdown({
  dim,
  valor,
  onChange,
}: {
  dim: DimensaoFiltro;
  valor: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{dim.rotulo}</span>
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
        {dim.opcoes.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export function FiltrosGlobais({
  dimensoes,
  filtros,
  onChange,
  contagem,
}: {
  dimensoes: DimensaoFiltro[];
  filtros: ValoresFiltro;
  onChange: (f: ValoresFiltro) => void;
  /** Resumo do efeito: ex. "312 de 1.894 modelos". */
  contagem?: string;
}) {
  const set = (chave: string, v: string | null) => onChange({ ...filtros, [chave]: v });
  const chips = dimensoes.filter((d) => filtros[d.chave] != null);
  const rotuloDe = (chave: string) => dimensoes.find((d) => d.chave === chave)?.rotulo ?? chave;

  function limparTudo() {
    const vazio: ValoresFiltro = {};
    for (const d of dimensoes) vazio[d.chave] = null;
    onChange(vazio);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
          <Filter className="h-3.5 w-3.5 text-violet-300" /> Filtros globais
        </span>
        {dimensoes.map((d) => (
          <Dropdown key={d.chave} dim={d} valor={filtros[d.chave] ?? null} onChange={(v) => set(d.chave, v)} />
        ))}
        {contagem ? <span className="ml-auto text-xs tabular-nums text-muted-foreground">{contagem}</span> : null}
      </div>

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
          {chips.map((d) => (
            <button
              key={d.chave}
              type="button"
              onClick={() => set(d.chave, null)}
              className="inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-600/15 px-2.5 py-1 text-xs text-violet-100 hover:bg-violet-600/25"
            >
              <span className="text-violet-300/80">{rotuloDe(d.chave)}:</span> {filtros[d.chave]}
              <X className="h-3 w-3" aria-label={`Remover filtro de ${rotuloDe(d.chave)}`} />
            </button>
          ))}
          <button
            type="button"
            onClick={limparTudo}
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Limpar tudo
          </button>
        </div>
      ) : null}
    </div>
  );
}
