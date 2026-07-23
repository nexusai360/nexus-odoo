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

import { Fragment, createContext, useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import {
  Download, SlidersHorizontal, Layers, Star, Search, X, ChevronDown,
  ChevronRight, ChevronLeft, ArrowLeft, List, Columns3, CalendarDays,
  Trash2, Check, ArrowUp, ArrowDown, ArrowUpDown, Rows3, Tag, Filter, Plus, IdCard, Pencil,
} from "lucide-react";

/** Conta as regras (folhas) de uma árvore de filtro personalizado, para o rótulo do chip. */
function contarRegras(g: GrupoRegras | null): number {
  if (!g) return 0;
  return g.filhos.reduce((n, f) => n + (f.tipo === "grupo" ? contarRegras(f) : 1), 0);
}

/** Opções da tabela que as células precisam ler (ex.: mostrar preço de venda
 * junto do custo nas colunas de valor). Provido pela TabelaAvancada. */
export const OpcoesTabelaContext = createContext<{ mostrarVenda: boolean }>({ mostrarVenda: false });
import { cn } from "@/lib/utils";
import {
  Popover, Tooltip, Btn, Select, SeletorColunas, Paginacao, CheckboxView,
  useResizeColunas, ResizeHandle,
} from "./ui";
import { Tooltip as TooltipUI, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FiltroAvancado, type CampoUI } from "./filtro-avancado";
import { KanbanView, CalendarioView } from "./visoes";
import { testaNo, testaRegra, type GrupoRegras, type CampoLike } from "./motor-filtro";
import type { ColunaDef, CampoDef } from "./tipos";

type View = "lista" | "kanban" | "calendario";

/** Facet serializável (predicado derivado de kind/campo/valor). `kind: "regra"` avalia um
 * operador (maior/menor/vazio/...) via o motor de filtro; "col" é igualdade; "texto" é busca. */
export interface Chip { id: string; campo: string; kind: string; valor: string; label: string; op?: string; valor2?: string }
interface Nivel { campo: string; label: string }
interface Sort { campo: string; dir: "asc" | "desc" }
/** Modelo do modo compacto: um subconjunto NOMEADO das colunas ativas, aplicável na hora.
 * Ex.: "Compacto financeiro", "Compacto entrega". As colunas obrigatórias entram sempre. */
interface VisaoCompacta { id: string; nome: string; colunas: string[] }
interface Favorito {
  id: string;
  nome: string;
  snap: { chips: Chip[]; niveis: Nivel[]; busca: string; vis: string[]; ordem: string[]; sorts: Sort[]; arvore: GrupoRegras | null; compacto?: boolean; mostrarVenda?: boolean };
}
/** Filtro rápido pré-setado. Por padrão é igualdade (`kind: "col"`); com `kind: "regra"` +
 * `op` vira um predicado com operador (ex.: desconto "maior" que "0"), avaliado pelo motor. */
export interface PresetFiltro { id: string; label: string; campo: string; valor: string; kind?: string; op?: string; valor2?: string }

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
  /** conteúdo do dropdown expansível por linha (ex.: sub-tabela de produtos do
   * pedido). Quando presente, cada linha ganha um chevron de expandir. */
  expandirRow?: (row: T) => React.ReactNode;
  /** corpo customizado da tela de detalhe (substitui o grid de cards padrão);
   * recebe a linha e desenha a tela inteira do domínio. */
  renderDetalhe?: (row: T) => React.ReactNode;
  /** texto extra por linha para a busca rápida (ex.: nomes/códigos dos produtos
   * do pedido, que não estão nas colunas visíveis do cabeçalho). */
  textoBusca?: (row: T) => string;
  /** habilita o toggle "Mostrar venda": as colunas de valor passam a exibir
   * custo (em cima) e venda (embaixo), com ícones. */
  permiteVenda?: boolean;
  /** inicia a tabela no modo compacto (linhas mais finas) na primeira vez, antes
   * de haver estado salvo. Default: false. */
  compactoInicial?: boolean;
}

const VIEWS: { key: View; label: string; icon: typeof List }[] = [
  { key: "lista", label: "Lista", icon: List },
  { key: "kanban", label: "Kanban", icon: Columns3 },
  { key: "calendario", label: "Calendário", icon: CalendarDays },
];

let favSeq = 0;
let vcSeq = 0;

/** Sobe a árvore a partir de `start` e retorna o ancestral mais próximo que
 * rola na vertical (para encadear o scroll da lista com o da página). */
function acharScrollerVertical(start: HTMLElement): HTMLElement | null {
  let node = start.parentElement;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === "auto" || oy === "scroll") && node.scrollHeight - node.clientHeight > 1) return node;
    node = node.parentElement;
  }
  return null;
}

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
  storageKey,
  exportFilename,
  labelRegistro = "registros",
  presets = [],
  kanbanCampo,
  calendarioCampo,
  tituloItem,
  subtituloItem,
  valorItem,
  expandirRow,
  renderDetalhe,
  textoBusca,
  permiteVenda,
  compactoInicial,
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
  const [compacto, setCompacto] = useState(compactoInicial ?? false);
  const [mostrarVenda, setMostrarVenda] = useState(false);
  // Modo compacto por MODELOS: subconjuntos nomeados das colunas ativas (persistidos).
  const [visoesCompactas, setVisoesCompactas] = useState<VisaoCompacta[]>([]);
  const [compactoAtivo, setCompactoAtivo] = useState<string | null>(null); // id do modelo aplicado
  const [compEditId, setCompEditId] = useState<string | null>(null); // null=fechado; ""=novo; id=editando
  const [compNome, setCompNome] = useState("");
  const [compCols, setCompCols] = useState<string[]>([]);
  const [kanbanDim, setKanbanDim] = useState<string>(kanbanCampo ?? "");
  const [detalhe, setDetalhe] = useState<{ row: T; idx: number } | null>(null);
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [expandRows, setExpandRows] = useState<Set<string>>(new Set());
  function toggleExpandRow(k: string) {
    setExpandRows((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [avancadoOpen, setAvancadoOpen] = useState(false);
  const [salvarOpen, setSalvarOpen] = useState(false);
  const [nomeFav, setNomeFav] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [sugOpen, setSugOpen] = useState(false);
  // Coluna sob o mouse no cabeçalho: acende as DUAS divisórias vizinhas (esquerda e direita).
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const campoByLike = campoByKey as unknown as Record<string, CampoLike>;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Scroll chaining explícito: ao atingir o topo/fundo da lista, empurra o
  // scroller da página (que o browser às vezes não encadeia no mesmo gesto de
  // roda). Só age no eixo vertical, para não atrapalhar o scroll horizontal.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const noTopo = el.scrollTop <= 0;
      const noFundo = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight - 1;
      if ((e.deltaY < 0 && noTopo) || (e.deltaY > 0 && noFundo)) {
        const pai = acharScrollerVertical(el);
        if (pai) {
          pai.scrollTop += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
          e.preventDefault();
        }
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view]);

  // ===== Persistência (por tela) =====
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw);
        // Colunas novas = as que ainda não estão na ordem persistida (não existiam no
        // último save). Usado para (a) mostrar colunas `padrao` novas mesmo em quem já
        // tem estado salvo e (b) anexá-las à ordem. Não força as que o usuário já viu.
        const ordemSalva = Array.isArray(s.ordem) ? (s.ordem as string[]) : [];
        const novas = colunas.filter((c) => !ordemSalva.includes(c.key)).map((c) => c.key);
        if (Array.isArray(s.vis)) {
          const existe = (k: string) => colunas.some((c) => c.key === k);
          const novasPadrao = colunas.filter((c) => c.padrao && novas.includes(c.key)).map((c) => c.key);
          setVis([...(s.vis as string[]).filter(existe), ...novasPadrao.filter((k) => !(s.vis as string[]).includes(k))]);
        }
        // Mescla a ordem salva com o catálogo atual: preserva a ordem do usuário,
        // descarta colunas que não existem mais e ANEXA as novas (senão uma coluna
        // adicionada depois do último save some da tabela mesmo marcada no seletor,
        // pois `colsVisiveis` deriva de `ordem`). Resiliente a novas colunas sem
        // precisar bumpar o storageKey.
        if (Array.isArray(s.ordem)) {
          const todas = colunas.map((c) => c.key);
          const salva = ordemSalva.filter((k) => todas.includes(k));
          const faltantes = todas.filter((k) => !salva.includes(k));
          setOrdem([...salva, ...faltantes]);
        }
        if (Array.isArray(s.sorts)) setSorts(s.sorts);
        if (Array.isArray(s.niveis)) setNiveis(s.niveis);
        if (Array.isArray(s.chips)) setChips(s.chips);
        if (s.view) setView(s.view);
        if (typeof s.busca === "string") setBusca(s.busca);
        if (typeof s.porPagina === "number") setPorPagina(s.porPagina);
        if (typeof s.compacto === "boolean") setCompacto(s.compacto);
        if (typeof s.mostrarVenda === "boolean") setMostrarVenda(s.mostrarVenda);
        if (s.arvore) setArvore(s.arvore);
        if (Array.isArray(s.favoritos)) setFavoritos(s.favoritos);
        if (Array.isArray(s.visoesCompactas)) setVisoesCompactas(s.visoesCompactas);
        if (typeof s.compactoAtivo === "string") setCompactoAtivo(s.compactoAtivo);
      }
    } catch { /* ignore */ }
    setHidratado(true);
  }, [storageKey, colunas]);
  useEffect(() => {
    if (!hidratado) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ ordem, vis, sorts, niveis, chips, view, busca, porPagina, compacto, mostrarVenda, arvore, favoritos, visoesCompactas, compactoAtivo }));
    } catch { /* ignore */ }
  }, [hidratado, storageKey, ordem, vis, sorts, niveis, chips, view, busca, porPagina, compacto, mostrarVenda, arvore, favoritos, visoesCompactas, compactoAtivo]);

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
    if (c.kind === "regra") {
      // Preset com operador (maior/menor/vazio/antes...): avalia via o motor de filtro,
      // usando o CAMPO (CampoDef) e não a coluna. Reusa exatamente a lógica do filtro avançado.
      return testaRegra(row, { id: c.id, tipo: "regra", campo: c.campo, op: c.op ?? "igual", valor: c.valor, valor2: c.valor2 }, campoByLike);
    }
    if (c.kind === "col") {
      const col = colunaByKey[c.campo];
      return col ? String(col.valor(row)) === c.valor : true;
    }
    // texto: varre colunas visíveis + texto extra (ex.: produtos do pedido)
    const visiveisCols = colunas.filter((x) => vis.includes(x.key));
    const hay = (visiveisCols.map((x) => String(x.valor(row))).join(" ") + " " + (textoBusca?.(row) ?? "")).toLowerCase();
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
    const hay = (row: T) => (visiveisCols.map((c) => String(c.valor(row))).join(" ") + " " + (textoBusca?.(row) ?? "")).toLowerCase();
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
        const chave = def.sortKey ?? def.valor;
        const va = chave(a);
        const vb = chave(b);
        const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
        if (cmp !== 0) return s.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
    return arr;
  }, [lista, sorts, colunaByKey]);

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

  // Modelo compacto ativo (subconjunto nomeado de colunas). Quando aplicado, ele MANDA nas
  // colunas exibidas (independe do checkbox de Colunas); só as obrigatórias entram sempre.
  const modeloCompacto = useMemo(
    () => (compactoAtivo ? visoesCompactas.find((v) => v.id === compactoAtivo) ?? null : null),
    [compactoAtivo, visoesCompactas],
  );
  const colunasCompacto = useMemo(
    () => (modeloCompacto ? new Set(modeloCompacto.colunas) : null),
    [modeloCompacto],
  );

  // ===== Colunas visíveis (na ordem salva; obrigatórias sempre) =====
  // Memoizado: referência estável evita reflow por render (o useLayoutEffect de medir larguras
  // só roda quando as colunas realmente mudam, não a cada clique/hover/resize).
  const colsVisiveis = useMemo(() => {
    const todas = ordem.map((k) => colunaByKey[k]).filter(Boolean);
    if (colunasCompacto) return todas.filter((c) => c.obrigatoria || colunasCompacto.has(c.key));
    return todas.filter((c) => c.obrigatoria || vis.includes(c.key));
  }, [ordem, colunaByKey, vis, colunasCompacto]);

  // Totais do rodapé (Σ sobre TODAS as linhas filtradas). Memoizado para NÃO recomputar a cada
  // clique de botão, hover de cabeçalho ou frame de resize , só quando as linhas, as colunas ou
  // o toggle custo/venda mudam. Era o custo escondido que deixava a tabela "lenta".
  const rodapeValores = useMemo(
    () => colsVisiveis.map((c) => (c.rodape ? c.rodape(lista) : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colsVisiveis, lista, mostrarVenda],
  );

  // Larguras redimensionáveis
  const { larguras, setRef, medirFaltantes, iniciarResize, resetColuna, arrastandoRef } = useResizeColunas(`${storageKey}:larg`, scrollRef);
  // Com um MODELO compacto ativo, a tabela roda em table-auto e as colunas de texto são capadas
  // (via max-w + truncate) para o modo compacto ficar de fato compacto; sem modelo, respeita as
  // larguras salvas (table-fixed).
  const colFixo = !modeloCompacto && colsVisiveis.length > 0 && colsVisiveis.every((c) => larguras[c.key] != null);
  useLayoutEffect(() => { medirFaltantes(colsVisiveis.map((c) => c.key)); }, [colsVisiveis, medirFaltantes]);

  // ===== Favoritos =====
  function salvarFavorito() {
    const fav: Favorito = { id: `f${favSeq++}`, nome: nomeFav.trim() || "Visão salva", snap: { chips, niveis, busca, vis, ordem, sorts, arvore, compacto, mostrarVenda } };
    setFavoritos((prev) => [...prev, fav]);
    setNomeFav(""); setSalvarOpen(false);
    setToast(`Visão "${fav.nome}" salva.`);
  }
  function aplicarFavorito(f: Favorito) {
    setChips(f.snap.chips); setNiveis(f.snap.niveis); setBusca(f.snap.busca);
    setSorts(f.snap.sorts); setArvore(f.snap.arvore);
    if (f.snap.vis) setVis(f.snap.vis);
    if (f.snap.ordem) setOrdem(f.snap.ordem);
    // Compacto e "Mostrar venda" também fazem parte da visão salva (default false p/ favoritos antigos).
    setCompacto(f.snap.compacto ?? false);
    setMostrarVenda(f.snap.mostrarVenda ?? false);
    setCompactoAtivo(null); // favoritos não guardam modelo compacto: sai de qualquer modelo ativo.
  }

  // ===== Modo compacto (modelos nomeados) =====
  function aplicarCompacto(id: string | null) { setCompacto(true); setCompactoAtivo(id); }
  function desligarCompacto() { setCompacto(false); setCompactoAtivo(null); }
  function novoCompacto() {
    setCompEditId(""); // "" = novo
    setCompNome("");
    // Começa vazio: o usuário escolhe as POUCAS colunas do modo compacto (as obrigatórias entram
    // sozinhas e nem aparecem na lista). Modo compacto = escolher o essencial, não trimar tudo.
    setCompCols([]);
  }
  function editarCompacto(v: VisaoCompacta) { setCompEditId(v.id); setCompNome(v.nome); setCompCols(v.colunas); }
  function toggleCompCol(k: string) { setCompCols((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k])); }
  function salvarCompacto() {
    const nome = compNome.trim() || "Compacto";
    if (compEditId) {
      const id = compEditId;
      setVisoesCompactas((prev) => prev.map((v) => (v.id === id ? { ...v, nome, colunas: compCols } : v)));
      aplicarCompacto(id);
    } else {
      const id = `vc${vcSeq++}`;
      setVisoesCompactas((prev) => [...prev, { id, nome, colunas: compCols }]);
      aplicarCompacto(id);
    }
    setCompEditId(null);
    setToast(`Modo compacto "${nome}" salvo.`);
  }
  function excluirCompacto(id: string) {
    setVisoesCompactas((prev) => prev.filter((v) => v.id !== id));
    if (compactoAtivo === id) setCompactoAtivo(null);
    if (compEditId === id) setCompEditId(null);
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
    <OpcoesTabelaContext.Provider value={{ mostrarVenda }}>
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        <Btn variant="outline" onClick={exportar}><Download className="size-4" /> Exportar</Btn>
        {/* Compacto: um menu simples. Vejo a LISTA (todas as colunas + modelos, cada um
            clicável para aplicar/tirar) ou o EDITOR (ao criar/editar), nunca os dois juntos. */}
        <Popover
          align="left"
          width="w-72 max-w-[calc(100vw-2rem)]"
          trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open}
              className={cn("inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                compacto ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border bg-card text-foreground hover:bg-accent")}>
              <Rows3 className="size-4" /> {modeloCompacto ? modeloCompacto.nome : "Compacto"}
            </button>
          )}
        >
          {() => {
            const colunasAtivas = ordem.map((k) => colunaByKey[k]).filter(Boolean).filter((c) => !c.obrigatoria && vis.includes(c.key));
            if (compEditId !== null) {
              return (
                <div className="p-1">
                  <p className="mb-2 px-1 text-sm font-semibold text-foreground">{compEditId ? "Editar modelo" : "Novo modelo"}</p>
                  <input value={compNome} onChange={(e) => setCompNome(e.target.value)} placeholder="Nome (ex.: Financeiro)" aria-label="Nome do modelo compacto" className="mb-2 h-9 w-full rounded-lg border border-border bg-card px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  <p className="mb-1 px-1 text-xs text-muted-foreground">Colunas ({compCols.length} de {colunasAtivas.length})</p>
                  <div className="max-h-[15rem] space-y-0.5 overflow-y-auto pr-0.5">
                    {colunasAtivas.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Ative colunas no botão Colunas primeiro.</p>}
                    {colunasAtivas.map((c) => (
                      <button key={c.key} type="button" onClick={() => toggleCompCol(c.key)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] text-foreground transition-colors hover:bg-accent">
                        <CheckboxView checked={compCols.includes(c.key)} />
                        <span className="truncate">{c.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-3 px-1">
                    <button type="button" onClick={salvarCompacto} disabled={compCols.length === 0} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[0.8125rem] font-medium text-violet-600 transition-colors hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-400">
                      <Check className="size-4" /> Salvar
                    </button>
                    <button type="button" onClick={() => setCompEditId(null)} className="cursor-pointer text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground">Cancelar</button>
                  </div>
                </div>
              );
            }
            return (
              <div className="p-1">
                <div className="space-y-0.5">
                  <button type="button" onClick={() => (compacto && !compactoAtivo ? desligarCompacto() : aplicarCompacto(null))} className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition-colors", compacto && !compactoAtivo ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "text-foreground hover:bg-accent")}>
                    <Check className={cn("size-4 shrink-0", compacto && !compactoAtivo ? "text-violet-500" : "text-transparent")} />
                    <span className="flex-1">Todas as colunas</span>
                  </button>
                  {visoesCompactas.map((v) => (
                    <div key={v.id} className={cn("group flex items-center gap-1 rounded-lg pr-1", compactoAtivo === v.id ? "bg-violet-500/10" : "hover:bg-accent")}>
                      <button type="button" onClick={() => (compactoAtivo === v.id ? desligarCompacto() : aplicarCompacto(v.id))} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem]">
                        <Check className={cn("size-4 shrink-0", compactoAtivo === v.id ? "text-violet-500" : "text-transparent")} />
                        <span className={cn("flex-1 truncate", compactoAtivo === v.id ? "text-violet-700 dark:text-violet-300" : "text-foreground")}>{v.nome}</span>
                        <span className="shrink-0 text-[0.7rem] tabular-nums text-muted-foreground">{v.colunas.length}</span>
                      </button>
                      <button type="button" onClick={() => editarCompacto(v)} aria-label={`Editar ${v.nome}`} className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:text-violet-600"><Pencil className="size-3.5" /></button>
                      <button type="button" onClick={() => excluirCompacto(v.id)} aria-label={`Excluir ${v.nome}`} className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:text-rose-500"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={novoCompacto} className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[0.8125rem] font-medium text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-400">
                  <Plus className="size-4" /> Novo modelo
                </button>
              </div>
            );
          }}
        </Popover>
        {/* Toggle custo/venda: colunas de valor passam a mostrar custo + venda com ícones. */}
        {permiteVenda && (
          <Btn variant={mostrarVenda ? "soft" : "outline"} aria-pressed={mostrarVenda} onClick={() => setMostrarVenda((v) => !v)}>
            <Tag className="size-4" /> {mostrarVenda ? "Custo + venda" : "Mostrar venda"}
          </Btn>
        )}
        {/* Seletor de colunas: só no modo lista, na toolbar (não vaza ao rolar). */}
        {view === "lista" && (
          <SeletorColunas rotulo="Colunas" colunas={colunas} ordem={ordem} visiveis={vis} onOrdemChange={setOrdem} onVisiveisChange={setVis} />
        )}
        {/* Seletor da dimensão do Kanban (com busca). */}
        {view === "kanban" && kanbanCampo && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Agrupar por</span>
            <div className="w-44">
              <Select value={kanbanDim} options={agrupamentos.map((a) => ({ value: a.campo, label: a.label }))} onChange={setKanbanDim} ariaLabel="Dimensão do Kanban" />
            </div>
          </div>
        )}

        {/* View switcher. "Pedido" (ficha) não é uma view: abre o overlay de
            detalhe no primeiro pedido da lista atual. Vem primeiro por ser a
            leitura foco-no-pedido; depois Lista e as demais lentes. Escondido
            quando só existiria a Lista (sem Kanban, Calendário nem ficha), como
            na tabela de produtos, onde um switcher de 1 botão não faz sentido. */}
        {(kanbanCampo || calendarioCampo || renderDetalhe) && (
        <div className="ml-auto inline-flex items-center rounded-lg border border-border bg-card p-0.5">
          {/* Ordem: Lista, Pedido (ficha), Kanban, Calendário. O botão "Pedido" entra logo
              depois da Lista (abre o overlay de detalhe no 1º pedido da lista atual). */}
          {VIEWS.filter((v) => v.key === "lista" || (v.key === "kanban" && kanbanCampo) || (v.key === "calendario" && calendarioCampo)).map((v) => (
            <Fragment key={v.key}>
              <Tooltip label={v.label}>
                <button type="button" onClick={() => { setView(v.key); setDetalhe(null); }} aria-label={v.label} aria-pressed={view === v.key && !detalhe}
                  className={cn("flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors", view === v.key && !detalhe ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "text-muted-foreground hover:text-foreground")}>
                  <v.icon className="size-4" />
                </button>
              </Tooltip>
              {v.key === "lista" && renderDetalhe && (
                <Tooltip label="Pedido">
                  <button type="button" onClick={() => { if (listaOrdenada.length) setDetalhe({ row: listaOrdenada[0], idx: 0 }); }}
                    disabled={listaOrdenada.length === 0} aria-label="Pedido" aria-pressed={!!detalhe}
                    className={cn("flex size-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40", detalhe ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "cursor-pointer text-muted-foreground hover:text-foreground")}>
                    <IdCard className="size-4" />
                  </button>
                </Tooltip>
              )}
            </Fragment>
          ))}
        </div>
        )}
      </div>

      {/* Searchbar com chips + caret */}
      <div className="mb-3 flex shrink-0 items-start gap-2">
        <div className="relative flex min-h-9 flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1">
          <Search className="ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {chips.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-md bg-violet-500/12 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-500/30 dark:text-violet-300">
              <Filter className="size-3 shrink-0" aria-hidden /> {c.label}
              <button type="button" onClick={() => removeChip(c.id)} aria-label={`Remover ${c.label}`} className="cursor-pointer text-violet-500/70 hover:text-violet-600"><X className="size-3" /></button>
            </span>
          ))}
          {niveis.map((n, i) => (
            <span key={n.campo} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">
              <Layers className="size-3 shrink-0" aria-hidden />
              <span className="inline-flex size-4 items-center justify-center rounded-full bg-emerald-500/20 text-[0.65rem] font-bold tabular-nums">{i + 1}</span>
              {n.label}
              <button type="button" onClick={() => toggleNivel(n)} aria-label={`Remover agrupamento ${n.label}`} className="cursor-pointer text-emerald-500/70 hover:text-emerald-600"><X className="size-3" /></button>
            </span>
          ))}
          {arvore && (() => { const nr = contarRegras(arvore); return (
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/12 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-500/30 dark:text-violet-300">
              <button type="button" onClick={() => setAvancadoOpen(true)} title="Editar filtro avançado" className="inline-flex cursor-pointer items-center gap-1 hover:text-violet-600 dark:hover:text-violet-200">
                <Filter className="size-3 shrink-0" aria-hidden /> Filtro avançado{nr ? ` · ${nr} ${nr === 1 ? "regra" : "regras"}` : ""}
              </button>
              <button type="button" onClick={() => setArvore(null)} aria-label="Remover filtro avançado" className="cursor-pointer text-violet-500/70 hover:text-violet-600"><X className="size-3" /></button>
            </span>
          ); })()}
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
              <SlidersHorizontal className="size-4" /> Filtrar e agrupar <ChevronDown className="size-3.5" />
            </button>
          )}
        >
          {(close) => (
            <div className="grid grid-cols-1 gap-3 p-1 sm:grid-cols-3">
              {/* Filtros */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400"><SlidersHorizontal className="size-3.5" /> Filtros</p>
                <div className="max-h-[20rem] space-y-0.5 overflow-y-auto pr-0.5">
                  {presets.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Sem filtros rápidos.</p>}
                  {presets.map((q) => {
                    const chipId = `preset-${q.id}`;
                    const ativo = chips.some((c) => c.id === chipId);
                    const chip: Chip = { id: chipId, campo: q.campo, kind: q.kind ?? "col", valor: q.valor, label: q.label, ...(q.op ? { op: q.op } : {}), ...(q.valor2 != null ? { valor2: q.valor2 } : {}) };
                    return (
                      <button key={q.id} type="button" onClick={() => (ativo ? removeChip(chipId) : addChip(chip))} className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition-colors", ativo ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
                        <Check className={cn("size-4 shrink-0", ativo ? "text-violet-500" : "text-transparent")} />
                        <span className="flex-1">{q.label}</span>
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => { setAvancadoOpen(true); close(); }} className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[0.8125rem] font-medium text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-400">
                  <Plus className="size-4" /> Filtro avançado
                </button>
              </div>
              {/* Agrupar */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"><Layers className="size-3.5" /> Agrupar por</p>
                <div className="max-h-[22rem] space-y-0.5 overflow-y-auto pr-0.5">
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
                {salvarOpen ? (
                  <div className="mb-1.5 flex items-center gap-1.5 px-1">
                    <input autoFocus value={nomeFav} onChange={(e) => setNomeFav(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") salvarFavorito(); if (e.key === "Escape") { setSalvarOpen(false); setNomeFav(""); } }}
                      placeholder="Nome da visão" aria-label="Nome da visão"
                      className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 text-[0.8125rem] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    <button type="button" onClick={salvarFavorito} aria-label="Salvar visão" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400"><Check className="size-4" /></button>
                    <button type="button" onClick={() => { setSalvarOpen(false); setNomeFav(""); }} aria-label="Cancelar" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setSalvarOpen(true)} className="mx-auto mb-1.5 flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[0.8125rem] font-medium text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400">
                    <Plus className="size-4" /> Salvar visão
                  </button>
                )}
                <div className="max-h-[22rem] space-y-0.5 overflow-y-auto pr-0.5">
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
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5">
        {sorts.length > 0 && (
          <button type="button" onClick={() => setSorts([])} className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ArrowUpDown className="size-3.5" /> Remover ordenação
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{lista.length} de {base.length} {labelRegistro}</span>
      </div>

      {/* ===== VISÃO LISTA ===== */}
      {view === "lista" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <table className={cn("w-full min-w-[60rem]", compacto ? "text-xs" : "text-sm", colFixo ? "table-fixed" : "table-auto")}>
              {colFixo && (
                <colgroup>
                  {colsVisiveis.map((c) => <col key={c.key} data-colkey={c.key} style={{ width: larguras[c.key] }} />)}
                </colgroup>
              )}
              <thead className="sticky top-0 z-20 bg-muted">
                <tr className="border-b-2 border-border text-left text-sm font-semibold text-muted-foreground">
                  {colsVisiveis.map((c, ci) => {
                    const ord = ordemDe(c.key);
                    const primeira = ci === 0;
                    // Alinhamento: default numérica -> direita, senão esquerda; `align` sobrepõe.
                    const alinhar = c.align ?? (c.numeric ? "right" : "left");
                    return (
                      <th key={c.key} ref={setRef(c.key)} onMouseEnter={() => { if (!arrastandoRef.current) setHoverCol(ci); }} onMouseLeave={() => { if (!arrastandoRef.current) setHoverCol((h) => (h === ci ? null : h)); }} className={cn("group/th relative overflow-hidden text-left font-medium", primeira ? (expandirRow ? "pl-8 pr-4" : "pl-4 pr-4") : "px-4", compacto ? "py-1.5" : "py-2", alinhar === "right" && "text-right", alinhar === "center" && "text-center")}>
                        <button type="button" onClick={() => ordenarPor(c.key)} className={cn("flex min-w-0 max-w-full items-center gap-1.5", alinhar === "right" && "ml-auto justify-end", alinhar === "center" && "mx-auto justify-center", c.sortable ? "cursor-pointer hover:text-foreground" : "cursor-default")}>
                          {c.tooltipHeader ? (
                            <TooltipUI>
                              <TooltipTrigger render={<span className="truncate" />}>{c.label}</TooltipTrigger>
                              <TooltipContent>{c.tooltipHeader}</TooltipContent>
                            </TooltipUI>
                          ) : (
                            <span className="truncate">{c.label}</span>
                          )}
                          {ord ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-violet-700 ring-1 ring-violet-500/30 dark:text-violet-300">
                              {sorts.length > 1 && <span className="tabular-nums">{ord.pos}</span>}
                              {ord.dir === "asc" ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}
                            </span>
                          ) : c.sortable ? (
                            <ArrowUpDown className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/th:opacity-70" aria-hidden />
                          ) : null}
                        </button>
                        {/* Uma divisória por interseção (borda direita da coluna). Acende quando o
                            mouse está NESTA coluna ou na SEGUINTE (a borda direita desta é a borda
                            esquerda da próxima), então ao passar numa coluna as duas divisórias
                            vizinhas ficam visíveis, e ambas arrastam de verdade. */}
                        <ResizeHandle onPointerDown={(e) => iniciarResize(e, c.key)} onReset={() => resetColuna(c.key)} realce={hoverCol === ci || hoverCol === ci + 1} />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {flat.map((it, idx) =>
                  it.kind === "grupo" ? (
                    <tr key={it.id} className="cursor-pointer bg-muted/30 hover:bg-muted/50" onClick={() => setExpandidos((prev) => { const n = new Set(prev); if (n.has(it.id)) n.delete(it.id); else n.add(it.id); return n; })}>
                      <td colSpan={colCount} className="px-3 py-2">
                        <span className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-foreground" style={{ paddingLeft: `${it.level * 1.25}rem` }}>
                          {it.colapsado ? <ChevronRight className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
                          {it.label}
                          <span className="font-normal text-muted-foreground">· {it.count}{valorSoma ? ` · ${brlSoma(it.soma)}` : ""}</span>
                        </span>
                      </td>
                    </tr>
                  ) : (() => {
                    const rk = rowKey(it.row, idx);
                    const aberto = expandRows.has(rk);
                    return (
                      <Fragment key={rk}>
                        <tr onClick={() => setDetalhe({ row: it.row, idx: listaOrdenada.indexOf(it.row) })} className={cn("cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40", aberto && "bg-accent/30")}>
                          {colsVisiveis.map((c, ci) => {
                            const alinhar = c.align ?? (c.numeric ? "right" : "left");
                            return (
                            <td key={c.key} className={cn("overflow-hidden", ci === 0 ? "pl-4 pr-4" : "px-4", compacto ? "py-1" : "py-1.5", modeloCompacto && !c.numeric && "max-w-[15rem]", alinhar === "right" && "text-right", alinhar === "center" && "text-center")} style={niveis.length && c.key === colsVisiveis[0].key ? { paddingLeft: `${1 + it.level * 1.25}rem` } : undefined}>
                              {ci === 0 && expandirRow ? (
                                <div className="flex items-center gap-1">
                                  <button type="button" aria-label={aberto ? "Recolher produtos" : "Ver produtos"} aria-expanded={aberto} onClick={(e) => { e.stopPropagation(); toggleExpandRow(rk); }} className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                                    {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                  </button>
                                  {celula(it.row, c.key)}
                                </div>
                              ) : (
                                <div className={cn("truncate", alinhar === "right" && "text-right", alinhar === "center" && "text-center")}>{celula(it.row, c.key)}</div>
                              )}
                            </td>
                            );
                          })}
                        </tr>
                        {aberto && expandirRow && (
                          <tr className="border-b border-border/60 bg-muted/15">
                            <td colSpan={colCount} className="p-0">{expandirRow(it.row)}</td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })(),
                )}
                {flat.length === 0 && (
                  <tr><td colSpan={colCount} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum registro corresponde aos filtros. <button type="button" onClick={limparTudo} className="cursor-pointer font-medium text-violet-600 hover:underline dark:text-violet-400">Limpar filtros</button>.</td></tr>
                )}
              </tbody>
              {niveis.length === 0 && lista.length > 0 && colsVisiveis.some((c) => c.rodape) && (
                <tfoot className="sticky bottom-0 z-20">
                  <tr className="border-t-2 border-border bg-muted text-sm font-semibold text-foreground">
                    {colsVisiveis.map((c, ci) => {
                      const alinhar = c.align ?? (c.numeric ? "right" : "left");
                      return (
                        <td key={c.key} className={cn(ci === 0 ? "pl-4 pr-4" : "px-4", compacto ? "py-1.5" : "py-2", alinhar === "right" && "text-right tabular-nums", alinhar === "center" && "text-center")}>
                          {rodapeValores[ci]}
                        </td>
                      );
                    })}
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
        <div className="min-h-0 flex-1 overflow-auto">
          <KanbanView lista={lista} campo={kanbanDim || kanbanCampo} campoByKey={campoByLike} tituloItem={tituloItem} subtituloItem={subtituloItem} valorItem={valorItem} onAbrir={(r) => setDetalhe({ row: r, idx: listaOrdenada.indexOf(r) })} />
        </div>
      )}

      {/* ===== CALENDÁRIO ===== */}
      {view === "calendario" && calendarioCampo && (
        <div className="min-h-0 flex-1 overflow-auto">
          <CalendarioView lista={lista} campoData={calendarioCampo} colunaByKey={colunaByKey as unknown as Record<string, { valor: (r: T) => string | number }>} tituloItem={tituloItem} valorItem={valorItem} onAbrir={(r) => setDetalhe({ row: r, idx: listaOrdenada.indexOf(r) })} />
        </div>
      )}

      {/* ===== DETALHE DO PEDIDO (todas as views) =====
          Sobreposto como overlay ABSOLUTO em vez de substituir a view: assim a
          lista/kanban/calendário continuam montados por baixo e o "Voltar"
          devolve o usuário exatamente onde estava (mesma view, página e posição
          de scroll), sem precisar salvar/restaurar nada manualmente. */}
      {detalhe && (
        <div className="absolute inset-0 z-30 flex min-h-0 flex-col bg-background">
          <DetalhePedido
            row={detalhe.row}
            idx={detalhe.idx}
            total={listaOrdenada.length}
            todos={listaOrdenada}
            colunas={colunas}
            celula={celula}
            tituloItem={tituloItem}
            subtituloItem={subtituloItem}
            renderDetalhe={renderDetalhe}
            onVoltar={() => setDetalhe(null)}
            onNavegar={(delta) => {
              const ni = Math.min(Math.max(0, detalhe.idx + delta), listaOrdenada.length - 1);
              setDetalhe({ row: listaOrdenada[ni], idx: ni });
            }}
            onIr={(row) => setDetalhe({ row, idx: listaOrdenada.indexOf(row) })}
          />
        </div>
      )}

      {/* Modais */}
      {/* Montado só quando aberto: garante que "editar" carregue a árvore atual (o useState
          interno do FiltroAvancado só lê `inicial` na montagem). */}
      {avancadoOpen && (
        <FiltroAvancado open onClose={() => setAvancadoOpen(false)} base={base} inicial={arvore} onAplicar={(a) => setArvore(a)} campos={camposUI} campoBy={campoByUI} campoPadrao={campoPadrao} />
      )}

      {toast && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border bg-popover px-4 py-3 text-sm text-foreground shadow-xl">
            <Check className="size-4 shrink-0 text-emerald-500" /> <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
    </OpcoesTabelaContext.Provider>
  );
}

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function brlSoma(v: number): string { return brlFmt.format(v || 0); }

/** Normaliza texto para busca: minúsculas, sem acentos e sem espaços nas bordas. */
function normalizarBusca(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Tela de detalhes de UMA linha: destaque no número, campos organizados por
 * largura, observações em bloco largo, filtro por número + voltar/navegar. */
function DetalhePedido<T extends Record<string, unknown>>({
  row, idx, total, todos, colunas, celula, tituloItem, subtituloItem, renderDetalhe, onVoltar, onNavegar, onIr,
}: {
  row: T;
  idx: number;
  total: number;
  todos: T[];
  colunas: ColunaDef<T>[];
  celula: (row: T, key: string) => React.ReactNode;
  tituloItem?: (row: T) => string;
  subtituloItem?: (row: T) => string;
  renderDetalhe?: (row: T) => React.ReactNode;
  onVoltar: () => void;
  onNavegar: (delta: number) => void;
  onIr: (row: T) => void;
}) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  // Busca por número do pedido OU nome do cliente, ignorando acentos e caixa,
  // para achar qualquer um dos pedidos da lista pelo que o usuário digitar.
  const sugestoes = useMemo(() => {
    const t = normalizarBusca(q);
    if (!t) return [] as T[];
    return todos
      .filter((r) => normalizarBusca(`${tituloItem?.(r) ?? ""} ${subtituloItem?.(r) ?? ""}`).includes(t))
      .slice(0, 10);
  }, [q, todos, tituloItem, subtituloItem]);
  const semResultado = aberto && q.trim().length > 0 && sugestoes.length === 0;
  const spanClass = (s?: number) => (s === 4 ? "sm:col-span-2 lg:col-span-4" : s === 2 ? "sm:col-span-2" : "");

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
      {/* Barra superior: voltar | ir para o pedido (nº) | navegação */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <button type="button" onClick={onVoltar} className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
          <ArrowLeft className="size-4" /> Voltar
        </button>
        <div className="relative mx-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setAberto(true); }}
            onFocus={() => setAberto(true)}
            onBlur={() => setTimeout(() => setAberto(false), 150)}
            placeholder="Ir para o pedido (nº)..."
            aria-label="Ir para o pedido pelo número"
            className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {aberto && sugestoes.length > 0 && (
            <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-xl border border-border bg-popover p-1 shadow-xl">
              {sugestoes.map((r, i) => (
                <button key={i} type="button" onMouseDown={(e) => { e.preventDefault(); onIr(r); setQ(""); setAberto(false); }} className="flex w-full cursor-pointer flex-col items-start rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-accent">
                  <span className="text-sm font-medium text-foreground">{tituloItem ? tituloItem(r) : ""}</span>
                  {subtituloItem && <span className="w-full truncate text-xs text-muted-foreground">{subtituloItem(r)}</span>}
                </button>
              ))}
            </div>
          )}
          {semResultado && (
            <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-xl border border-border bg-popover px-3 py-2.5 text-xs text-muted-foreground shadow-xl">
              Nenhum pedido encontrado para “{q.trim()}”.
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">{idx + 1} de {total}</span>
          <button type="button" onClick={() => onNavegar(-1)} disabled={idx <= 0} aria-label="Anterior" className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="size-4" /></button>
          <button type="button" onClick={() => onNavegar(1)} disabled={idx >= total - 1} aria-label="Próximo" className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="size-4" /></button>
        </div>
      </div>

      {renderDetalhe ? (
        <div className="min-h-0 flex-1 overflow-auto">{renderDetalhe(row)}</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
          {/* Destaque do pedido */}
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 pb-3">
            <h2 className="text-2xl font-bold tabular-nums text-foreground">{tituloItem ? tituloItem(row) : ""}</h2>
            {subtituloItem && <span className="text-sm text-muted-foreground">{subtituloItem(row)}</span>}
          </div>
          {/* Campos: cada um ocupa a largura do seu detalheSpan (texto completo, sem truncar) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {colunas.map((c) => (
              <div key={c.key} className={cn("min-w-0 rounded-lg border border-border/60 bg-background/40 p-3", spanClass(c.detalheSpan))}>
                <p className="mb-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
                {c.tipo === "texto" ? (
                  <p className="break-words text-sm text-foreground">{String(c.valor(row)) || "-"}</p>
                ) : (
                  <div className="text-sm text-foreground">{celula(row, c.key)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
