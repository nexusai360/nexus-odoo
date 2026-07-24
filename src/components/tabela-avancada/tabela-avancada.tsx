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

import { Fragment, createContext, useMemo, useRef, useState, useEffect, useLayoutEffect, useDeferredValue } from "react";
import {
  Download, SlidersHorizontal, Layers, Star, Search, X, ChevronDown,
  ChevronRight, ChevronLeft, ArrowLeft, List, Columns3, Columns2, CalendarDays,
  Trash2, Check, ArrowUp, ArrowDown, ArrowUpDown, Rows3, Tag, Filter, Plus, IdCard, Pencil,
} from "lucide-react";

/** Conta as regras (folhas) de uma árvore de filtro personalizado, para o rótulo do chip. */
function contarRegras(g: GrupoRegras | null): number {
  if (!g) return 0;
  return g.filhos.reduce((n, f) => n + (f.tipo === "grupo" ? contarRegras(f) : 1), 0);
}

/** Opções da tabela que as células precisam ler (ex.: mostrar preço de venda
 * junto do custo nas colunas de valor). Provido pela TabelaAvancada. */
export const OpcoesTabelaContext = createContext<{ mostrarCusto: boolean }>({ mostrarCusto: false });
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Popover, Tooltip, Btn, SeletorColunas, Paginacao,
  useResizeColunas, ResizeHandle, ListaColunasArrastavel, type ColunaOpc,
} from "./ui";
import { Tooltip as TooltipUI, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FiltroAvancado, type CampoUI } from "./filtro-avancado";
import { KanbanView, CalendarioView } from "./visoes";
import { testaNo, testaRegra, type GrupoRegras, type CampoLike } from "./motor-filtro";
import type { ColunaDef, CampoDef } from "./tipos";

type View = "lista" | "kanban" | "calendario";

/** Facet serializável (predicado derivado de kind/campo/valor). `kind: "regra"` avalia um
 * operador (maior/menor/vazio/...) via o motor de filtro; "col" é igualdade; "texto" é busca. */
export interface Chip { id: string; campo: string; kind: string; valor: string; label: string; op?: string; valor2?: string; escopo?: string }
interface Nivel { campo: string; label: string }
interface Sort { campo: string; dir: "asc" | "desc" }
/** Modelo do modo compacto: um subconjunto NOMEADO das colunas ativas, aplicável na hora.
 * Ex.: "Compacto financeiro", "Compacto entrega". As colunas obrigatórias entram sempre. */
interface VisaoCompacta { id: string; nome: string; colunas: string[] }
interface Favorito {
  id: string;
  nome: string;
  // Escopo da visão salva. Favorito da LISTA e do KANBAN são separados: cada
  // view só enxerga os seus. Legado (sem escopo) conta como "lista".
  escopo?: View;
  snap: { chips: Chip[]; niveis: Nivel[]; busca: string; vis: string[]; ordem: string[]; sorts: Sort[]; arvore: GrupoRegras | null; compacto?: boolean; mostrarCusto?: boolean; kanbanDim?: string };
}
/** Filtro rápido pré-setado. Por padrão é igualdade (`kind: "col"`); com `kind: "regra"` +
 * `op` vira um predicado com operador (ex.: desconto "maior" que "0"), avaliado pelo motor. */
export interface PresetFiltro { id: string; label: string; campo: string; valor: string; kind?: string; op?: string; valor2?: string;
  /** Coluna que HABILITA o preset no painel (validação dinâmica). Por padrão é o próprio `campo`,
   * mas alguns filtros usam um campo auxiliar (ex.: "entregaStatus") enquanto representam, para o
   * usuário, uma coluna visível diferente (ex.: "prevista" = Entrega). Aqui aponta para essa coluna
   * semântica, para o filtro aparecer quando a coluna que o usuário reconhece está ativa. */
  col?: string }

export interface TabelaAvancadaProps<T extends Record<string, unknown>> {
  base: T[];
  colunas: ColunaDef<T>[];
  colunaByKey: Record<string, ColunaDef<T>>;
  campos: CampoDef<T>[];
  campoByKey: Record<string, CampoDef<T>>;
  /** dimensões de agrupamento (lista: níveis aninhados; kanban: dimensão única). */
  agrupamentos: { campo: string; label: string }[];
  celula: (row: T, key: string, truncar?: boolean) => React.ReactNode;
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

/** Editor de um modelo compacto (nome + colunas). Guarda nome/colunas/busca em
 * estado LOCAL: assim a digitação não re-renderiza a tabela inteira (o que
 * deixava o campo lento). Inclui busca para filtrar a lista de colunas. */
function EditorModeloCompacto({ colunas, obrigatorias, inicialNome, inicialCols, editando, nomesUsados, onSalvar, onCancelar }: {
  colunas: { key: string; label: string }[];
  obrigatorias: { key: string; label: string }[];
  inicialNome: string;
  inicialCols: string[];
  editando: boolean;
  nomesUsados: string[];
  onSalvar: (nome: string, cols: string[]) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicialNome);
  const [busca, setBusca] = useState("");
  // SELEÇÃO (quais colunas entram no modelo) + ORDEM de exibição. A ordem inicia com as colunas já
  // do modelo (na ordem salva) e depois as demais colunas ativas; o usuário reordena por arraste
  // (mesma alça do menu Colunas) e marca/desmarca no checkbox. Ao salvar, as MARCADAS são gravadas
  // NA ORDEM em que aparecem , e é essa ordem que o modelo usa ao ser aplicado. O modo tradicional
  // (compacto desligado) não é tocado: ele continua seguindo a ordem/visibilidade próprias.
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set(inicialCols));
  const [ordemLocal, setOrdemLocal] = useState<string[]>(() => {
    const doModelo = inicialCols.filter((k) => colunas.some((c) => c.key === k));
    const resto = colunas.map((c) => c.key).filter((k) => !doModelo.includes(k));
    return [...doModelo, ...resto];
  });
  // Catálogo por chave (obrigatórias travadas + colunas ativas), consumido pela lista arrastável.
  const byKey = useMemo(() => {
    const m: Record<string, ColunaOpc> = {};
    obrigatorias.forEach((c) => { m[c.key] = { key: c.key, label: c.label, obrigatoria: true }; });
    colunas.forEach((c) => { m[c.key] = { key: c.key, label: c.label }; });
    return m;
  }, [obrigatorias, colunas]);
  // Ordem completa da lista: obrigatórias no topo (travadas) + a ordem escolhida das demais.
  const ordemFull = useMemo(() => [...obrigatorias.map((c) => c.key), ...ordemLocal], [obrigatorias, ordemLocal]);
  // Marcadas (checkbox): obrigatórias sempre + as selecionadas.
  const visiveis = useMemo(() => [...obrigatorias.map((c) => c.key), ...ordemLocal.filter((k) => selecionadas.has(k))], [obrigatorias, ordemLocal, selecionadas]);
  const buscando = busca.trim().length > 0;
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? ordemFull.filter((k) => byKey[k]?.label.toLowerCase().includes(t)) : ordemFull;
  }, [busca, ordemFull, byKey]);

  const dupNome = nome.trim().length > 0 && nomesUsados.includes(normalizarBusca(nome));
  const nSel = ordemLocal.filter((k) => selecionadas.has(k)).length;
  const podeSalvar = nome.trim().length > 0 && nSel > 0 && !dupNome;

  function toggle(k: string) {
    if (byKey[k]?.obrigatoria) return;
    setSelecionadas((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  function selecionarTudo() { setSelecionadas(new Set(colunas.map((c) => c.key))); }
  function limpar() { setSelecionadas(new Set()); }
  function reordenar(nextFull: string[]) {
    const obg = new Set(obrigatorias.map((c) => c.key));
    setOrdemLocal(nextFull.filter((k) => !obg.has(k)));
  }
  function salvar() { onSalvar(nome, ordemLocal.filter((k) => selecionadas.has(k))); }

  return (
    <div className="p-1">
      <p className="mb-2 px-1 text-sm font-semibold text-foreground">{editando ? "Editar modelo" : "Novo modelo"}</p>
      <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} maxLength={20} placeholder="Nome do modelo (obrigatório)" aria-label="Nome do modelo compacto" className="h-8 w-full rounded-lg border border-border bg-card px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      {dupNome && <p className="mt-1 px-1 text-xs text-rose-500">Já existe um modelo com esse nome.</p>}
      <div className="mt-3 border-t border-border pt-3">
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selecione as colunas</p>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar coluna" aria-label="Buscar coluna" className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-[0.8125rem] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="mb-1.5 flex items-center gap-0.5 px-1">
          <button type="button" onClick={selecionarTudo} className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-violet-600 hover:bg-accent dark:text-violet-400">Selecionar tudo</button>
          <button type="button" onClick={limpar} className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">Limpar</button>
        </div>
        {colunas.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Ative colunas no botão Colunas primeiro.</p>
        ) : (
          <>
            <div className="mb-1 flex items-center justify-between gap-2 px-1">
              <span className="text-[0.7rem] text-muted-foreground/70">{buscando ? " " : "Arraste para ordenar."}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{nSel + obrigatorias.length} de {colunas.length + obrigatorias.length} colunas</span>
            </div>
            <ListaColunasArrastavel
              ordemFull={ordemFull}
              byKey={byKey}
              visiveis={visiveis}
              filtradas={filtradas}
              buscando={buscando}
              onOrdemChange={reordenar}
              onToggle={toggle}
              alturaMax="max-h-[13rem]"
            />
          </>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 px-1">
        <button type="button" onClick={salvar} disabled={!podeSalvar} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[0.8125rem] font-medium text-violet-600 transition-colors hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-violet-400">
          <Check className="size-4" /> Salvar
        </button>
        <button type="button" onClick={onCancelar} className="cursor-pointer text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground">Cancelar</button>
      </div>
    </div>
  );
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
  const [mostrarCusto, setMostrarCusto] = useState(false);
  // Modo compacto por MODELOS: subconjuntos nomeados das colunas ativas (persistidos).
  const [visoesCompactas, setVisoesCompactas] = useState<VisaoCompacta[]>([]);
  const [compactoAtivo, setCompactoAtivo] = useState<string | null>(null); // id do modelo aplicado
  // Escopo de busca por coluna: null = busca em todas as colunas exibidas; senão a
  // busca livre (e as sugestões) filtram só nessa coluna. Efêmero (não persiste).
  const [escopoCol, setEscopoCol] = useState<string | null>(null);
  const [colPicker, setColPicker] = useState(false); // seletor de coluna (escopo) aberto
  const [colPickerQ, setColPickerQ] = useState(""); // mini-busca dentro do seletor
  const buscaInputRef = useRef<HTMLInputElement>(null);
  const colPickerRef = useRef<HTMLDivElement>(null);
  const colPickerInputRef = useRef<HTMLInputElement>(null);
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
  const [favEditId, setFavEditId] = useState<string | null>(null); // favorito sendo renomeado
  const [nomeFav, setNomeFav] = useState("");
  const [sugOpen, setSugOpen] = useState(false);
  // Coluna sob o mouse no cabeçalho: acende as DUAS divisórias vizinhas (esquerda e direita).
  const scrollRef = useRef<HTMLDivElement>(null);

  // Snapshot dos filtros/busca de ORIGEM ao entrar no detalhe do pedido. Dentro
  // do detalhe a pessoa mexe em busca/filtros à vontade (aplicados "por cima",
  // reescopando os pedidos navegáveis); o botão Voltar (ou trocar de modo)
  // restaura exatamente o que havia antes. É o que torna o detalhe uma lente
  // temporária sobre a lista, sem perder a visão que a pessoa tinha construído.
  const snapDetalheRef = useRef<{ busca: string; chips: Chip[]; niveis: Nivel[]; arvore: GrupoRegras | null; escopoCol: string | null } | null>(null);
  function abrirDetalhe(row: T, idx: number) {
    setDetalhe({ row, idx });
  }
  function fecharDetalhe() {
    const s = snapDetalheRef.current;
    if (s) {
      setBusca(s.busca); setChips(s.chips); setNiveis(s.niveis); setArvore(s.arvore); setEscopoCol(s.escopoCol);
      snapDetalheRef.current = null;
    }
    setDetalhe(null);
  }

  const campoByLike = campoByKey as unknown as Record<string, CampoLike>;

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
        if (typeof s.mostrarCusto === "boolean") setMostrarCusto(s.mostrarCusto);
        if (s.arvore) setArvore(s.arvore);
        // Dedup por id + avança o contador além do maior id salvo: `favSeq`/`vcSeq`
        // são module-level e zeram no reload, então sem isto um "novo" reusaria um
        // id ja presente no localStorage (ex.: vc0), gerando key duplicada.
        if (Array.isArray(s.favoritos)) {
          const seen = new Set<string>();
          const arr = (s.favoritos as Favorito[]).filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
          setFavoritos(arr);
          const maxN = Math.max(-1, ...arr.map((f) => { const m = /^f(\d+)$/.exec(f.id); return m ? Number(m[1]) : -1; }));
          if (maxN >= favSeq) favSeq = maxN + 1;
        }
        if (Array.isArray(s.visoesCompactas)) {
          const seen = new Set<string>();
          const arr = (s.visoesCompactas as VisaoCompacta[]).filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)));
          setVisoesCompactas(arr);
          const maxN = Math.max(-1, ...arr.map((v) => { const m = /^vc(\d+)$/.exec(v.id); return m ? Number(m[1]) : -1; }));
          if (maxN >= vcSeq) vcSeq = maxN + 1;
        }
        if (typeof s.compactoAtivo === "string") setCompactoAtivo(s.compactoAtivo);
      }
    } catch { /* ignore */ }
    setHidratado(true);
  }, [storageKey, colunas]);
  useEffect(() => {
    if (!hidratado) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ ordem, vis, sorts, niveis, chips, view, busca, porPagina, compacto, mostrarCusto, arvore, favoritos, visoesCompactas, compactoAtivo }));
    } catch { /* ignore */ }
  }, [hidratado, storageKey, ordem, vis, sorts, niveis, chips, view, busca, porPagina, compacto, mostrarCusto, arvore, favoritos, visoesCompactas, compactoAtivo]);

  // colunas exibidas (independe do checkbox de Colunas); só as obrigatórias entram sempre.
  const modeloCompacto = useMemo(
    () => (compactoAtivo ? visoesCompactas.find((v) => v.id === compactoAtivo) ?? null : null),
    [compactoAtivo, visoesCompactas],
  );
  // ===== Colunas visíveis (na ordem salva; obrigatórias sempre) =====
  // Memoizado: referência estável evita reflow por render (o useLayoutEffect de medir larguras
  // só roda quando as colunas realmente mudam, não a cada clique/hover/resize).
  const colsVisiveis = useMemo(() => {
    const todas = ordem.map((k) => colunaByKey[k]).filter(Boolean);
    if (modeloCompacto) {
      // Modelo compacto tem ORDEM PRÓPRIA: obrigatórias primeiro (na ordem tradicional) e depois as
      // colunas do modelo NA ORDEM salva no editor. NÃO deriva de `ordem`, então reordenar o compacto
      // não altera o modo tradicional , que continua seguindo `ordem` + `vis` (bloco `else` abaixo).
      const obrig = todas.filter((c) => c.obrigatoria);
      const escolhidas = modeloCompacto.colunas.map((k) => colunaByKey[k]).filter((c) => c && !c.obrigatoria);
      return [...obrig, ...escolhidas];
    }
    return todas.filter((c) => c.obrigatoria || vis.includes(c.key));
  }, [ordem, colunaByKey, vis, modeloCompacto]);

  // Conjunto de colunas para BUSCA/FILTRO/ESCOPO. No kanban, no calendário e no
  // detalhe do pedido a busca vale para QUALQUER coluna (essas views são
  // independentes da seleção de colunas e do modo compacto da lista); na lista,
  // segue as colunas exibidas. Só afeta busca/filtro, nunca o que a lista desenha.
  const buscaLivre = !!detalhe || view !== "lista";
  const colsBusca = useMemo(
    () => (buscaLivre ? ordem.map((k) => colunaByKey[k]).filter(Boolean) : colsVisiveis),
    [buscaLivre, ordem, colunaByKey, colsVisiveis],
  );
  // Views que no "Filtrar e agrupar" mostram SÓ os filtros (sem Agrupar por nem
  // Favoritos): detalhe do pedido e calendário. Kanban mantém as três seções
  // (Agrupar vira dimensão única; Favoritos são os do kanban).
  const soFiltros = !!detalhe || view === "calendario";

  // ===== Escopo de busca por coluna =====
  // Coluna-alvo da busca. Só vale se ainda está EXIBIDA; se um modelo compacto a
  // esconder, o escopo é limpo (não dá pra buscar numa coluna fora da tela).
  const colEscopo = useMemo(
    () => (escopoCol ? colsBusca.find((c) => c.key === escopoCol) ?? null : null),
    [escopoCol, colsBusca],
  );
  useEffect(() => {
    if (escopoCol && !colsBusca.some((c) => c.key === escopoCol)) setEscopoCol(null);
  }, [escopoCol, colsBusca]);

  // Colunas oferecidas no seletor de escopo, filtradas pela mini-busca (sem acento).
  const colunasBuscaveis = useMemo(() => {
    const q = normalizarBusca(colPickerQ.trim());
    if (!q) return colsBusca;
    return colsBusca.filter((c) => normalizarBusca(c.label).includes(q));
  }, [colsBusca, colPickerQ]);

  // Ao abrir o seletor: zera a mini-busca e foca o campo. Fecha por clique fora / Esc.
  useEffect(() => {
    if (!colPicker) return;
    setColPickerQ("");
    const t = setTimeout(() => colPickerInputRef.current?.focus(), 0);
    const onDown = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setColPicker(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => { clearTimeout(t); window.removeEventListener("mousedown", onDown); };
  }, [colPicker]);

  // ===== Busca inteligente (facets das colunas de texto EXIBIDAS) =====
  // Respeita o conjunto EFETIVO de colunas (colsVisiveis): com um modelo compacto
  // ativo, sugere só nas colunas do modelo; sem ele, só nas colunas ativas do menu
  // de Colunas. Nunca sugere/varre uma coluna que não está na tela. Gera até 40
  // sugestões (4 por coluna) e o dropdown rola mostrando ~10 por vez.
  // Valor de busca DEFERIDO: o input atualiza `busca` na hora (digitação lisa) e a
  // filtragem pesada (sugestões + lista) roda sobre este valor, de forma interrompível,
  // sem travar o teclado. Elimina o "engasgo" dos primeiros/últimos caracteres.
  const buscaDeferida = useDeferredValue(busca);

  const sugestoes = useMemo(() => {
    const q = buscaDeferida.trim();
    if (!q) return [] as Chip[];
    const ql = q.toLowerCase();
    // Com escopo ativo: sugere SÓ na coluna escolhida (qualquer tipo), com o "Contém"
    // restrito a ela (chip com `escopo`) e os valores exatos como facets sem tag.
    if (colEscopo) {
      const out: Chip[] = [{ id: `s-txt-${colEscopo.key}-${q}`, campo: "texto", kind: "texto", valor: q, escopo: colEscopo.key, label: `Contém "${q}"` }];
      [...new Set(base.map((r) => String(colEscopo.valor(r))).filter((v) => v && v !== "-"))]
        .filter((v) => v.toLowerCase().includes(ql))
        .slice(0, 40)
        .forEach((v) => out.push({ id: `s-${colEscopo.key}-${v}`, campo: colEscopo.key, kind: "col", valor: v, label: v }));
      return out.slice(0, 40);
    }
    const out: Chip[] = [{ id: `s-txt-${q}`, campo: "texto", kind: "texto", valor: q, label: `Contém "${q}"` }];
    colsBusca
      .filter((c) => (c.tipo === "texto" || c.tipo === "tagCor"))
      .forEach((col) => {
        [...new Set(base.map((r) => String(col.valor(r))).filter((v) => v && v !== "-"))]
          .filter((v) => v.toLowerCase().includes(ql))
          .slice(0, 4)
          .forEach((v) => out.push({ id: `s-${col.key}-${v}`, campo: col.key, kind: "col", valor: v, label: `${col.label}: ${v}` }));
      });
    return out.slice(0, 40);
  }, [buscaDeferida, base, colsBusca, colEscopo]);

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
    // texto: com escopo (chip.escopo), varre só aquela coluna; senão as colunas EXIBIDAS
    // (respeita o modo compacto) + texto extra (ex.: produtos do pedido).
    if (c.escopo) {
      const col = colunaByKey[c.escopo];
      return col ? String(col.valor(row)).toLowerCase().includes((c.valor ?? "").toLowerCase()) : true;
    }
    const hay = (colsBusca.map((x) => String(x.valor(row))).join(" ") + " " + (textoBusca?.(row) ?? "")).toLowerCase();
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
  function limparTudo() { setChips([]); setNiveis([]); setArvore(null); setBusca(""); setEscopoCol(null); }

  // ===== Pipeline: filtro → ordenação =====
  const grupoChips = useMemo(() => {
    const g = new Map<string, Chip[]>();
    chips.forEach((c) => { if (!g.has(c.campo)) g.set(c.campo, []); g.get(c.campo)!.push(c); });
    return [...g.values()];
  }, [chips]);

  const buscaAtiva = buscaDeferida.trim().toLowerCase();

  const lista = useMemo(() => {
    // Com escopo ativo, a busca livre varre só a coluna escolhida; senão, todas as exibidas.
    const hay = (row: T) => colEscopo
      ? String(colEscopo.valor(row)).toLowerCase()
      : (colsBusca.map((c) => String(c.valor(row))).join(" ") + " " + (textoBusca?.(row) ?? "")).toLowerCase();
    return base.filter((row) =>
      (!buscaAtiva || hay(row).includes(buscaAtiva)) &&
      grupoChips.every((cs) => cs.some((c) => matchFacet(c, row))) &&
      (!arvore || testaNo(row, arvore, campoByLike)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, buscaAtiva, grupoChips, arvore, colsBusca, colEscopo]);

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

  // Ao ENTRAR no detalhe, congela a visão de origem (filtros/busca) uma vez. Lê
  // o estado já commitado (origem intacta, pois abrir o detalhe não mexe em
  // filtro), então nunca pega valor stale. Sai só via fecharDetalhe, que
  // restaura e zera o ref.
  useEffect(() => {
    if (detalhe && !snapDetalheRef.current) {
      snapDetalheRef.current = { busca, chips, niveis, arvore, escopoCol };
    }
  }, [detalhe, busca, chips, niveis, arvore, escopoCol]);

  // No detalhe, quando busca/filtros mudam a lista, mantém o pedido em foco
  // coerente: se ele ainda está no conjunto, reindexa; se saiu, pula para o
  // primeiro do novo conjunto (a pessoa continua "no modo pedido", vendo o que
  // filtrou). Lista vazia mantém a ficha atual (a navegação mostra 1 de 0).
  useEffect(() => {
    if (!detalhe) return;
    const i = listaOrdenada.indexOf(detalhe.row);
    if (i === -1) {
      if (listaOrdenada.length) setDetalhe({ row: listaOrdenada[0], idx: 0 });
    } else if (i !== detalhe.idx) {
      setDetalhe({ row: detalhe.row, idx: i });
    }
  }, [listaOrdenada, detalhe]);

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
  // Totais do rodapé (Σ sobre TODAS as linhas filtradas). Memoizado para NÃO recomputar a cada
  // clique de botão, hover de cabeçalho ou frame de resize , só quando as linhas, as colunas ou
  // o toggle custo/venda mudam. Era o custo escondido que deixava a tabela "lenta".
  const rodapeValores = useMemo(
    () => colsVisiveis.map((c) => (c.rodape ? c.rodape(lista) : null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colsVisiveis, lista, mostrarCusto],
  );

  // Larguras redimensionáveis
  // DOIS conjuntos de largura, um por modo: NORMAL (persistido) e COMPACTO (efêmero, recalculado
  // a cada ativação). Assim, mexer nas colunas no compacto NÃO afeta o tradicional, e ao sair do
  // compacto as colunas voltam exatamente como o usuário deixou no tradicional. O resize/duplo-
  // clique operam sobre o conjunto do modo ATIVO (R).
  // "Modo compacto" é a DENSIDADE `compacto` (booleano) , vale pro "Todas as colunas" (sem modelo
  // nomeado) e pra modelos salvos. NÃO usar `modeloCompacto` aqui (só existe com modelo nomeado).
  const rN = useResizeColunas(`${storageKey}:larg`, scrollRef);
  // Compacto: larguras EFÊMERAS (persistir=false) , nunca herda do localStorage; sempre recalcula
  // a regra ao ativar/recarregar. Resize manual no compacto vale só na sessão (some ao sair/reload).
  const rC = useResizeColunas(`${storageKey}:larg-compacto`, scrollRef, false);
  const R = compacto ? rC : rN;
  const { larguras, setRef, iniciarResize, resetColuna, arrastandoRef } = R;
  // table-fixed (com largura explícita) torna o arraste barato e o encolhimento possível , resize
  // e duplo-clique valem nos DOIS modos. Vira fixed assim que todas foram medidas.
  const colFixo = colsVisiveis.length > 0 && colsVisiveis.every((c) => larguras[c.key] != null);
  // NORMAL: mede a largura natural (sem cap) das colunas que ainda não têm largura.
  useLayoutEffect(() => { if (!compacto) rN.medirFaltantes(colsVisiveis.map((c) => c.key)); }, [colsVisiveis, compacto, rN.medirFaltantes]);
  // COMPACTO , medição da REGRA em 2 tempos (exato em 32 chars E com resize que revela caracteres):
  // (1) liga `medindoCompacto` → as células renderizam o texto CORTADO em 32 chars; (2) medimos a
  // largura real dessas células (padding de texto/tag exato) e gravamos; (3) desliga → a exibição
  // volta ao conteúdo COMPLETO, que o CSS trunca na largura fixada. Assim, alargar a coluna revela
  // mais caracteres e encolher traz as reticências de volta, mas o padrão fica exato em 32.
  const [medindoCompacto, setMedindoCompacto] = useState(false);
  // Colunas que o usuário redimensionou À MÃO no compacto: saem da truncagem por 32 chars e passam
  // a exibir o conteúdo COMPLETO cortado por LARGURA (CSS), revelando/escondendo texto AO VIVO
  // conforme arrasta. As demais ficam na regra (exatos 32 chars, por contagem).
  const [colunasMexidasCompacto, setColunasMexidasCompacto] = useState<Set<string>>(new Set());
  // Larguras-REGRA por coluna (compacto). Guardadas para o duplo-clique animar de volta pra regra
  // sem remedir (evita o "engasga" da medição síncrona numa tabela larga).
  const larguraRegraRef = useRef<Record<string, number>>({});
  // (Re)ativou o compacto ou mudou modelo/colunas: volta TUDO pra regra (limpa as mexidas) e remede.
  useLayoutEffect(() => { if (compacto) { setColunasMexidasCompacto(new Set()); setMedindoCompacto(true); } }, [compacto, compactoAtivo, colsVisiveis]);
  // Mede a largura-regra com as células cortadas em 32 chars por contagem (largura fica EXATA para
  // os 32) e grava. A exibição em repouso usa a MESMA contagem, então mostra exatamente 32 + "…".
  useLayoutEffect(() => {
    if (!medindoCompacto) return;
    if (!compacto) { setMedindoCompacto(false); return; }
    const regra = rC.medirTodas(colsVisiveis.map((c) => c.key));
    larguraRegraRef.current = regra;
    rC.aplicar(regra);
    setMedindoCompacto(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medindoCompacto, compacto]);

  // ===== Favoritos =====
  // Escopo de um favorito (legado sem escopo = "lista"). Cada view só lista os seus.
  const escopoDe = (f: Favorito): View => f.escopo ?? "lista";
  const favoritosDaView = favoritos.filter((f) => escopoDe(f) === view);
  function salvarFavorito() {
    const nome = nomeFav.trim();
    if (!nome) return; // nome obrigatório: sem nome não salva
    if (favoritosDaView.some((f) => normalizarBusca(f.nome) === normalizarBusca(nome))) { toast.error("Já existe um favorito com esse nome."); return; }
    // A visão salva carrega o escopo da view atual e a dimensão do kanban (usada só no kanban).
    const fav: Favorito = { id: `f${favSeq++}`, nome, escopo: view, snap: { chips, niveis, busca, vis, ordem, sorts, arvore, compacto, mostrarCusto, kanbanDim } };
    setFavoritos((prev) => [...prev, fav]);
    setNomeFav(""); setSalvarOpen(false);
    // A notificação diz ONDE a visão foi salva (kanban tem favoritos próprios, separados da lista).
    const onde = view === "kanban" ? "do Kanban" : "da lista";
    toast.success(`Visão ${onde} "${fav.nome}" salva.`);
  }
  // Edita SOMENTE o nome de um favorito (não altera os filtros/config guardados).
  function salvarEdicaoFav() {
    const nome = nomeFav.trim();
    if (!nome || !favEditId) return;
    if (favoritosDaView.some((f) => f.id !== favEditId && normalizarBusca(f.nome) === normalizarBusca(nome))) { toast.error("Já existe um favorito com esse nome."); return; }
    setFavoritos((prev) => prev.map((f) => (f.id === favEditId ? { ...f, nome } : f)));
    setFavEditId(null); setNomeFav("");
  }
  function aplicarFavorito(f: Favorito) {
    setChips(f.snap.chips); setNiveis(f.snap.niveis); setBusca(f.snap.busca);
    setSorts(f.snap.sorts); setArvore(f.snap.arvore);
    if (f.snap.vis) setVis(f.snap.vis);
    if (f.snap.ordem) setOrdem(f.snap.ordem);
    // Compacto e "Mostrar venda" também fazem parte da visão salva (default false p/ favoritos antigos).
    setCompacto(f.snap.compacto ?? false);
    setMostrarCusto(f.snap.mostrarCusto ?? false);
    setCompactoAtivo(null); // favoritos não guardam modelo compacto: sai de qualquer modelo ativo.
    // Kanban: a dimensão de agrupamento também faz parte da visão salva.
    if (f.snap.kanbanDim) setKanbanDim(f.snap.kanbanDim);
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
  // Recebe nome/colunas do editor (estado local dele, para não travar a digitação).
  function salvarCompacto(nomeRaw: string, cols: string[]) {
    const nome = nomeRaw.trim();
    if (!nome || cols.length === 0) return; // nome obrigatório + ao menos 1 coluna
    if (visoesCompactas.some((v) => v.id !== compEditId && normalizarBusca(v.nome) === normalizarBusca(nome))) { toast.error("Já existe um modelo com esse nome."); return; }
    if (compEditId) {
      const id = compEditId;
      setVisoesCompactas((prev) => prev.map((v) => (v.id === id ? { ...v, nome, colunas: cols } : v)));
      aplicarCompacto(id);
    } else {
      const id = `vc${vcSeq++}`;
      setVisoesCompactas((prev) => [...prev, { id, nome, colunas: cols }]);
      aplicarCompacto(id);
    }
    setCompEditId(null);
    toast.success(`Modo compacto "${nome}" salvo.`);
  }
  function excluirCompacto(id: string) {
    setVisoesCompactas((prev) => prev.filter((v) => v.id !== id));
    if (compactoAtivo === id) setCompactoAtivo(null);
    if (compEditId === id) setCompEditId(null);
  }

  // ===== Exportar CSV =====
  /** Gera e baixa um CSV (escaping ;/"/quebra + BOM UTF-8). Reusado pelo export da
   * lista e pelo export de um pedido (tela de detalhe). */
  function baixarCsv(nome: string, heads: string[], linhas: (string | number)[][]) {
    const esc = (v: string | number) => {
      const s = String(v ?? "").replace(/"/g, '""');
      return /[",;\n]/.test(s) ? `"${s}"` : s;
    };
    const csv = [heads.map(esc).join(";"), ...linhas.map((l) => l.map(esc).join(";"))].join("\n");
    try {
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nome}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${linhas.length} linha(s) exportada(s).`);
    } catch { toast.error("Não foi possível exportar."); }
  }

  // Export da lista: linhas filtradas/ordenadas, colunas visíveis.
  function exportar() {
    baixarCsv(exportFilename, colsVisiveis.map((c) => c.label), listaOrdenada.map((r) => colsVisiveis.map((c) => String(c.valor(r) ?? ""))));
  }

  const campoByUI = campoByKey as unknown as Record<string, CampoUI>;
  // O seletor de campo do filtro avançado reflete as colunas de BUSCA (colsBusca):
  // na lista, as colunas ativas na ordem do usuário (e, no compacto, as do modelo);
  // no kanban/calendário/detalhe, TODAS as colunas (busca livre, sem trava).
  const camposUI = useMemo(
    () => colsBusca.map((c) => campoByUI[c.key]).filter(Boolean) as CampoUI[],
    [colsBusca, campoByUI],
  );
  const campoPadrao = camposUI[0]?.key ?? campos[0]?.key ?? "";
  const colCount = colsVisiveis.length;
  // VALIDAÇÃO DINÂMICA (só na LISTA): os filtros rápidos e os agrupamentos oferecidos no painel
  // seguem as COLUNAS EFETIVAS. `colsVisiveis` já reflete as colunas ativas na lista e, no modo
  // compacto, só as do modelo , então desativar uma coluna (ou entrar num modelo compacto) some com
  // o preset/agrupamento daquela coluna, e reativá-la o traz de volta, tudo dinâmico. Cada campo de
  // preset/agrupamento casa 1:1 com a `key` de uma coluna. Fora da lista (kanban/calendário/detalhe)
  // cada modo tem sua própria regra, então NÃO filtramos aqui (comportamento intocado). Filtros e
  // agrupamentos já APLICADOS continuam como chips removíveis acima da busca, então nada fica preso.
  const naLista = view === "lista" && !detalhe;
  const colsAtivasSet = useMemo(() => new Set(colsVisiveis.map((c) => c.key)), [colsVisiveis]);
  const presetsVis = useMemo(
    () => (naLista ? presets.filter((p) => colsAtivasSet.has(p.col ?? p.campo)) : presets),
    [naLista, presets, colsAtivasSet],
  );
  const agrupamentosVis = useMemo(
    () => (naLista ? agrupamentos.filter((a) => colsAtivasSet.has(a.campo)) : agrupamentos),
    [naLista, agrupamentos, colsAtivasSet],
  );
  // Largura EXPLÍCITA da tabela = soma das larguras das colunas. É obrigatório: com table-fixed,
  // usar `width:max-content` (w-max) faz o browser IGNORAR a largura dos <col> (dá pra ver o
  // inline mudar sem a coluna mexer). Com largura explícita, o resize passa a valer de fato.
  const larguraTotal = colFixo ? colsVisiveis.reduce((s, c) => s + (larguras[c.key] ?? 0), 0) : undefined;

  // Corpo da tabela memoizado: as linhas só são recriadas quando os DADOS mudam
  // (flat/colunas/expansão/etc.), NUNCA a cada tecla da busca. Como a lista deriva do
  // valor DEFERIDO (buscaDeferida), digitar não altera estas deps, então o React
  // reaproveita as mesmas <tr> (referência idêntica) e pula a reconciliação do corpo
  // inteiro. É a combinação (useDeferredValue + linhas memoizadas) que deixa a
  // digitação lisa mesmo com dezenas de linhas × colunas na tela.
  const linhasTabela = useMemo(() => flat.map((it, idx) =>
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
          <tr onClick={() => abrirDetalhe(it.row, listaOrdenada.indexOf(it.row))} className={cn("cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40", aberto && "bg-accent/30")}>
            {colsVisiveis.map((c, ci) => {
              const alinhar = c.align ?? (c.numeric ? "right" : "left");
              return (
              <td key={c.key} className={cn("overflow-hidden", ci === 0 ? "pl-4 pr-4" : "px-4", compacto ? "py-1" : "py-1.5", modeloCompacto && !c.numeric && !medindoCompacto && "max-w-[15rem]", alinhar === "right" && "text-right", alinhar === "center" && "text-center")} style={niveis.length && c.key === colsVisiveis[0].key ? { paddingLeft: `${1 + it.level * 1.25}rem` } : undefined}>
                {ci === 0 && expandirRow ? (
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label={aberto ? "Recolher produtos" : "Ver produtos"} aria-expanded={aberto} onClick={(e) => { e.stopPropagation(); toggleExpandRow(rk); }} className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      {aberto ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                    {celula(it.row, c.key, medindoCompacto || (compacto && !colunasMexidasCompacto.has(c.key)))}
                  </div>
                ) : (
                  <div className={cn("truncate", alinhar === "right" && "text-right", alinhar === "center" && "text-center")}>{celula(it.row, c.key, medindoCompacto || (compacto && !colunasMexidasCompacto.has(c.key)))}</div>
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
  ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [flat, colsVisiveis, expandRows, compacto, medindoCompacto, colunasMexidasCompacto, modeloCompacto, niveis, listaOrdenada, expandirRow, valorSoma, colCount]);

  return (
    <OpcoesTabelaContext.Provider value={{ mostrarCusto }}>
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
        {/* Exportar: só na LISTA (CSV das colunas visíveis). No detalhe do pedido,
            no kanban e no calendário não faz sentido (não é uma tabela tabular). */}
        {!detalhe && view === "lista" && (
        <Btn variant="outline" onClick={exportar}><Download className="size-4" /> Exportar</Btn>
        )}
        {/* Compacto / Mostrar venda / Colunas só fazem sentido sobre a LISTA: somem
            no detalhe do pedido (ficha), no kanban e no calendário (cards). */}
        {!detalhe && view === "lista" && (
        <Popover
          align="left"
          width="w-80 max-w-[calc(100vw-2rem)]"
          trigger={({ toggle, open }) => (
            <div className="group relative inline-flex">
              <button type="button" onClick={toggle} aria-expanded={open}
                className={cn("inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                  compacto ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border bg-card text-foreground hover:bg-accent")}>
                <Rows3 className="size-4" /> Compacto
              </button>
              {/* Atalho: com o compacto ligado, um "x" colado na diagonal superior
                  direita (metade fora) desliga na hora, sem abrir o menu. */}
              {compacto && (
                <button type="button" onClick={(e) => { e.stopPropagation(); desligarCompacto(); }} aria-label="Desativar modo compacto" title="Desativar modo compacto"
                  className="absolute -right-1.5 -top-1.5 z-20 hidden size-4 cursor-pointer items-center justify-center rounded-full border border-violet-500/40 bg-violet-500/15 text-violet-700 shadow-sm transition-colors hover:border-violet-500/70 hover:bg-violet-500/35 hover:text-violet-800 group-hover:flex dark:text-violet-300 dark:hover:text-violet-100">
                  <X className="size-2.5" />
                </button>
              )}
            </div>
          )}
        >
          {() => {
            const colunasAtivas = ordem.map((k) => colunaByKey[k]).filter(Boolean).filter((c) => !c.obrigatoria && vis.includes(c.key));
            const obrigatorias = colunas.filter((c) => c.obrigatoria);
            const totalVisiveis = colunas.filter((c) => c.obrigatoria || vis.includes(c.key)).length;
            if (compEditId !== null) {
              return (
                <EditorModeloCompacto
                  key={compEditId || "novo"}
                  colunas={colunasAtivas.map((c) => ({ key: c.key, label: c.label }))}
                  obrigatorias={obrigatorias.map((c) => ({ key: c.key, label: c.label }))}
                  inicialNome={compNome}
                  inicialCols={compCols}
                  editando={!!compEditId}
                  nomesUsados={visoesCompactas.filter((v) => v.id !== compEditId).map((v) => normalizarBusca(v.nome))}
                  onSalvar={salvarCompacto}
                  onCancelar={() => setCompEditId(null)}
                />
              );
            }
            return (
              <div className="p-1">
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400"><Rows3 className="size-3.5" /> Modo compacto</p>
                <button type="button" onClick={novoCompacto} className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-violet-500/40 px-2 py-2 text-[0.8125rem] font-medium text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-400">
                  <Plus className="size-4" /> Novo modelo
                </button>
                <div className="mt-3 border-t border-border pt-2.5">
                  <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meus modelos</p>
                  <div className="max-h-[18rem] space-y-0.5 overflow-y-auto pr-0.5">
                    <button type="button" onClick={() => (compacto && !compactoAtivo ? desligarCompacto() : aplicarCompacto(null))} className={cn("flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition-colors", compacto && !compactoAtivo ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "text-foreground hover:bg-accent")}>
                      <Rows3 className={cn("size-3.5 shrink-0", compacto && !compactoAtivo ? "text-violet-500" : "text-muted-foreground")} />
                      <span className="min-w-0 truncate">Todas as colunas</span>
                      <span className={cn("shrink-0 rounded-full px-1.5 text-[0.7rem] font-medium tabular-nums", compacto && !compactoAtivo ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "bg-muted text-muted-foreground")} title={`${totalVisiveis} colunas`}>{totalVisiveis}</span>
                    </button>
                    {visoesCompactas.map((v) => (
                      <div key={v.id} className={cn("group flex items-center gap-1.5 rounded-lg pr-1", compactoAtivo === v.id ? "bg-violet-500/10" : "hover:bg-accent")}>
                        <button type="button" onClick={() => (compactoAtivo === v.id ? desligarCompacto() : aplicarCompacto(v.id))} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[0.8125rem]">
                          <Rows3 className={cn("size-3.5 shrink-0", compactoAtivo === v.id ? "text-violet-500" : "text-muted-foreground")} />
                          <span className={cn("min-w-0 truncate", compactoAtivo === v.id ? "text-violet-700 dark:text-violet-300" : "text-foreground")}>{v.nome}</span>
                          <span className={cn("shrink-0 rounded-full px-1.5 text-[0.7rem] font-medium tabular-nums", compactoAtivo === v.id ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "bg-muted text-muted-foreground")} title={`${v.colunas.length + obrigatorias.length} colunas`}>{v.colunas.length + obrigatorias.length}</span>
                        </button>
                        <button type="button" onClick={() => editarCompacto(v)} aria-label={`Editar ${v.nome}`} className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:text-violet-600"><Pencil className="size-3.5" /></button>
                        <button type="button" onClick={() => excluirCompacto(v.id)} aria-label={`Excluir ${v.nome}`} className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:text-rose-500"><Trash2 className="size-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          }}
        </Popover>
        )}
        {/* Toggle custo/venda: colunas de valor passam a mostrar custo + venda com ícones. */}
        {!detalhe && view === "lista" && permiteVenda && (
          <Btn variant={mostrarCusto ? "soft" : "outline"} aria-pressed={mostrarCusto} onClick={() => setMostrarCusto((v) => !v)}>
            <Tag className="size-4" /> {mostrarCusto ? "Venda + Custo" : "Mostrar custo"}
          </Btn>
        )}
        {/* Seletor de colunas: só no modo lista, na toolbar (não vaza ao rolar). */}
        {!detalhe && view === "lista" && (
          <SeletorColunas rotulo="Colunas" colunas={colunas} ordem={ordem} visiveis={vis} onOrdemChange={setOrdem} onVisiveisChange={setVis} />
        )}
        {/* A dimensão do Kanban é escolhida no "Filtrar e agrupar" (seção Agrupar por),
            como dimensão ÚNICA. O seletor inline foi removido para unificar o controle. */}

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
                <button type="button" onClick={() => { setView(v.key); fecharDetalhe(); if (v.key === "kanban") desligarCompacto(); }} aria-label={v.label} aria-pressed={view === v.key && !detalhe}
                  className={cn("flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors", view === v.key && !detalhe ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "text-muted-foreground hover:text-foreground")}>
                  <v.icon className="size-4" />
                </button>
              </Tooltip>
              {v.key === "lista" && renderDetalhe && (
                <Tooltip label="Pedido">
                  <button type="button" onClick={() => { if (listaOrdenada.length) abrirDetalhe(listaOrdenada[0], 0); }}
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
          {/* Lupa = botão que abre o seletor de COLUNA (escopo da busca). Fica roxo
              translúcido no hover e quando há um escopo ativo. */}
          <div ref={colPickerRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setColPicker((v) => !v)}
              aria-label={colEscopo ? `Buscando na coluna ${colEscopo.label}. Trocar coluna` : "Buscar em uma coluna específica"}
              aria-expanded={colPicker}
              title={colEscopo ? `Buscando só em ${colEscopo.label}` : "Buscar em uma coluna específica"}
              className={cn(
                "flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                colPicker || colEscopo || busca.trim()
                  // Aceso base (imagem 1): coluna selecionada (sempre, com ou sem texto),
                  // digitando, ou seletor aberto. No hover fica MAIS aceso (imagem 2).
                  ? "bg-violet-500/10 text-violet-600 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20 hover:ring-violet-500/40 dark:text-violet-300"
                  // Neutro (sem texto e sem escopo): apagado; o hover acende igual à imagem 1.
                  : "text-muted-foreground hover:bg-violet-500/10 hover:text-violet-600 hover:ring-1 hover:ring-inset hover:ring-violet-500/30 dark:hover:text-violet-300",
              )}
            >
              <Search className="size-4" />
            </button>
            {colPicker && (
              <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                <div className="relative mb-1.5">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    ref={colPickerInputRef}
                    value={colPickerQ}
                    onChange={(e) => setColPickerQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setColPicker(false); return; }
                      if (e.key === "Enter" && colunasBuscaveis[0]) { setEscopoCol(colunasBuscaveis[0].key); setColPicker(false); buscaInputRef.current?.focus(); }
                    }}
                    placeholder="Buscar coluna..."
                    aria-label="Buscar coluna"
                    className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="max-h-64 space-y-0.5 overflow-y-auto pr-0.5">
                  {colEscopo && (
                    <button type="button" onClick={() => { setEscopoCol(null); setColPicker(false); buscaInputRef.current?.focus(); }} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                      <X className="size-3.5 shrink-0" aria-hidden /> Buscar em todas as colunas
                    </button>
                  )}
                  {colunasBuscaveis.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhuma coluna encontrada.</p>
                  )}
                  {colunasBuscaveis.map((c) => {
                    const ativo = c.key === escopoCol;
                    return (
                      <button key={c.key} type="button" onClick={() => { setEscopoCol(c.key); setColPicker(false); buscaInputRef.current?.focus(); }} className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition-colors", ativo ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "text-foreground hover:bg-accent")}>
                        <Columns2 className={cn("size-3.5 shrink-0", ativo ? "text-violet-500" : "text-muted-foreground")} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{c.label}</span>
                        {ativo && <Check className="size-3.5 shrink-0 text-violet-500" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {/* Kanban: a dimensão de agrupamento é SEMPRE a primeira tag (verde), antes de
              escopo e filtros. Só há uma (o kanban agrupa por uma dimensão só) e ela é
              obrigatória, então não tem X; muda ao trocar o "Agrupar por", mas nunca sai
              da primeira posição. */}
          {view === "kanban" && (() => {
            const dim = agrupamentos.find((a) => a.campo === kanbanDim);
            const label = dim?.label ?? kanbanDim;
            if (!label) return null;
            return (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300" title={`Kanban agrupado por ${label}`}>
                <Layers className="size-3 shrink-0" aria-hidden /> {label}
              </span>
            );
          })()}
          {/* Indicador do escopo ativo: qual coluna está sendo buscada (X remove). */}
          {colEscopo && (
            <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/12 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-500/30 dark:text-violet-300">
              <Columns2 className="size-3 shrink-0" aria-hidden /> {colEscopo.label}
              <button type="button" onClick={() => { setEscopoCol(null); buscaInputRef.current?.focus(); }} aria-label={`Remover busca na coluna ${colEscopo.label}`} className="cursor-pointer text-violet-500/70 hover:text-violet-600"><X className="size-3" /></button>
            </span>
          )}
          {chips.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-md bg-violet-500/12 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-500/30 dark:text-violet-300">
              <Filter className="size-3 shrink-0" aria-hidden /> {c.label}
              <button type="button" onClick={() => removeChip(c.id)} aria-label={`Remover ${c.label}`} className="cursor-pointer text-violet-500/70 hover:text-violet-600"><X className="size-3" /></button>
            </span>
          ))}
          {/* Chips de agrupamento (com ordinal 1º/2º) são da LISTA. No kanban a
              dimensão é única (sem ordinal); no calendário/detalhe não há agrupamento. */}
          {!buscaLivre && niveis.map((n, i) => (
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
            ref={buscaInputRef}
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setSugOpen(true); }}
            onFocus={() => setSugOpen(true)}
            onBlur={() => setTimeout(() => setSugOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter" && sugestoes[0]) addChip(sugestoes[0]); }}
            placeholder={colEscopo ? `Buscar em ${colEscopo.label}...` : (chips.length || niveis.length ? "" : "Buscar ou filtrar...")}
            aria-label={colEscopo ? `Buscar na coluna ${colEscopo.label}` : "Buscar"}
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          />
          {(chips.length > 0 || niveis.length > 0 || arvore || busca.trim().length > 0 || !!colEscopo) && (
            <button type="button" onClick={limparTudo} className="mr-1 shrink-0 cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">Limpar tudo</button>
          )}
          {sugOpen && !colPicker && sugestoes.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[22rem] overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl">
              {sugestoes.map((s) => {
                // Quando a sugestão é de uma coluna, o nome da coluna vira uma TAG
                // neutra translúcida (clara no dark, escura no light, via foreground/10)
                // e o valor vem ao lado. "Contém ..." é texto livre: sem tag.
                const colLabel = s.kind === "col" ? (colunaByKey[s.campo]?.label ?? null) : null;
                return (
                  <button key={s.id} type="button" onMouseDown={(e) => { e.preventDefault(); addChip(s); }} className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent">
                    <Search className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    {colLabel ? (
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="shrink-0 rounded-md bg-foreground/10 px-1.5 py-0.5 text-[0.7rem] font-medium text-foreground ring-1 ring-inset ring-foreground/15">{colLabel}</span>
                        <span className="min-w-0 break-words">{s.valor}</span>
                      </span>
                    ) : (
                      <span className="min-w-0 break-words">{s.label}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Caret → painel tri-coluna */}
        <Popover
          align="right"
          width={soFiltros ? "w-72 max-w-[calc(100vw-2rem)]" : "w-[46rem] max-w-[calc(100vw-2rem)]"}
          trigger={({ toggle, open }) => (
            <button type="button" onClick={toggle} aria-expanded={open} className={cn("inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors", filtrosAtivos || niveis.length || view === "kanban" ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>
              <SlidersHorizontal className="size-4" /> {soFiltros ? "Filtrar" : "Filtrar e agrupar"} <ChevronDown className="size-3.5" />
            </button>
          )}
        >
          {(close) => (
            <div className={cn("grid grid-cols-1 gap-3 p-1", !soFiltros && "sm:grid-cols-3")}>
              {/* Filtros */}
              <div className="flex min-h-0 flex-col">
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400"><Filter className="size-3.5" /> Filtros</p>
                <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
                  {presetsVis.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{presets.length === 0 ? "Sem filtros rápidos." : "Nenhum filtro para as colunas ativas."}</p>}
                  {presetsVis.map((q) => {
                    const chipId = `preset-${q.id}`;
                    const ativo = chips.some((c) => c.id === chipId);
                    const chip: Chip = { id: chipId, campo: q.campo, kind: q.kind ?? "col", valor: q.valor, label: q.label, ...(q.op ? { op: q.op } : {}), ...(q.valor2 != null ? { valor2: q.valor2 } : {}) };
                    return (
                      <button key={q.id} type="button" onClick={() => (ativo ? removeChip(chipId) : addChip(chip))} className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition-colors", ativo ? "bg-violet-500/10 text-violet-700 dark:text-violet-300" : "text-foreground hover:bg-accent")}>
                        <Filter className={cn("size-3 shrink-0", ativo ? "text-violet-500" : "text-muted-foreground")} />
                        <span className="flex-1">{q.label}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Filtro avançado TRAVADO no rodapé da coluna (linha separa da lista rolável acima):
                    fica sempre no mesmo lugar, por mais presets que a lista tenha no futuro. */}
                <div className="mt-2 shrink-0 border-t border-border pt-2">
                  <button type="button" onClick={() => { setAvancadoOpen(true); close(); }} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-violet-600 transition-colors hover:bg-violet-500/10 dark:text-violet-400">
                    <Plus className="size-4" /> Filtro avançado
                  </button>
                </div>
              </div>
              {/* Agrupar e Favoritos: no detalhe do pedido e no calendário some tudo,
                  sobra só Filtros. Na lista e no kanban, aparecem (no kanban, Agrupar
                  vira dimensão única e Favoritos são os do kanban). */}
              {!soFiltros && (<>
              {/* Agrupar. Na LISTA: níveis aninhados (1º, 2º...). No KANBAN: dimensão
                  ÚNICA (uma escolha define as colunas do quadro), e só as dimensões
                  cujas colunas o usuário habilitou na lista. */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"><Layers className="size-3.5" /> Agrupar por</p>
                {view === "kanban" ? (
                  <div className="max-h-[22rem] space-y-0.5 overflow-y-auto pr-0.5">
                    {agrupamentos.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma dimensão para agrupar.</p>}
                    {agrupamentos.map((n) => {
                      const ativo = kanbanDim === n.campo;
                      return (
                        <button key={n.campo} type="button" onClick={() => setKanbanDim(n.campo)} aria-pressed={ativo} className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition-colors", ativo ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "text-foreground hover:bg-accent")}>
                          <Layers className={cn("size-3 shrink-0", ativo ? "text-emerald-500" : "text-muted-foreground")} />
                          <span className="flex-1">{n.label}</span>
                          {ativo && <Check className="size-3.5 shrink-0 text-emerald-500" aria-hidden />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="max-h-[22rem] space-y-0.5 overflow-y-auto pr-0.5">
                    {agrupamentosVis.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum agrupamento para as colunas ativas.</p>}
                    {agrupamentosVis.map((n) => {
                      const idx = niveis.findIndex((x) => x.campo === n.campo);
                      const ativo = idx >= 0;
                      return (
                        <button key={n.campo} type="button" onClick={() => toggleNivel(n)} className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] transition-colors", ativo ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "text-foreground hover:bg-accent")}>
                          <Layers className={cn("size-3 shrink-0", ativo ? "text-emerald-500" : "text-muted-foreground")} />
                          <span className="flex-1">{n.label}</span>
                          {ativo && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{idx + 1}º</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Favoritos */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-sm font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"><Star className="size-3.5" /> Favoritos</p>
                {salvarOpen ? (() => {
                  const dup = nomeFav.trim().length > 0 && favoritosDaView.some((f) => normalizarBusca(f.nome) === normalizarBusca(nomeFav));
                  return (
                    <div>
                      <div className="flex items-center gap-1.5 px-1">
                        <input autoFocus value={nomeFav} onChange={(e) => setNomeFav(e.target.value)} maxLength={20}
                          onKeyDown={(e) => { if (e.key === "Enter") salvarFavorito(); if (e.key === "Escape") { setSalvarOpen(false); setNomeFav(""); } }}
                          placeholder="Nome da visão" aria-label="Nome da visão"
                          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 text-[0.8125rem] text-foreground placeholder:text-muted-foreground focus-visible:border-amber-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50" />
                        <button type="button" onClick={salvarFavorito} disabled={!nomeFav.trim() || dup} aria-label="Salvar visão" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-amber-600 transition-colors hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-400"><Check className="size-3.5" /></button>
                        <button type="button" onClick={() => { setSalvarOpen(false); setNomeFav(""); }} aria-label="Cancelar" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"><X className="size-3.5" /></button>
                      </div>
                      {dup && <p className="mt-1 px-1 text-xs text-rose-500">Já existe um favorito com esse nome.</p>}
                    </div>
                  );
                })() : (
                  <button type="button" onClick={() => { setFavEditId(null); setNomeFav(""); setSalvarOpen(true); }} className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-amber-500/40 px-2 py-2 text-[0.8125rem] font-medium text-amber-600 transition-colors hover:bg-amber-500/10 dark:text-amber-400">
                    <Plus className="size-4" /> Salvar visão atual
                  </button>
                )}
                <div className="mt-3 border-t border-border pt-2.5">
                  <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meus favoritos</p>
                  <div className="max-h-[18rem] space-y-0.5 overflow-y-auto pr-0.5">
                    {favoritosDaView.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma visão salva ainda.</p>}
                    {favoritosDaView.map((f) => (favEditId === f.id ? (() => {
                      const dup = nomeFav.trim().length > 0 && favoritosDaView.some((x) => x.id !== f.id && normalizarBusca(x.nome) === normalizarBusca(nomeFav));
                      return (
                        <div key={f.id} className="px-1 py-1">
                          <div className="flex items-center gap-1.5">
                            <input autoFocus value={nomeFav} onChange={(e) => setNomeFav(e.target.value)} maxLength={20}
                              onKeyDown={(e) => { if (e.key === "Enter") salvarEdicaoFav(); if (e.key === "Escape") { setFavEditId(null); setNomeFav(""); } }}
                              placeholder="Nome da visão" aria-label="Novo nome do favorito"
                              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 text-[0.8125rem] text-foreground placeholder:text-muted-foreground focus-visible:border-amber-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50" />
                            <button type="button" onClick={salvarEdicaoFav} disabled={!nomeFav.trim() || dup} aria-label="Salvar nome" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-amber-600 transition-colors hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-amber-400"><Check className="size-3.5" /></button>
                            <button type="button" onClick={() => { setFavEditId(null); setNomeFav(""); }} aria-label="Cancelar" className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-500"><X className="size-3.5" /></button>
                          </div>
                          <p className="mt-1 px-1 text-xs">{dup ? <span className="text-rose-500">Já existe um favorito com esse nome.</span> : <span className="text-muted-foreground">Muda só o nome; os filtros ficam.</span>}</p>
                        </div>
                      );
                    })() : (
                      <div key={f.id} className="group flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-accent">
                        <button type="button" onClick={() => { aplicarFavorito(f); close(); }} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left text-[0.8125rem] text-foreground">
                          <Star className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span className="truncate">{f.nome}</span>
                        </button>
                        <button type="button" onClick={() => { setSalvarOpen(false); setFavEditId(f.id); setNomeFav(f.nome); }} aria-label={`Renomear ${f.nome}`} className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:text-amber-600"><Pencil className="size-3.5" /></button>
                        <button type="button" onClick={() => setFavoritos((prev) => prev.filter((x) => x.id !== f.id))} aria-label="Excluir favorito" className="shrink-0 cursor-pointer rounded p-1 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground hover:text-rose-500"><Trash2 className="size-3.5" /></button>
                      </div>
                    )))}
                  </div>
                </div>
              </div>
              </>)}
            </div>
          )}
        </Popover>
      </div>

      {/* contador + remover ordenação (só na lista). No detalhe o contador de
          pedidos não faz sentido; fica só um respiro antes da ficha do pedido. */}
      {detalhe ? (
        <div className="mb-2 shrink-0" aria-hidden />
      ) : (
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5">
        {sorts.length > 0 && (
          <button type="button" onClick={() => setSorts([])} className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <ArrowUpDown className="size-3.5" /> Remover ordenação
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{lista.length} de {base.length} {labelRegistro}</span>
      </div>
      )}

      {/* ===== VISÃO LISTA ===== */}
      {view === "lista" && (
        <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card", detalhe && "hidden")}>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <table style={colFixo ? { width: larguraTotal } : undefined} className={cn(colFixo ? "table-fixed" : compacto ? "w-max table-auto" : "w-full min-w-[60rem] table-auto", compacto ? "text-xs" : "text-sm")}>
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
                    // Realce das divisórias vizinhas por MANIPULAÇÃO DIRETA do DOM (sem state, sem
                    // re-render): acende a divisória desta coluna e a da anterior. Antes era
                    // `setHoverCol`, que re-renderizava a tabela inteira a cada movimento do mouse.
                    return (
                      <th key={c.key} ref={setRef(c.key)}
                        onMouseEnter={(e) => { if (arrastandoRef.current) return; const th = e.currentTarget; th.querySelector("[data-rz]")?.setAttribute("data-rz-realce", ""); (th.previousElementSibling as HTMLElement | null)?.querySelector("[data-rz]")?.setAttribute("data-rz-realce", ""); }}
                        onMouseLeave={(e) => { const th = e.currentTarget; th.querySelector("[data-rz]")?.removeAttribute("data-rz-realce"); (th.previousElementSibling as HTMLElement | null)?.querySelector("[data-rz]")?.removeAttribute("data-rz-realce"); }}
                        className={cn("group/th relative overflow-hidden text-left font-medium", primeira ? (expandirRow ? "pl-8 pr-4" : "pl-4 pr-4") : "px-4", compacto ? "py-1.5" : "py-2", alinhar === "right" && "text-right", alinhar === "center" && "text-center")}>
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
                        <ResizeHandle
                          onPointerDown={(e) => iniciarResize(e, c.key, compacto ? () => setColunasMexidasCompacto((prev) => (prev.has(c.key) ? prev : new Set(prev).add(c.key))) : undefined)}
                          onReset={() => {
                            if (!compacto) { resetColuna(c.key); return; }
                            // Compacto: volta pra REGRA , desmarca a coluna (volta ao corte de 32) e
                            // anima até a largura-regra guardada (sem remedir, sem engasgo).
                            setColunasMexidasCompacto((prev) => { if (!prev.has(c.key)) return prev; const n = new Set(prev); n.delete(c.key); return n; });
                            if (larguraRegraRef.current[c.key] != null) resetColuna(c.key, larguraRegraRef.current[c.key]);
                            else setMedindoCompacto(true);
                          }}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {linhasTabela}
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
        <div className={cn("min-h-0 flex-1 overflow-auto", detalhe && "hidden")}>
          <KanbanView lista={lista} campo={kanbanDim || kanbanCampo} campoByKey={campoByLike} tituloItem={tituloItem} subtituloItem={subtituloItem} valorItem={valorItem} onAbrir={(r) => abrirDetalhe(r, listaOrdenada.indexOf(r))} />
        </div>
      )}

      {/* ===== CALENDÁRIO ===== */}
      {view === "calendario" && calendarioCampo && (
        <div className={cn("min-h-0 flex-1 overflow-auto", detalhe && "hidden")}>
          <CalendarioView lista={lista} campoData={calendarioCampo} colunaByKey={colunaByKey as unknown as Record<string, { valor: (r: T) => string | number }>} tituloItem={tituloItem} valorItem={valorItem} onAbrir={(r) => abrirDetalhe(r, listaOrdenada.indexOf(r))} />
        </div>
      )}

      {/* ===== DETALHE DO PEDIDO (todas as views) =====
          A lista/kanban/calendário continuam MONTADOS (só escondidos com `hidden`)
          logo acima: assim o "Voltar" devolve a mesma view, página e posição de
          scroll. Os filtros/busca de origem são restaurados pelo snapshot
          (fecharDetalhe), já que dentro do detalhe a pessoa pode reescopá-los. */}
      {detalhe && (
        <div className="flex min-h-0 flex-1 flex-col">
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
            onVoltar={fecharDetalhe}
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
        <FiltroAvancado open onClose={() => setAvancadoOpen(false)} base={base} inicial={arvore} onAplicar={(a) => setArvore(a)} campos={camposUI} campoBy={campoByUI} campoPadrao={campoPadrao} rotulos={Object.fromEntries(colunas.map((c) => [c.key, c.label]))} />
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
  celula: (row: T, key: string, truncar?: boolean) => React.ReactNode;
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
