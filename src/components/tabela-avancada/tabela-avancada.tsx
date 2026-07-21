"use client";

/**
 * TabelaAvancada , tabela de dados rica GENÉRICA, portada do ERP Nexus
 * (vendas-lista.tsx) e adaptada para receber um catálogo de domínio via props.
 * Uma coleção, N lentes: Lista, Kanban, Calendário. Searchbar que cresce por
 * chips (filtro=violeta, agrupar=verde) com busca inteligente por facets, painel
 * "Filtros e agrupar" (presets | agrupar multinível | favoritos), filtro
 * personalizado E/OU aninhado, agrupamento com subtotais, multi-sort, seletor +
 * reordenação + redimensionamento de colunas, paginação, compacto, exportar CSV.
 * Client-side sobre a base já carregada. Persistência por tela (localStorage).
 */

import { useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import {
  Download, SlidersHorizontal, Layers, Star, Search, X, ChevronDown,
  ChevronRight, List, Columns3, CalendarDays, Trash2, Check, ArrowUp,
  ArrowDown, ArrowUpDown, Rows3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover, Tooltip, Modal, Btn, SeletorColunas, Paginacao,
  useResizeColunas, ResizeHandle,
} from "./ui";
import { FiltroAvancado, type CampoUI } from "./filtro-avancado";
import { KanbanView, CalendarioView } from "./visoes";
import { testaNo, type GrupoRegras, type CampoLike } from "./motor-filtro";
import type { ColunaDef, CampoDef } from "./tipos";

type View = "lista" | "kanban" | "calendario";

/** Facet serializável (predicado derivado de kind/campo/valor). */
export interface Chip { id: string; campo: string; kind: string; valor: string; label: string }
interface Nivel { campo: string; label: string }
interface Sort { campo: string; dir: "asc" | "desc" }
interface Favorito {
  id: string;
  nome: string;
  snap: { chips: Chip[]; niveis: Nivel[]; busca: string; vis: string[]; ordem: string[]; sorts: Sort[]; arvore: GrupoRegras | null };
}
export interface PresetFiltro { id: string; label: string; campo: string; valor: string }

export interface TabelaAvancadaProps<T extends Record<string, unknown>> {
  base: T[];
  colunas: ColunaDef<T>[];
  colunaByKey: Record<string, ColunaDef<T>>;
  campos: CampoDef<T>[];
  campoByKey: Record<string, CampoDef<T>>;
  agrupamentos: { campo: string; label: string }[];
  celula: (row: T, key: string) => React.ReactNode;
  /** id estável de linha (default: índice na base). */
  rowKey?: (row: T, i: number) => string;
  /** valor somado nos subtotais/rodapé (ex.: valor a atender). */
  valorSoma?: (row: T) => number;
  /** coluna cujo valor soma aparece no rodapé/subtotal (ex.: "vlrVenda"). */
  colunaSoma?: string;
  storageKey: string;
  exportFilename: string;
  labelRegistro?: string;
  presets?: PresetFiltro[];
  /** campo agrupador do Kanban (ex.: "etapa"). */
  kanbanCampo?: string;
  /** campo data do Calendário (ex.: "prevista"). */
  calendarioCampo?: string;
  /** título do item no card do kanban / calendário. */
  tituloItem?: (row: T) => string;
  subtituloItem?: (row: T) => string;
  valorItem?: (row: T) => string;
}

const VIEWS: { key: View; label: string; icon: typeof List }[] = [
  { key: "lista", label: "Lista", icon: List },
  { key: "kanban", label: "Kanban", icon: Columns3 },
  { key: "calendario", label: "Calendário", icon: CalendarDays },
];

let favSeq = 0;

export function TabelaAvancada<T extends Record<string, unknown>>({
  base,
  colunas,
  colunaByKey,
  campos,
  campoByKey,
  agrupamentos,
  celula,
  rowKey = (_r, i) => String(i),
  valorSoma,
  colunaSoma,
  storageKey,
  exportFilename,
  labelRegistro = "registros",
  presets = [],
  kanbanCampo,
  calendarioCampo,
  tituloItem,
  subtituloItem,
  valorItem,
}: TabelaAvancadaProps<T>) {
  const [busca, setBusca] = useState("");
  const [chips, setChips] = useState<Chip[]>([]);
  const [niveis, setNiveis] = useState<Nivel[]>([]);
  const [arvore, setArvore] = useState<GrupoRegras | null>(null);
  const [view, setView] = useState<View>("lista");
  const [sorts, setSorts] = useState<Sort[]>([]);
  const [ordem, setOrdem] = useState<string[]>(colunas.map((c) => c.key));
  const [vis, setVis] = useState<string[]>(colunas.filter((c) => c.padrao).map((c) => c.key));
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(50);
  const [compacto, setCompacto] = useState(false);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [avancadoOpen, setAvancadoOpen] = useState(false);
  const [salvarOpen, setSalvarOpen] = useState(false);
  const [nomeFav, setNomeFav] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [sugOpen, setSugOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const campoByLike = campoByKey as unknown as Record<string, CampoLike>;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ===== Persistência (por tela) =====
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.vis)) setVis(s.vis);
        if (Array.isArray(s.ordem)) setOrdem(s.ordem);
        if (Array.isArray(s.sorts)) setSorts(s.sorts);
        if (Array.isArray(s.niveis)) setNiveis(s.niveis);
        if (Array.isArray(s.chips)) setChips(s.chips);
        if (s.view) setView(s.view);
        if (typeof s.busca === "string") setBusca(s.busca);
        if (typeof s.porPagina === "number") setPorPagina(s.porPagina);
        if (typeof s.compacto === "boolean") setCompacto(s.compacto);
        if (s.arvore) setArvore(s.arvore);
        if (Array.isArray(s.favoritos)) setFavoritos(s.favoritos);
      }
    } catch { /* ignore */ }
    setHidratado(true);
  }, [storageKey]);
  useEffect(() => {
    if (!hidratado) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ ordem, vis, sorts, niveis, chips, view, busca, porPagina, compacto, arvore, favoritos }));
    } catch { /* ignore */ }
  }, [hidratado, storageKey, ordem, vis, sorts, niveis, chips, view, busca, porPagina, compacto, arvore, favoritos]);

  // ===== Busca inteligente (facets das colunas de texto visíveis) =====
  const sugestoes = useMemo(() => {
    const q = busca.trim();
    if (!q) return [] as Chip[];
    const ql = q.toLowerCase();
    const visiveisCols = colunas.filter((c) => vis.includes(c.key));
    const out: Chip[] = [{ id: `s-txt-${q}`, campo: "texto", kind: "texto", valor: q, label: `Contém "${q}"` }];
    visiveisCols
      .filter((c) => (c.tipo === "texto" || c.tipo === "tagCor"))
      .forEach((col) => {
        [...new Set(base.map((r) => String(col.valor(r))).filter((v) => v && v !== "-"))]
          .filter((v) => v.toLowerCase().includes(ql))
          .slice(0, 2)
          .forEach((v) => out.push({ id: `s-${col.key}-${v}`, campo: col.key, kind: "col", valor: v, label: `${col.label}: ${v}` }));
      });
    return out.slice(0, 8);
  }, [busca, base, vis, colunas]);

  function matchFacet(c: Chip, row: T): boolean {
    if (c.kind === "col") {
      const col = colunaByKey[c.campo];
      return col ? String(col.valor(row)) === c.valor : true;
    }
    // texto: varre colunas visíveis
    const visiveisCols = colunas.filter((x) => vis.includes(x.key));
    const hay = visiveisCols.map((x) => String(x.valor(row))).join(" ").toLowerCase();
    return hay.includes((c.valor ?? "").toLowerCase());
  }

  function addChip(c: Chip) {
    setChips((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
    setBusca("");
    setSugOpen(false);
  }
  function removeChip(id: string) { setChips((prev) => prev.filter((c) => c.id !== id)); }
  function toggleNivel(n: Nivel) {
    setNiveis((prev) => (prev.some((x) => x.campo === n.campo) ? prev.filter((x) => x.campo !== n.campo) : [...prev, n]));
  }
  function limparTudo() { setChips([]); setNiveis([]); setArvore(null); setBusca(""); }

  // ===== Pipeline: filtro → ordenação =====
  const grupoChips = useMemo(() => {
    const g = new Map<string, Chip[]>();
    chips.forEach((c) => { if (!g.has(c.campo)) g.set(c.campo, []); g.get(c.campo)!.push(c); });
    return [...g.values()];
  }, [chips]);

  const buscaAtiva = busca.trim().toLowerCase();

  const lista = useMemo(() => {
    const visiveisCols = colunas.filter((c) => vis.includes(c.key));
    const hay = (row: T) => visiveisCols.map((c) => String(c.valor(row))).join(" ").toLowerCase();
    return base.filter((row) =>
      (!buscaAtiva || hay(row).includes(buscaAtiva)) &&
      grupoChips.every((cs) => cs.some((c) => matchFacet(c, row))) &&
      (!arvore || testaNo(row, arvore, campoByLike)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, buscaAtiva, grupoChips, arvore, vis, colunas]);

  const listaOrdenada = useMemo(() => {
    if (sorts.length === 0) return lista;
    const arr = [...lista].sort((a, b) => {
      for (const s of sorts) {
        const def = colunaByKey[s.campo];
        if (!def) continue;
        const va = def.valor(a);
        const vb = def.valor(b);
        const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
        if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
    return arr;
  }, [lista, sorts, colunaByKey]);

  const somaTotal = valorSoma ? lista.reduce((s, r) => s + valorSoma(r), 0) : 0;
  const filtrosAtivos = chips.length + (arvore ? 1 : 0);

  // ===== Paginação =====
  const totalReg = listaOrdenada.length;
  const totalPaginas = Math.max(1, Math.ceil(totalReg / porPagina));
  const paginaClamp = Math.min(Math.max(1, pagina), totalPaginas);
  useEffect(() => { setPagina(1); }, [buscaAtiva, porPagina, chips, niveis, arvore, sorts]);
  useEffect(() => { if (pagina > totalPaginas) setPagina(totalPaginas); }, [pagina, totalPaginas]);
  const pageItems = useMemo(() => listaOrdenada.slice((paginaClamp - 1) * porPagina, paginaClamp * porPagina), [listaOrdenada, paginaClamp, porPagina]);

  // ===== Agrupamento multinível =====
  type Flat =
    | { kind: "grupo"; id: string; level: number; label: string; count: number; soma: number; colapsado: boolean }
    | { kind: "linha"; row: T; level: number };

  function keyGrupo(campo: string, row: T): string {
    const c = campoByKey[campo];
    if (c?.grupoKey) return c.grupoKey(row);
    return String(c ? c.get(row) : "");
  }

  const flat = useMemo<Flat[]>(() => {
    if (niveis.length === 0) return pageItems.map((r) => ({ kind: "linha", row: r, level: 0 }));
    const rec = (rows: T[], depth: number, prefix: string): Flat[] => {
      if (depth >= niveis.length) return rows.map((r) => ({ kind: "linha", row: r, level: depth }));
      const nivel = niveis[depth];
      const map = new Map<string, T[]>();
      rows.forEach((r) => { const k = keyGrupo(nivel.campo, r) || "(vazio)"; if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); });
      const out: Flat[] = [];
      [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).forEach(([label, grp]) => {
        const gid = `${prefix}/${nivel.campo}:${label}`;
        const soma = valorSoma ? grp.reduce((s, r) => s + valorSoma(r), 0) : 0;
        const colapsado = !expandidos.has(gid);
        out.push({ kind: "grupo", id: gid, level: depth, label: `${nivel.label}: ${label}`, count: grp.length, soma, colapsado });
        if (!colapsado) out.push(...rec(grp, depth + 1, gid));
      });
      return out;
    };
    return rec(pageItems, 0, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageItems, niveis, expandidos, valorSoma]);

  // ===== Ordenação por header =====
  function ordenarPor(campo: string) {
    const def = colunaByKey[campo];
    if (!def?.sortable) return;
    setSorts((prev) => {
      const i = prev.findIndex((s) => s.campo === campo);
      if (i < 0) return [...prev, { campo, dir: "asc" }];
      if (prev[i].dir === "asc") return prev.map((s) => (s.campo === campo ? { campo, dir: "desc" } : s));
      return prev.filter((s) => s.campo !== campo);
    });
  }
  function ordemDe(campo: string): { pos: number; dir: "asc" | "desc" } | null {
    const i = sorts.findIndex((s) => s.campo === campo);
    return i < 0 ? null : { pos: i + 1, dir: sorts[i].dir };
  }

  // ===== Colunas visíveis (na ordem salva; obrigatórias sempre) =====
  const colsVisiveis = ordem.map((k) => colunaByKey[k]).filter(Boolean).filter((c) => c.obrigatoria || vis.includes(c.key));

  // Larguras redimensionáveis
  const { larguras, setRef, medirFaltantes, iniciarResize, resetColuna, resizingKey } = useResizeColunas(`${storageKey}:larg`, scrollRef);
  const colFixo = colsVisiveis.length > 0 && colsVisiveis.every((c) => larguras[c.key] != null);
  useLayoutEffect(() => { medirFaltantes(colsVisiveis.map((c) => c.key)); }, [colsVisiveis, medirFaltantes]);

  // ===== Favoritos =====
  function salvarFavorito() {
    const fav: Favorito = { id: `f${favSeq++}`, nome: nomeFav.trim() || "Visão salva", snap: { chips, niveis, busca, vis, ordem, sorts, arvore } };
    setFavoritos((prev) => [...prev, fav]);
    setNomeFav(""); setSalvarOpen(false);
    setToast(`Visão "${fav.nome}" salva.`);
  }
  function aplicarFavorito(f: Favorito) {
    setChips(f.snap.chips); setNiveis(f.snap.niveis); setBusca(f.snap.busca);
    setSorts(f.snap.sorts); setArvore(f.snap.arvore);
    if (f.snap.vis) setVis(f.snap.vis);
    if (f.snap.ordem) setOrdem(f.snap.ordem);
  }

  // ===== Exportar CSV (linhas filtradas/ordenadas, colunas visíveis) =====
  function exportar() {
    const heads = colsVisiveis.map((c) => c.label);
    const linhasCsv = listaOrdenada.map((r) => colsVisiveis.map((c) => {
      const v = c.valor(r);
      const s = String(v ?? "").replace(/"/g, '""');
      return /[",;\n]/.test(s) ? `"${s}"` : s;
    }).join(";"));
    const csv = [heads.join(";"), ...linhasCsv].join("\n");
    try {
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportFilename}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setToast(`${listaOrdenada.length} linha(s) exportada(s).`);
    } catch { setToast("Não foi possível exportar."); }
  }

  const camposUI = campos as unknown as CampoUI[];
  const campoByUI = campoByKey as unknown as Record<string, CampoUI>;
  const campoPadrao = campos[0]?.key ?? "";
  const colCount = colsVisiveis.length;

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Btn variant="outline" onClick={exportar}><Download className="size-4" /> Exportar</Btn>
        <Btn variant={compacto ? "primary" : "outline"} onClick={() => setCompacto((v) => !v)}><Rows3 className="size-4" /> Compacto</Btn>

        {/* View switcher */}
        <div className="ml-auto inline-flex items-center rounded-lg border border-border bg-card p-0.5">
          {VIEWS.filter((v) => v.key === "lista" || (v.key === "kanban" && kanbanCampo) || (v.key === "calendario" && calendarioCampo)).map((v) => (
            <Tooltip key={v.key} label={v.label}>
              <button type="button" onClick={() => setView(v.key)} aria-label={v.label} aria-pressed={view === v.key}
                className={cn("flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors", view === v.key ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "text-muted-foreground hover:text-foreground")}>
                <v.icon className="size-4" />
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Searchbar com chips + caret */}
      <div className="mb-3 flex items-start gap-2">
        <div className="relative flex min-h-9 flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1">
          <Search className="ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {chips.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-md bg-violet-500/12 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-500/30 dark:text-violet-300">
              {c.label}
              <button type="button" onClick={() => removeChip(c.id)} aria-label={`Remover ${c.label}`} className="cursor-pointer text-violet-500/70 hover:text-violet-600"><X className="size-3" /></button>
            </span>
          ))}
          {niveis.map((n) => (
            <span key={n.campo} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">
              <Layers className="size-3" /> {n.label}
              <button type="button" onClick={() => toggleNivel(n)} aria-label={`Remover agrupamento ${n.label}`} className="cursor-pointer text-emerald-500/70 hover:text-emerald-600"><X className="size-3" /></button>
            </span>
          ))}
          <input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setSugOpen(true); }}
            onFocus={() => setSugOpen(true)}
            onBlur={() => setTimeout(() => setSugOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter" && sugestoes[0]) addChip(sugestoes[0]); }}
            placeholder={chips.length || niveis.length ? "" : "Buscar ou filtrar..."}
            aria-label="Buscar"
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          />
          {(chips.length > 0 || niveis.length > 0 || arvore || busca.trim().length > 0) && (
            <button type="button" onClick={limparTudo} className="mr-1 shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">Limpar tudo</button>
          )}
          {sugOpen && sugestoes.length > 0 && (
            <div className="absolute left-0 top-full z-40 mt-1 w-72 rounded-xl border border-border bg-popover p-1 shadow-xl">
              {sugestoes.map((s) => (
                <button key={s.id} type="button" onMouseDown={(e) => { e.preventDefault(); addChip(s); }} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent">
                  <Search className="size-3.5 text-muted-foreground" /> {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Caret → painel tri-coluna */}
        <Popover
          align="right"
          width="w-[42rem] max-w-[calc(100vw-2rem)]"
          trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open} className={cn("inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors", filtrosAtivos || niveis.length ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <SlidersHorizontal className="size-4" /> Filtros e agrupar <ChevronDown className="size-3.5" />
            </button>
          )}
        >
          {(close) => (
            <div className="grid grid-cols-1 gap-3 p-1 sm:grid-cols-3">
              {/* Filtros */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400"><SlidersHorizontal className="size-3.5" /> Filtros</p>
                <div className="space-y-0.5">
                  {presets.map((q) => {
                    const chipId = `preset-${q.id}`;
                    const ativo = chips.some((c) => c.id === chipId);
                    const chip: Chip = { id: chipId, campo: q.campo, kind: "col", valor: q.valor, label: q.label };
                    return (
                      <button key={q.id} type="button" onClick={() => (ativo ? removeChip(chipId) : addChip(chip))} className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition-colors", ativo ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                        <Check className={cn("size-4 shrink-0", ativo ? "text-violet-500" : "text-transparent")} /> {q.label}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => { setAvancadoOpen(true); close(); }} className={cn("mt-1 flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-[0.8125rem] font-medium text-violet-600 hover:bg-accent dark:text-violet-400", presets.length > 0 && "border-t border-border")}>
                    <SlidersHorizontal className="size-4" /> Filtro personalizado...
                  </button>
                </div>
              </div>
              {/* Agrupar */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"><Layers className="size-3.5" /> Agrupar por</p>
                <div className="space-y-0.5">
                  {agrupamentos.map((n) => {
                    const idx = niveis.findIndex((x) => x.campo === n.campo);
                    const ativo = idx >= 0;
                    return (
                      <button key={n.campo} type="button" onClick={() => toggleNivel(n)} className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition-colors", ativo ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                        <Check className={cn("size-4 shrink-0", ativo ? "text-emerald-500" : "text-transparent")} />
                        <span className="flex-1">{n.label}</span>
                        {ativo && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{idx + 1}º</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Favoritos */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"><Star className="size-3.5" /> Favoritos</p>
                <div className="space-y-0.5">
                  <button type="button" onClick={() => { setSalvarOpen(true); close(); }} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] font-medium text-amber-600 hover:bg-accent dark:text-amber-400">
                    <Star className="size-4" /> Salvar esta visão
                  </button>
                  {favoritos.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma visão salva ainda.</p>}
                  {favoritos.map((f) => (
                    <div key={f.id} className="group flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-accent">
                      <button type="button" onClick={() => { aplicarFavorito(f); close(); }} className="flex flex-1 cursor-pointer items-center gap-2 text-left text-[0.8125rem] text-foreground">
                        <Star className="size-3.5 text-amber-500" fill="currentColor" />
                        <span className="truncate">{f.nome}</span>
                      </button>
                      <button type="button" onClick={() => setFavoritos((prev) => prev.filter((x) => x.id !== f.id))} aria-label="Excluir favorito" className="cursor-pointer text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:text-rose-500"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Popover>
      </div>

      {/* contador + remover ordenação */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {sorts.length > 0 && (
          <button type="button" onClick={() => setSorts([])} className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ArrowUpDown className="size-3.5" /> Remover ordenação
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{lista.length} de {base.length} {labelRegistro}</span>
      </div>

      {/* ===== VISÃO LISTA ===== */}
      {view === "lista" && (
        <div className="rounded-xl border border-border bg-card">
          <div ref={scrollRef} className="max-h-[calc(100vh-19rem)] overflow-auto">
            <table className={cn("w-full min-w-[60rem]", compacto ? "text-xs" : "text-sm", colFixo ? "table-fixed" : "table-auto")}>
              {colFixo && (
                <colgroup>
                  {colsVisiveis.map((c) => <col key={c.key} style={{ width: larguras[c.key] }} />)}
                  <col />
                </colgroup>
              )}
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {colsVisiveis.map((c) => {
                    const ord = ordemDe(c.key);
                    return (
                      <th key={c.key} ref={setRef(c.key)} className={cn("relative overflow-hidden px-4 text-left font-medium", compacto ? "py-2" : "py-3", c.numeric && "text-right")}>
                        <button type="button" onClick={() => ordenarPor(c.key)} className={cn("flex min-w-0 max-w-full items-center gap-1.5", c.numeric && "ml-auto justify-end", c.sortable ? "cursor-pointer hover:text-foreground" : "cursor-default")}>
                          <span className="truncate">{c.label}</span>
                          {ord && (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-violet-700 ring-1 ring-violet-500/30 dark:text-violet-300">
                              {sorts.length > 1 && <span className="tabular-nums">{ord.pos}</span>}
                              {ord.dir === "asc" ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}
                            </span>
                          )}
                        </button>
                        <ResizeHandle onPointerDown={(e) => iniciarResize(e, c.key)} onReset={() => resetColuna(c.key)} ativo={resizingKey === c.key} />
                      </th>
                    );
                  })}
                  <th className="w-10 px-2 py-3 text-right">
                    <div className="flex justify-end">
                      <SeletorColunas colunas={colunas} ordem={ordem} visiveis={vis} onOrdemChange={setOrdem} onVisiveisChange={setVis} scrollRef={scrollRef} />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {flat.map((it, idx) =>
                  it.kind === "grupo" ? (
                    <tr key={it.id} className="cursor-pointer bg-muted/30 hover:bg-muted/50" onClick={() => setExpandidos((prev) => { const n = new Set(prev); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })}>
                      <td colSpan={colCount + 1} className="px-3 py-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground" style={{ paddingLeft: `${it.level * 1.25}rem` }}>
                          {it.colapsado ? <ChevronRight className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
                          {it.label}
                          <span className="font-normal text-muted-foreground">· {it.count}{valorSoma ? ` · ${brlSoma(it.soma)}` : ""}</span>
                        </span>
                      </td>
                    </tr>
                  ) : (
                    <tr key={rowKey(it.row, idx)} className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40">
                      {colsVisiveis.map((c) => (
                        <td key={c.key} className={cn("overflow-hidden px-4", compacto ? "py-1.5" : "py-3", c.numeric && "text-right")} style={niveis.length && c.key === colsVisiveis[0].key ? { paddingLeft: `${1 + it.level * 1.25}rem` } : undefined}>
                          <div className={cn("truncate", c.numeric && "text-right")}>{celula(it.row, c.key)}</div>
                        </td>
                      ))}
                      <td />
                    </tr>
                  ),
                )}
                {flat.length === 0 && (
                  <tr><td colSpan={colCount + 1} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum registro corresponde aos filtros. <button type="button" onClick={limparTudo} className="cursor-pointer font-medium text-violet-600 hover:underline dark:text-violet-400">Limpar filtros</button>.</td></tr>
                )}
              </tbody>
              {niveis.length === 0 && flat.length > 0 && valorSoma && colsVisiveis.some((c) => c.key === colunaSoma) && (
                <tfoot>
                  <tr className="border-t border-border bg-muted/30 text-sm font-semibold">
                    {colsVisiveis.map((c, i) => (
                      <td key={c.key} className={cn("px-4 py-3", c.numeric && "text-right tabular-nums")}>
                        {i === 0 ? <span className="text-muted-foreground">{lista.length} {labelRegistro}</span> : c.key === colunaSoma ? <span className="text-foreground">{brlSoma(somaTotal)}</span> : ""}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <Paginacao total={totalReg} pagina={paginaClamp} porPagina={porPagina} onPagina={setPagina} onPorPagina={setPorPagina} rotulo={labelRegistro} />
        </div>
      )}

      {/* ===== KANBAN ===== */}
      {view === "kanban" && kanbanCampo && (
        <KanbanView lista={lista} campo={kanbanCampo} campoByKey={campoByLike} tituloItem={tituloItem} subtituloItem={subtituloItem} valorItem={valorItem} />
      )}

      {/* ===== CALENDÁRIO ===== */}
      {view === "calendario" && calendarioCampo && (
        <CalendarioView lista={lista} campoData={calendarioCampo} colunaByKey={colunaByKey as unknown as Record<string, { valor: (r: T) => string | number }>} tituloItem={tituloItem} valorItem={valorItem} />
      )}

      {/* Modais */}
      <FiltroAvancado open={avancadoOpen} onClose={() => setAvancadoOpen(false)} base={base} inicial={arvore} onAplicar={(a) => setArvore(a)} campos={camposUI} campoBy={campoByUI} campoPadrao={campoPadrao} />

      <Modal open={salvarOpen} onClose={() => setSalvarOpen(false)} title="Salvar esta visão" subtitle="Guarda filtros, agrupamentos, colunas e ordenação atuais como um favorito." footer={<><Btn variant="ghost" onClick={() => setSalvarOpen(false)}>Cancelar</Btn><Btn variant="primary" onClick={salvarFavorito}><Star className="size-4" /> Salvar</Btn></>}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Nome da visão</span>
          <input autoFocus value={nomeFav} onChange={(e) => setNomeFav(e.target.value)} placeholder="Ex.: Financeiro bloqueado por UF" className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
      </Modal>

      {toast && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border bg-popover px-4 py-3 text-sm text-foreground shadow-xl">
            <Check className="size-4 shrink-0 text-emerald-500" /> <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function brlSoma(v: number): string { return brlFmt.format(v || 0); }
