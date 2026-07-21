"use client";

/**
 * Primitivos de UI compartilhados pelos módulos (Popover, Modal, Checkbox,
 * Tooltip, RadioOption). Definidos no nível de módulo (nunca dentro de render)
 * para respeitar o design system Nexus e as regras de lint. Tema claro/escuro,
 * foco visível, cursor-pointer, sem overflow horizontal.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, X, ChevronDown, ChevronLeft, ChevronRight, Search, GripVertical, Lock, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

/** Checkbox controlado (seleção em lote / listas de opções). */
export function Checkbox({
  checked,
  indeterminate,
  onClick,
  ariaLabel = "Selecionar",
}: {
  checked: boolean;
  indeterminate?: boolean;
  onClick: (e: React.MouseEvent) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "flex size-4 items-center justify-center rounded border transition-colors",
        checked || indeterminate
          ? "border-violet-600 bg-violet-600 text-white"
          : "border-border bg-card hover:border-violet-500",
      )}
    >
      {indeterminate ? <span className="h-0.5 w-2 rounded bg-white" /> : checked ? <Check className="size-3" /> : null}
    </button>
  );
}

/** Marca de seleção VISUAL (span, não botão) , para usar dentro de botões/labels. */
export function CheckboxView({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
        checked ? "border-violet-600 bg-violet-600 text-white" : "border-border bg-card",
      )}
    >
      {checked && <Check className="size-3" />}
    </span>
  );
}

export interface OpcaoSelect { value: string; label: string; hint?: string }

/** Combobox custom (design system Nexus) , substitui o <select> nativo. Busca
 * opcional, teclado (Esc), clique fora, tema claro/escuro. */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Selecione...",
  searchable = true,
  align = "left",
  triggerClassName,
  ariaLabel,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (OpcaoSelect | string)[];
  placeholder?: string;
  searchable?: boolean;
  align?: "left" | "right";
  triggerClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const norm: OpcaoSelect[] = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const atual = norm.find((o) => o.value === value);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? norm.filter((o) => o.label.toLowerCase().includes(q)) : norm;
  }, [busca, norm]);

  useEffect(() => {
    if (disabled) { setOpen(false); return; }
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // Anexa no próximo tick para NUNCA capturar o mesmo clique que abriu o menu
    // (era isso que fazia o dropdown "abrir e sumir" na hora).
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, disabled]);

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        type="button"
        onClick={(e) => { if (disabled) return; e.stopPropagation(); setOpen((v) => !v); setBusca(""); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !atual && "text-muted-foreground")}>{atual?.label ?? placeholder}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className={cn("absolute top-10 z-50 w-full min-w-[13rem] rounded-xl border border-border bg-popover p-1 shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95", align === "right" ? "right-0" : "left-0")}>
          {searchable && norm.length > 6 && (
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {lista.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                  o.value === value ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Check className={cn("size-4 shrink-0", o.value === value ? "text-violet-500" : "text-transparent")} />
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.hint && <span className="shrink-0 text-[0.65rem] uppercase text-muted-foreground/60">{o.hint}</span>}
              </button>
            ))}
            {lista.length === 0 && <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">Nada encontrado</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Opção de lista com marca de seleção (radio-like). */
export function RadioOption({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
        ativo ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Check className={cn("size-4 shrink-0", ativo ? "text-violet-500" : "text-transparent")} />
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

/** Botão + popover (fecha ao clicar fora / Esc). `children` recebe `close`. */
export function Popover({
  trigger,
  children,
  align = "left",
  width = "w-64",
  panelClassName,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement | null> }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v), ref: btnRef })}
      {open && (
        <div
          className={cn(
            "absolute top-11 z-40 rounded-xl border border-border bg-popover p-1.5 shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95",
            align === "right" ? "right-0" : "left-0",
            width,
            panelClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Tooltip simples , aparece SÓ no hover (some ao tirar o mouse, não trava no
 * clique). A acessibilidade fica pelo aria-label do próprio gatilho. */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 shadow-md transition-opacity duration-150 group-hover/tt:opacity-100">
        {label}
      </span>
    </span>
  );
}

/** Modal centralizado com scrim (fecha no Esc / clique no scrim / botão X). */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const maxW = size === "xl" ? "max-w-4xl" : size === "lg" ? "max-w-2xl" : "max-w-lg";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 my-4 w-full rounded-2xl border border-border bg-card shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95",
          maxW,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Botão primário / secundário / fantasma padronizados. */
export function Btn({
  variant = "ghost",
  className,
  children,
  ...props
}: {
  variant?: "primary" | "outline" | "ghost" | "danger";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
  const styles = {
    primary: "bg-violet-600 text-white hover:bg-violet-700",
    outline: "border border-border bg-card text-foreground hover:bg-accent",
    ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
    danger: "text-rose-600 hover:bg-rose-500/10 dark:text-rose-400",
  }[variant];
  return (
    <button type="button" className={cn(base, styles, className)} {...props}>
      {children}
    </button>
  );
}

/**
 * SeletorColunas , escolha e ORDENAÇÃO das colunas de uma tabela. Separa ORDEM
 * (arrastar para reordenar) de VISIBILIDADE (checkbox). Colunas obrigatórias ficam
 * sempre visíveis, travadas e no topo. Busca no topo, selecionar tudo / limpar. O
 * painel abre em portal (fixed) para não ser cortado pelo overflow da tabela; e,
 * enquanto aberto, mantém a tabela rolada até a extremidade (o gatilho fica no fim
 * da tabela) para o seletor nunca sair do campo de visão.
 */
export interface ColunaOpc { key: string; label: string; obrigatoria?: boolean }

export function SeletorColunas({
  colunas,
  ordem,
  visiveis,
  onOrdemChange,
  onVisiveisChange,
  scrollRef,
  rotulo,
}: {
  colunas: ColunaOpc[];
  ordem: string[];
  visiveis: string[];
  onOrdemChange: (next: string[]) => void;
  onVisiveisChange: (next: string[]) => void;
  scrollRef?: React.RefObject<HTMLElement | null>;
  /** Quando presente, o gatilho vira um botão de barra com texto (ex.: "Colunas"). */
  rotulo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  // Drag por pointer events (reordenação AO VIVO, sem o drag nativo do navegador).
  const [drag, setDrag] = useState<{ key: string; from: number; startY: number; dy: number; h: number; startScroll: number; scroll: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Lista rolável + Y atual do ponteiro: base do auto-scroll durante o arraste.
  const listaRef = useRef<HTMLDivElement>(null);
  const pointerYRef = useRef(0);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const byKey = useMemo(() => Object.fromEntries(colunas.map((c) => [c.key, c])), [colunas]);
  // Ordem completa (todas as colunas do catálogo), obrigatórias primeiro.
  const ordemFull = useMemo(() => {
    const vistos = new Set(ordem);
    const todas = [...ordem.filter((k) => byKey[k]), ...colunas.map((c) => c.key).filter((k) => !vistos.has(k))];
    const obg = todas.filter((k) => byKey[k]?.obrigatoria);
    const rest = todas.filter((k) => !byKey[k]?.obrigatoria);
    return [...obg, ...rest];
  }, [ordem, colunas, byKey]);

  const buscando = busca.trim().length > 0;
  const filtradas = ordemFull.filter((k) => byKey[k]?.label.toLowerCase().includes(busca.trim().toLowerCase()));

  function reposition() {
    const b = btnRef.current?.getBoundingClientRect();
    if (b) setPos({ top: b.bottom + 6, right: Math.max(8, window.innerWidth - b.right) });
  }

  useLayoutEffect(() => {
    if (!open) return;
    if (scrollRef?.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    reposition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visiveis]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onMove = () => reposition();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  function toggle(k: string) {
    if (byKey[k]?.obrigatoria) return;
    onVisiveisChange(visiveis.includes(k) ? visiveis.filter((x) => x !== k) : [...visiveis, k]);
  }
  function selecionarTudo() { onVisiveisChange(colunas.map((c) => c.key)); }
  function limpar() { onVisiveisChange(colunas.filter((c) => c.obrigatoria).map((c) => c.key)); }

  // Índice onde o item cairá, dado o deslocamento atual (clampado abaixo das obrigatórias).
  const nObg = ordemFull.filter((k) => byKey[k]?.obrigatoria).length;
  // Deslocamento EFETIVO = movimento do cursor + quanto a lista rolou desde o início
  // do arraste. É o que torna o auto-scroll significativo: rolar a lista equivale a
  // arrastar mais para aquele lado.
  function deslocDe(d: { dy: number; startScroll: number; scroll: number }) {
    return d.dy + (d.scroll - d.startScroll);
  }
  function alvoDe(d: { from: number; dy: number; h: number; startScroll: number; scroll: number }) {
    const passos = Math.round(deslocDe(d) / d.h);
    return Math.min(Math.max(d.from + passos, nObg), ordemFull.length - 1);
  }
  function iniciarDrag(e: React.PointerEvent, key: string, from: number) {
    if (byKey[key]?.obrigatoria || buscando) return;
    const row = (e.currentTarget as HTMLElement).parentElement;
    const h = row?.getBoundingClientRect().height || 34;
    const sc = listaRef.current?.scrollTop ?? 0;
    pointerYRef.current = e.clientY;
    setDrag({ key, from, startY: e.clientY, dy: 0, h, startScroll: sc, scroll: sc });
  }
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const mover = (e: PointerEvent) => {
      pointerYRef.current = e.clientY;
      setDrag((d) => (d ? { ...d, dy: e.clientY - d.startY } : d));
    };
    // Auto-scroll: com o cursor perto do topo/fundo da lista, rola sozinho (velocidade
    // proporcional à profundidade na zona de borda), permitindo mover a coluna para
    // fora da parte visível, tanto para cima quanto para baixo.
    const tick = () => {
      const el = listaRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const EDGE = 48;
        const MAX = 16;
        const y = pointerYRef.current;
        let delta = 0;
        if (y < r.top + EDGE) delta = -Math.ceil(MAX * Math.min(1, (r.top + EDGE - y) / EDGE));
        else if (y > r.bottom - EDGE) delta = Math.ceil(MAX * Math.min(1, (y - (r.bottom - EDGE)) / EDGE));
        if (delta) {
          const max = el.scrollHeight - el.clientHeight;
          const next = Math.max(0, Math.min(max, el.scrollTop + delta));
          if (next !== el.scrollTop) {
            el.scrollTop = next;
            setDrag((d) => (d ? { ...d, scroll: next } : d));
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // `drag` aqui é o do closure do effect, que re-roda a cada mudança de drag (está
    // nas deps), então no pointerup ele é o estado mais recente. Fazemos o reorder
    // FORA do updater de setDrag (senão chamaríamos setState do pai durante o render).
    const soltar = () => {
      const to = alvoDe(drag);
      if (to !== drag.from) {
        const arr = [...ordemFull];
        const [movido] = arr.splice(drag.from, 1);
        arr.splice(to, 0, movido);
        onOrdemChange(arr);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, ordemFull, nObg]);

  // Transform de cada linha durante o arraste: o item arrastado segue o cursor e os
  // demais abrem espaço, dando o feedback ao vivo de onde ele vai parar.
  function transformDe(i: number): string | undefined {
    if (!drag) return undefined;
    if (filtradas[i] === drag.key) return `translateY(${deslocDe(drag)}px)`;
    const to = alvoDe(drag);
    if (drag.from < to && i > drag.from && i <= to) return `translateY(${-drag.h}px)`;
    if (to < drag.from && i >= to && i < drag.from) return `translateY(${drag.h}px)`;
    return "translateY(0px)";
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Escolher colunas"
        aria-expanded={open}
        className={cn(
          rotulo
            ? "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors"
            : "flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors",
          rotulo
            ? open
              ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300"
              : "border-border bg-card text-foreground hover:bg-accent"
            : open
              ? "bg-violet-500/15 text-violet-600 dark:text-violet-300"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <SlidersHorizontal className="size-4" />
        {rotulo && <span>{rotulo}</span>}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos?.top ?? -9999, right: pos?.right ?? 0 }}
          className="z-[120] w-72 rounded-xl border border-border bg-popover p-2 shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
        >
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar coluna..." className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">Colunas</span>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={selecionarTudo} className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-violet-600 hover:bg-accent dark:text-violet-400">Selecionar tudo</button>
              <button type="button" onClick={limpar} className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">Limpar</button>
            </div>
          </div>
          {!buscando && <p className="mb-1 px-1 text-[0.7rem] text-muted-foreground/70">Arraste pela alça para reordenar.</p>}
          <div ref={listaRef} className={cn("max-h-72 space-y-0.5 overflow-y-auto", drag && "select-none")}>
            {filtradas.map((k, i) => {
              const c = byKey[k];
              if (!c) return null;
              const on = !!c.obrigatoria || visiveis.includes(k);
              const arrastavel = !c.obrigatoria && !buscando;
              const arrastado = drag?.key === k;
              return (
                <div
                  key={k}
                  style={{ transform: transformDe(i), transition: arrastado ? "none" : "transform 160ms cubic-bezier(0.2,0,0,1)" }}
                  className={cn(
                    "relative flex items-center gap-2 rounded-lg px-1.5 py-1.5",
                    arrastado ? "z-10 bg-popover shadow-lg ring-1 ring-violet-500/50" : drag ? "" : "transition-colors hover:bg-accent",
                  )}
                >
                  {arrastavel ? (
                    <span
                      onPointerDown={(e) => iniciarDrag(e, k, i)}
                      role="button"
                      aria-label={`Reordenar ${c.label}`}
                      className={cn("flex shrink-0 touch-none items-center text-muted-foreground/50 hover:text-muted-foreground", arrastado ? "cursor-grabbing" : "cursor-grab")}
                    >
                      <GripVertical className="size-3.5" />
                    </span>
                  ) : (
                    <span className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <button type="button" onClick={() => toggle(k)} disabled={c.obrigatoria} className={cn("flex min-w-0 flex-1 items-center gap-2 text-left text-sm", c.obrigatoria ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer text-foreground")}>
                    <CheckboxView checked={on} />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {c.obrigatoria && <Lock className="size-3 shrink-0 text-muted-foreground/60" />}
                  </button>
                </div>
              );
            })}
            {filtradas.length === 0 && <p className="px-2 py-3 text-center text-sm text-muted-foreground">Nenhuma coluna encontrada.</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * useResizeColunas , larguras de coluna redimensionáveis por arrastar a divisória do
 * cabeçalho. Mede a largura natural na primeira renderização (tabela em `table-auto`)
 * e guarda; a partir daí a tabela vira `table-fixed` com as larguras salvas (persistidas).
 * Min ~3 caracteres, max ~largura da tela. As células truncam com reticências.
 */
export function useResizeColunas(storageKey: string, containerRef?: React.RefObject<HTMLElement | null>) {
  const [larguras, setLarguras] = useState<Record<string, number>>({});
  const [hidratado, setHidratado] = useState(false);
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const [drag, setDrag] = useState<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    try { const r = window.localStorage.getItem(storageKey); if (r) setLarguras(JSON.parse(r)); } catch { /* ignore */ }
    setHidratado(true);
  }, [storageKey]);
  useEffect(() => {
    if (!hidratado) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(larguras)); } catch { /* ignore */ }
  }, [hidratado, storageKey, larguras]);

  const setRef = useCallback((key: string) => (el: HTMLTableCellElement | null) => { thRefs.current[key] = el; }, []);

  // Mede as colunas que ainda não têm largura salva (após render em table-auto).
  const medirFaltantes = useCallback((keys: string[]) => {
    setLarguras((prev) => {
      let mudou = false;
      const next = { ...prev };
      keys.forEach((k) => {
        if (next[k] == null) {
          const el = thRefs.current[k];
          if (el) { next[k] = Math.round(el.getBoundingClientRect().width); mudou = true; }
        }
      });
      return mudou ? next : prev;
    });
  }, []);

  const iniciarResize = useCallback((e: React.PointerEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    const el = thRefs.current[key];
    const startW = el ? el.getBoundingClientRect().width : (larguras[key] ?? 150);
    setDrag({ key, startX: e.clientX, startW });
  }, [larguras]);

  // Duplo-clique na alça: ajusta a coluna ao MENOR tamanho que mostra TODO o conteúdo
  // sem abreviar. Mede a largura NATURAL da coluna deixando a tabela em `table-auto`
  // por um instante: o navegador dimensiona a coluna ao MAIOR conteúdo entre o
  // CABEÇALHO (título + setas de ordenar) e TODAS as células visíveis (incluindo a
  // tag do pedido com ícone e o chevron do dropdown). Medimos e restauramos na mesma
  // passada síncrona, sem repaint. Funciona encolhendo e aumentando.
  const resetColuna = useCallback((key: string) => {
    const th = thRefs.current[key];
    const table = th?.closest("table") as HTMLTableElement | null;
    if (!th || !table || typeof document === "undefined") {
      setLarguras((prev) => { const next = { ...prev }; delete next[key]; return next; });
      return;
    }
    const cols = Array.from(table.querySelectorAll("colgroup col")) as HTMLElement[];
    const larguraPrev = cols.map((c) => c.style.width);
    const layoutPrev = table.style.tableLayout;
    table.style.tableLayout = "auto";
    cols.forEach((c) => { c.style.width = "auto"; });
    const natural = th.getBoundingClientRect().width; // força layout, já com padding
    table.style.tableLayout = layoutPrev;
    cols.forEach((c, i) => { c.style.width = larguraPrev[i]; });
    const MIN = 56;
    const visivel = containerRef?.current?.clientWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1200);
    const MAX = Math.max(MIN + 40, Math.round(visivel * 0.85));
    const largura = Math.min(Math.max(Math.ceil(natural) + 2, MIN), MAX);
    setLarguras((prev) => ({ ...prev, [key]: largura }));
  }, [containerRef]);

  useEffect(() => {
    if (!drag) return;
    const MIN = 56; // ~3 caracteres + padding
    // Máximo = 85% da largura VISÍVEL da tabela (não deixa a coluna estourar a tela).
    const visivel = containerRef?.current?.clientWidth ?? (typeof window !== "undefined" ? window.innerWidth : 1200);
    const MAX = Math.max(MIN + 40, Math.round(visivel * 0.85));
    const mover = (e: PointerEvent) => setLarguras((prev) => ({ ...prev, [drag.key]: Math.min(Math.max(Math.round(drag.startW + (e.clientX - drag.startX)), MIN), MAX) }));
    const soltar = () => setDrag(null);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); window.removeEventListener("pointercancel", soltar); };
  }, [drag, containerRef]);

  return { larguras, setRef, medirFaltantes, iniciarResize, resetColuna, resizingKey: drag?.key ?? null };
}

/** Alça de redimensionamento na divisória direita do cabeçalho (cursor col-resize).
 * Duplo-clique restaura a largura original da coluna. */
export function ResizeHandle({ onPointerDown, onReset, ativo }: { onPointerDown: (e: React.PointerEvent) => void; onReset?: () => void; ativo?: boolean }) {
  return (
    <span
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); onReset?.(); }}
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar coluna (duplo-clique restaura)"
      title="Arraste para redimensionar · duplo-clique para restaurar"
      className="group/rz absolute right-0 top-0 z-20 flex h-full w-3 -translate-x-0.5 cursor-col-resize touch-none select-none items-center justify-center"
    >
      <span className={cn("w-0.5 rounded-full transition-all", ativo ? "h-2/3 bg-violet-500" : "h-1/2 bg-transparent group-hover/th:h-2/3 group-hover/th:bg-violet-400/50 group-hover/rz:bg-violet-400/90")} />
    </span>
  );
}

/** Dropdown que abre PARA CIMA (para uso em rodapés). Fecha ao clicar fora / Esc. */
function DropUp({ label, width = "w-44", children }: { label: ReactNode; width?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label} <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className={cn("absolute bottom-full right-0 z-50 mb-2 rounded-xl border border-border bg-popover p-1 shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95", width)}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/**
 * Paginacao , rodapé no padrão do Nexus Odoo: esquerda "Mostrando X-Y de Z";
 * centro setas + "Página N de M" (dropdown com busca para ir direto); direita
 * "N por página" (50 / 100 / 500). Tudo abrindo para cima para não estourar.
 */
export function Paginacao({
  total,
  pagina,
  porPagina,
  onPagina,
  onPorPagina,
  opcoesPorPagina = [50, 100, 500],
  rotulo = "registros",
}: {
  total: number;
  pagina: number;
  porPagina: number;
  onPagina: (p: number) => void;
  onPorPagina: (n: number) => void;
  opcoesPorPagina?: number[];
  rotulo?: string;
}) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = total === 0 ? 0 : (atual - 1) * porPagina + 1;
  const fim = Math.min(total, atual * porPagina);
  const [buscaPag, setBuscaPag] = useState("");
  const paginas = Array.from({ length: totalPaginas }, (_, i) => i + 1).filter((n) => !buscaPag.trim() || String(n).includes(buscaPag.trim()));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">
        {total === 0 ? `Nenhum ${rotulo.replace(/s$/, "")}` : <>Mostrando <span className="tabular-nums text-foreground">{inicio}-{fim}</span> de <span className="tabular-nums text-foreground">{total}</span> {rotulo}</>}
      </span>

      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onPagina(atual - 1)} disabled={atual <= 1} aria-label="Página anterior" className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card">
          <ChevronLeft className="size-4" />
        </button>
        <DropUp width="w-52" label={<span className="tabular-nums">Página {atual} de {totalPaginas}</span>}>
          {(close) => (
            <div>
              <div className="relative mb-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input autoFocus value={buscaPag} onChange={(e) => setBuscaPag(e.target.value)} placeholder={`Ir para a página (1 a ${totalPaginas})`} inputMode="numeric" className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {paginas.map((n) => (
                  <button key={n} type="button" onClick={() => { onPagina(n); setBuscaPag(""); close(); }} className={cn("flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors", n === atual ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                    <span className="tabular-nums">Página {n}</span>
                    {n === atual && <span className="text-[0.65rem] uppercase text-muted-foreground/70">atual</span>}
                  </button>
                ))}
                {paginas.length === 0 && <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">Nada encontrado</p>}
              </div>
            </div>
          )}
        </DropUp>
        <button type="button" onClick={() => onPagina(atual + 1)} disabled={atual >= totalPaginas} aria-label="Próxima página" className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card">
          <ChevronRight className="size-4" />
        </button>
      </div>

      <DropUp width="w-40" label={<span className="tabular-nums">{porPagina} por página</span>}>
        {(close) => (
          <div>
            {opcoesPorPagina.map((n) => (
              <button key={n} type="button" onClick={() => { onPorPagina(n); close(); }} className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors", n === porPagina ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
                <Check className={cn("size-4 shrink-0", n === porPagina ? "text-violet-500" : "text-transparent")} />
                <span className="tabular-nums">{n} por página</span>
              </button>
            ))}
          </div>
        )}
      </DropUp>
    </div>
  );
}
