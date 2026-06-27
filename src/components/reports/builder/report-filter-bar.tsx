"use client";

// src/components/reports/builder/report-filter-bar.tsx
// F6 , Barra de filtros do relatorio (estilo do dashboard de consumo), derivada
// dos FATOS usados. Reusada na view e no preview do construtor.
import { Filter, Loader2, Tag, Clock, ArrowLeftRight, Warehouse, Boxes } from "lucide-react";
import { dimensoesDisponiveis, type DimensoesFiltro } from "@/lib/reports/builder/dimensoes-filtro";

export interface FiltrosUi {
  marca: string;
  faixaDias: number;
  sentido: string;
  armazemId: number;
  familiaId: number;
}

const FAIXAS = [
  { label: "Qualquer tempo", value: 0 },
  { label: "30+ dias", value: 30 },
  { label: "60+ dias", value: 60 },
  { label: "90+ dias", value: 90 },
  { label: "180+ dias", value: 180 },
];

export function filtrosDisponiveis(fatos: Iterable<string>): {
  marca: boolean;
  faixa: boolean;
  sentido: boolean;
  armazem: boolean;
  familia: boolean;
  algum: boolean;
} {
  const set = new Set(fatos);
  const marca = set.has("fato_estoque_marca");
  const faixa = set.has("fato_estoque_parados");
  const sentido = set.has("fato_estoque_top_movimentados");
  const { armazem, familia } = dimensoesDisponiveis(set);
  return { marca, faixa, sentido, armazem, familia, algum: marca || faixa || sentido || armazem || familia };
}

export function ReportFilterBar({
  fatos,
  valor,
  onChange,
  opcoes = { armazens: [], familias: [] },
  carregando = false,
}: {
  fatos: Iterable<string>;
  valor: FiltrosUi;
  onChange: (v: FiltrosUi) => void;
  /** Opcoes de armazem/familia (id+nome) para os dropdowns. */
  opcoes?: DimensoesFiltro;
  carregando?: boolean;
}) {
  const disp = filtrosDisponiveis(fatos);
  if (!disp.algum) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Filter className="h-3.5 w-3.5" aria-hidden />
        Filtros
      </span>
      {disp.marca ? (
        <label className="relative flex items-center">
          <Tag className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <input
            value={valor.marca}
            onChange={(e) => onChange({ ...valor, marca: e.target.value })}
            placeholder="Marca (ex.: Matrix)"
            aria-label="Filtrar por marca"
            className="h-8 w-44 rounded-lg border border-border bg-background py-1 pr-2.5 pl-8 text-sm text-foreground focus-visible:border-violet-500/60 focus-visible:ring-2 focus-visible:ring-violet-400/30 focus-visible:outline-none"
          />
        </label>
      ) : null}
      {disp.armazem && opcoes.armazens.length > 0 ? (
        <span className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5">
          <Warehouse className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <select
            value={valor.armazemId}
            onChange={(e) => onChange({ ...valor, armazemId: Number(e.target.value) })}
            aria-label="Filtrar por armazem"
            className="cursor-pointer bg-transparent text-sm text-foreground focus:outline-none"
          >
            <option value={0} className="bg-card text-foreground">Todos os armazens</option>
            {opcoes.armazens.map((a) => (
              <option key={a.id} value={a.id} className="bg-card text-foreground">
                {a.nome}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      {disp.familia && opcoes.familias.length > 0 ? (
        <span className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5">
          <Boxes className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <select
            value={valor.familiaId}
            onChange={(e) => onChange({ ...valor, familiaId: Number(e.target.value) })}
            aria-label="Filtrar por familia"
            className="cursor-pointer bg-transparent text-sm text-foreground focus:outline-none"
          >
            <option value={0} className="bg-card text-foreground">Todas as familias</option>
            {opcoes.familias.map((f) => (
              <option key={f.id} value={f.id} className="bg-card text-foreground">
                {f.nome}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      {disp.faixa ? (
        <span className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <select
            value={valor.faixaDias}
            onChange={(e) => onChange({ ...valor, faixaDias: Number(e.target.value) })}
            aria-label="Filtrar por dias parado"
            className="cursor-pointer bg-transparent text-sm text-foreground focus:outline-none"
          >
            {FAIXAS.map((f) => (
              <option key={f.value} value={f.value} className="bg-card text-foreground">
                {f.label}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      {disp.sentido ? (
        <span className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5">
          <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <select
            value={valor.sentido}
            onChange={(e) => onChange({ ...valor, sentido: e.target.value })}
            aria-label="Filtrar por sentido"
            className="cursor-pointer bg-transparent text-sm text-foreground focus:outline-none"
          >
            <option value="" className="bg-card text-foreground">Entradas e saidas</option>
            <option value="entrada" className="bg-card text-foreground">So entradas</option>
            <option value="saida" className="bg-card text-foreground">So saidas</option>
          </select>
        </span>
      ) : null}
      {carregando ? <Loader2 className="h-4 w-4 animate-spin text-violet-500" aria-label="Atualizando" /> : null}
    </div>
  );
}
