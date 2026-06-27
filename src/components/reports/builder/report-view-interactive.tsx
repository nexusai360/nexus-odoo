"use client";

// src/components/reports/builder/report-view-interactive.tsx
// F6 , Casca interativa da view do relatorio: barra de filtros (ReportFilterBar,
// a MESMA do preview do construtor) + ReportRenderer. Os filtros disponiveis sao
// derivados dos FATOS usados nas secoes; ao mudar, re-resolve no servidor e
// re-renderiza. Reusa ReportFilterBar para nao duplicar a barra (DRY).
import * as React from "react";
import { cn } from "@/lib/utils";
import { ReportRenderer } from "./report-renderer";
import { ReportFilterBar, filtrosDisponiveis, type FiltrosUi } from "./report-filter-bar";
import {
  resolverRelatorioComFiltros,
  listarDimensoesFiltro,
  type FiltrosRuntime,
} from "@/lib/actions/relatorio-filtros";
import { dimensoesDisponiveis, type DimensoesFiltro } from "@/lib/reports/builder/dimensoes-filtro";
import type { BuilderReportEntry } from "@/lib/reports/builder/types";
import type { SecaoResolvida } from "@/lib/reports/builder/resolve-source";

interface Props {
  savedId: string;
  entry: BuilderReportEntry;
  dadosIniciais: Record<string, SecaoResolvida>;
}

const FILTROS_ZERADOS: FiltrosUi = { marca: "", faixaDias: 0, sentido: "", armazemId: 0, familiaId: 0 };

/** Converte os filtros da UI para o shape de runtime do servidor (so nao-vazios). */
function paraRuntime(f: FiltrosUi): FiltrosRuntime {
  return {
    marca: f.marca.trim() || undefined,
    faixaDias: f.faixaDias > 0 ? f.faixaDias : undefined,
    sentido: f.sentido || undefined,
    armazemId: f.armazemId > 0 ? f.armazemId : undefined,
    familiaId: f.familiaId > 0 ? f.familiaId : undefined,
  };
}

export function ReportViewInteractive({ savedId, entry, dadosIniciais }: Props) {
  const fatos = React.useMemo(() => entry.secoes.map((s) => s.fato), [entry]);
  const temFiltros = React.useMemo(() => filtrosDisponiveis(fatos).algum, [fatos]);
  const dim = React.useMemo(() => dimensoesDisponiveis(fatos), [fatos]);
  const usaDimensoes = dim.armazem || dim.familia;

  const [dados, setDados] = React.useState(dadosIniciais);
  const [filtros, setFiltros] = React.useState<FiltrosUi>(FILTROS_ZERADOS);
  const [opcoes, setOpcoes] = React.useState<DimensoesFiltro>({ armazens: [], familias: [] });
  const [carregando, setCarregando] = React.useState(false);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const primeiro = React.useRef(true);

  // Carrega as opcoes de armazem/familia (id+nome) uma vez, se a ficha as usa.
  React.useEffect(() => {
    if (!usaDimensoes) return;
    let vivo = true;
    void (async () => {
      const o = await listarDimensoesFiltro();
      if (vivo) setOpcoes(o);
    })();
    return () => {
      vivo = false;
    };
  }, [usaDimensoes]);

  // Re-resolve quando qualquer filtro muda (debounce; nao dispara na montagem).
  React.useEffect(() => {
    if (!temFiltros) return;
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCarregando(true);
      void (async () => {
        const r = await resolverRelatorioComFiltros(savedId, paraRuntime(filtros));
        if (r.ok) setDados(r.dados);
        setCarregando(false);
      })();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filtros, temFiltros, savedId]);

  return (
    <div className="flex flex-col gap-4">
      {temFiltros ? (
        <ReportFilterBar
          fatos={fatos}
          valor={filtros}
          onChange={setFiltros}
          opcoes={opcoes}
          carregando={carregando}
        />
      ) : null}

      <div className={cn(carregando && "opacity-60 transition-opacity")}>
        <ReportRenderer entry={entry} dados={dados} />
      </div>
    </div>
  );
}
