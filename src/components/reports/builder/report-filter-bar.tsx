"use client";

// src/components/reports/builder/report-filter-bar.tsx
// F6 , Barra de filtros do relatorio com os MESMOS controles do Consumo do
// Agente Nex: CustomSelect (select list polido) para as dimensoes e um campo de
// busca para a marca. Reusada na view e no preview do construtor.
import { Filter, Loader2, Tag, Clock, ArrowLeftRight, Warehouse, Boxes } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";
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

const TRIGGER = "h-8 min-h-[34px] text-sm";

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
        <CustomSelect
          value={String(valor.armazemId)}
          onChange={(v) => onChange({ ...valor, armazemId: Number(v) })}
          icon={<Warehouse className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          triggerClassName={`${TRIGGER} w-[180px]`}
          aria-label="Filtrar por armazem"
          options={[
            { value: "0", label: "Todos os armazens" },
            ...opcoes.armazens.map((a) => ({ value: String(a.id), label: a.nome })),
          ]}
        />
      ) : null}

      {disp.familia && opcoes.familias.length > 0 ? (
        <CustomSelect
          value={String(valor.familiaId)}
          onChange={(v) => onChange({ ...valor, familiaId: Number(v) })}
          icon={<Boxes className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          triggerClassName={`${TRIGGER} w-[170px]`}
          aria-label="Filtrar por familia"
          options={[
            { value: "0", label: "Todas as familias" },
            ...opcoes.familias.map((f) => ({ value: String(f.id), label: f.nome })),
          ]}
        />
      ) : null}

      {disp.faixa ? (
        <CustomSelect
          value={String(valor.faixaDias)}
          onChange={(v) => onChange({ ...valor, faixaDias: Number(v) })}
          icon={<Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          triggerClassName={`${TRIGGER} w-[160px]`}
          aria-label="Filtrar por dias parado"
          options={FAIXAS.map((f) => ({ value: String(f.value), label: f.label }))}
        />
      ) : null}

      {disp.sentido ? (
        <CustomSelect
          value={valor.sentido}
          onChange={(v) => onChange({ ...valor, sentido: v })}
          icon={<ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          triggerClassName={`${TRIGGER} w-[170px]`}
          aria-label="Filtrar por sentido"
          options={[
            { value: "", label: "Entradas e saidas" },
            { value: "entrada", label: "So entradas" },
            { value: "saida", label: "So saidas" },
          ]}
        />
      ) : null}

      {carregando ? <Loader2 className="h-4 w-4 animate-spin text-violet-500" aria-label="Atualizando" /> : null}
    </div>
  );
}
