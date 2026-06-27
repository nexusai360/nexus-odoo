"use client";

// src/components/reports/builder/report-view-interactive.tsx
// F6 , Casca interativa da view do relatorio: barra de filtros (no estilo do
// dashboard de consumo) + ReportRenderer. Os filtros disponiveis sao derivados
// dos FATOS usados nas secoes; ao mudar, re-resolve no servidor e re-renderiza.
import * as React from "react";
import { Filter, Loader2, Tag, Clock, ArrowLeftRight, Warehouse, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportRenderer } from "./report-renderer";
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

const FAIXAS = [
  { label: "Qualquer tempo", value: 0 },
  { label: "30+ dias", value: 30 },
  { label: "60+ dias", value: 60 },
  { label: "90+ dias", value: 90 },
  { label: "180+ dias", value: 180 },
];

export function ReportViewInteractive({ savedId, entry, dadosIniciais }: Props) {
  const fatos = React.useMemo(() => new Set(entry.secoes.map((s) => s.fato)), [entry]);
  const temMarca = fatos.has("fato_estoque_marca");
  const temFaixa = fatos.has("fato_estoque_parados");
  const temSentido = fatos.has("fato_estoque_top_movimentados");
  const dim = React.useMemo(() => dimensoesDisponiveis(fatos), [fatos]);
  const temFiltros = temMarca || temFaixa || temSentido || dim.armazem || dim.familia;

  const [dados, setDados] = React.useState(dadosIniciais);
  const [marca, setMarca] = React.useState("");
  const [faixaDias, setFaixaDias] = React.useState(0);
  const [sentido, setSentido] = React.useState("");
  const [armazemId, setArmazemId] = React.useState(0);
  const [familiaId, setFamiliaId] = React.useState(0);
  const [opcoes, setOpcoes] = React.useState<DimensoesFiltro>({ armazens: [], familias: [] });
  const [carregando, setCarregando] = React.useState(false);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carrega as opcoes de armazem/familia (id+nome) uma vez, se a ficha as usa.
  React.useEffect(() => {
    if (!dim.armazem && !dim.familia) return;
    void (async () => {
      const o = await listarDimensoesFiltro();
      setOpcoes(o);
    })();
  }, [dim.armazem, dim.familia]);

  const aplicar = React.useCallback(
    (f: FiltrosRuntime) => {
      setCarregando(true);
      void (async () => {
        const r = await resolverRelatorioComFiltros(savedId, f);
        if (r.ok) setDados(r.dados);
        setCarregando(false);
      })();
    },
    [savedId],
  );

  // Re-resolve quando qualquer filtro muda (marca com debounce).
  React.useEffect(() => {
    if (!temFiltros) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      aplicar({ marca, faixaDias, sentido, armazemId, familiaId });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marca, faixaDias, sentido, armazemId, familiaId]);

  return (
    <div className="flex flex-col gap-4">
      {temFiltros ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/30 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" aria-hidden />
            Filtros
          </span>

          {temMarca ? (
            <label className="relative flex items-center">
              <Tag className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <input
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder="Marca (ex.: Matrix)"
                aria-label="Filtrar por marca"
                className="h-8 w-44 rounded-lg border border-border bg-background py-1 pr-2.5 pl-8 text-sm text-foreground focus-visible:border-violet-500/60 focus-visible:ring-2 focus-visible:ring-violet-400/30 focus-visible:outline-none"
              />
            </label>
          ) : null}

          {dim.armazem && opcoes.armazens.length > 0 ? (
            <Pill icon={Warehouse}>
              <select
                value={armazemId}
                onChange={(e) => setArmazemId(Number(e.target.value))}
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
            </Pill>
          ) : null}

          {dim.familia && opcoes.familias.length > 0 ? (
            <Pill icon={Boxes}>
              <select
                value={familiaId}
                onChange={(e) => setFamiliaId(Number(e.target.value))}
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
            </Pill>
          ) : null}

          {temFaixa ? (
            <Pill icon={Clock}>
              <select
                value={faixaDias}
                onChange={(e) => setFaixaDias(Number(e.target.value))}
                aria-label="Filtrar por dias parado"
                className="cursor-pointer bg-transparent text-sm text-foreground focus:outline-none"
              >
                {FAIXAS.map((f) => (
                  <option key={f.value} value={f.value} className="bg-card text-foreground">
                    {f.label}
                  </option>
                ))}
              </select>
            </Pill>
          ) : null}

          {temSentido ? (
            <Pill icon={ArrowLeftRight}>
              <select
                value={sentido}
                onChange={(e) => setSentido(e.target.value)}
                aria-label="Filtrar por sentido"
                className="cursor-pointer bg-transparent text-sm text-foreground focus:outline-none"
              >
                <option value="" className="bg-card text-foreground">Entradas e saidas</option>
                <option value="entrada" className="bg-card text-foreground">So entradas</option>
                <option value="saida" className="bg-card text-foreground">So saidas</option>
              </select>
            </Pill>
          ) : null}

          {carregando ? (
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" aria-label="Atualizando" />
          ) : null}
        </div>
      ) : null}

      <div className={cn(carregando && "opacity-60 transition-opacity")}>
        <ReportRenderer entry={entry} dados={dados} />
      </div>
    </div>
  );
}

function Pill({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
  return (
    <span className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      {children}
    </span>
  );
}
