"use client";

/**
 * B2/Backtest. Visualizador de JSON do drill-down: árvore colapsável (chevron
 * por nó objeto/array), cores de sintaxe, identação. O `JsonBlock` embrulha a
 * árvore num card com header (copiar + expandir), corpo com altura fixa e
 * scroll interno, e um modal de expansão TRAVADO dentro da largura do
 * drill-down (fundo desfocado, centralizado na vertical da tela).
 */

import * as React from "react";
import { ChevronDown, ChevronRight, Check, Clipboard, Maximize2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function Punct({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground/60">{children}</span>;
}

function Leaf({ value }: { value: unknown }) {
  if (value === null) return <span className="text-rose-400">null</span>;
  const t = typeof value;
  if (t === "string")
    return <span className="text-emerald-400">&quot;{String(value)}&quot;</span>;
  if (t === "number") return <span className="text-amber-300">{String(value)}</span>;
  if (t === "boolean") return <span className="text-sky-400">{String(value)}</span>;
  return <span className="text-foreground">{String(value)}</span>;
}

function JsonNode({
  name,
  value,
  depth,
  last,
  defaultOpenDepth,
}: {
  name?: string;
  value: unknown;
  depth: number;
  last: boolean;
  defaultOpenDepth: number;
}) {
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === "object" && !isArray;
  const collapsible = isArray || isObject;
  const [open, setOpen] = React.useState(depth < defaultOpenDepth);

  const keyPart =
    name !== undefined ? (
      <>
        <span className="text-violet-300">&quot;{name}&quot;</span>
        <Punct>: </Punct>
      </>
    ) : null;

  if (!collapsible) {
    return (
      <div className="flex items-start">
        <span className="inline-block w-4 shrink-0" aria-hidden />
        <span className="[overflow-wrap:anywhere] whitespace-pre-wrap">
          {keyPart}
          <Leaf value={value} />
          {!last && <Punct>,</Punct>}
        </span>
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);
  const openBr = isArray ? "[" : "{";
  const closeBr = isArray ? "]" : "}";
  const Chevron = open ? ChevronDown : ChevronRight;
  const toggle = () => setOpen((o) => !o);
  // Colchete/chave clicavel: hover muda a cor e mostra a mãozinha.
  const brCls =
    "cursor-pointer rounded px-0.5 text-muted-foreground/70 transition-colors hover:bg-violet-500/15 hover:text-violet-200";

  return (
    <div>
      <div className="flex items-start">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? "Recolher" : "Expandir"}
          className="mt-px inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/60 hover:text-foreground"
        >
          <Chevron className="h-3 w-3" />
        </button>
        <span className="[overflow-wrap:anywhere] whitespace-pre-wrap">
          {keyPart}
          <button type="button" onClick={toggle} title={open ? "Recolher" : "Expandir"} className={brCls}>
            {openBr}
            {!open && (
              <span className="text-muted-foreground/50"> … {entries.length} … </span>
            )}
            {!open && closeBr}
          </button>
          {!open && !last && <Punct>,</Punct>}
        </span>
      </div>
      {open && (
        <>
          {/* Linha-guia de indentação (violeta tracejado, visível). */}
          <div className="ml-[7px] border-l border-dashed border-violet-400/40 pl-3">
            {entries.map(([k, v], i) => (
              <JsonNode
                key={k}
                name={isArray ? undefined : k}
                value={v}
                depth={depth + 1}
                last={i === entries.length - 1}
                defaultOpenDepth={defaultOpenDepth}
              />
            ))}
          </div>
          <div className="flex items-start">
            <span className="inline-block w-4 shrink-0" aria-hidden />
            <span>
              <button type="button" onClick={toggle} title="Recolher" className={brCls}>
                {closeBr}
              </button>
              {!last && <Punct>,</Punct>}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function JsonViewer({
  data,
  defaultOpenDepth = 1,
}: {
  data: unknown;
  defaultOpenDepth?: number;
}) {
  return (
    <div className="font-mono text-[11px] leading-relaxed">
      <JsonNode value={data} depth={0} last defaultOpenDepth={defaultOpenDepth} />
    </div>
  );
}

/**
 * Trata JSON aninhado codificado como STRING (comum em tool results: o conteudo
 * vem como '"{...}"' escapado). Parseia recursivamente strings que sao JSON
 * valido, pra renderizar como objeto/array de verdade.
 */
export function deepParse(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === "string") {
    const t = value.trim();
    if (
      (t.startsWith("{") && t.endsWith("}")) ||
      (t.startsWith("[") && t.endsWith("]"))
    ) {
      try {
        return deepParse(JSON.parse(t), depth + 1);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => deepParse(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepParse(v, depth + 1);
    }
    return out;
  }
  return value;
}

function keySpan(name?: string) {
  if (name === undefined) return null;
  return (
    <>
      <span className="text-violet-300">&quot;{name}&quot;</span>
      <Punct>: </Punct>
    </>
  );
}

type FoldRow = {
  n: number;
  depth: number;
  path: string;
  foldable: boolean;
  collapsed: boolean;
  content: React.ReactNode;
};

// Achata o JSON em linhas visiveis (respeitando os nos recolhidos), numerando
// sequencialmente , como um editor com fold de codigo.
function buildFoldRows(value: unknown, collapsed: Set<string>): FoldRow[] {
  const rows: FoldRow[] = [];
  let n = 0;
  const walk = (
    val: unknown,
    name: string | undefined,
    depth: number,
    path: string,
    comma: boolean,
  ) => {
    const isArr = Array.isArray(val);
    const isObj = val !== null && typeof val === "object" && !isArr;
    if (!isArr && !isObj) {
      rows.push({
        n: ++n, depth, path, foldable: false, collapsed: false,
        content: (
          <>
            {keySpan(name)}
            <Leaf value={val} />
            {comma && <Punct>,</Punct>}
          </>
        ),
      });
      return;
    }
    const entries = isArr
      ? (val as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(val as Record<string, unknown>);
    const openBr = isArr ? "[" : "{";
    const closeBr = isArr ? "]" : "}";
    const isCollapsed = collapsed.has(path);
    rows.push({
      n: ++n, depth, path, foldable: true, collapsed: isCollapsed,
      content: isCollapsed ? (
        <>
          {keySpan(name)}
          <Punct>{openBr}</Punct>
          <span className="text-muted-foreground/50"> … {entries.length} … </span>
          <Punct>{closeBr}</Punct>
          {comma && <Punct>,</Punct>}
        </>
      ) : (
        <>
          {keySpan(name)}
          <Punct>{openBr}</Punct>
        </>
      ),
    });
    if (!isCollapsed) {
      entries.forEach(([k, v], i) =>
        walk(v, isArr ? undefined : k, depth + 1, `${path}/${k}`, i < entries.length - 1),
      );
      rows.push({
        n: ++n, depth, path: `${path}#close`, foldable: false, collapsed: false,
        content: (
          <>
            <Punct>{closeBr}</Punct>
            {comma && <Punct>,</Punct>}
          </>
        ),
      });
    }
  };
  walk(value, undefined, 0, "$", false);
  return rows;
}

/** Editor de código: linhas numeradas + dobramento (fold) + guias de
 *  indentação visíveis + cores. */
export function JsonCodeFold({ data }: { data: unknown }) {
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const rows = React.useMemo(() => buildFoldRows(data, collapsed), [data, collapsed]);
  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return (
    <div className="font-mono text-[11px] leading-relaxed">
      {rows.map((r) => (
        <div key={`${r.path}_${r.n}`} className="flex items-stretch hover:bg-muted/30">
          <span className="w-9 shrink-0 select-none border-r border-border/60 pr-2 text-right tabular-nums text-muted-foreground/40">
            {r.n}
          </span>
          <div className="flex min-w-0 flex-1 items-start pl-2">
            {/* Guias de indentação (violeta tracejado, visíveis mas sutis). */}
            {Array.from({ length: r.depth }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className="mr-[9px] w-3.5 shrink-0 self-stretch border-l border-dashed border-violet-400/40"
              />
            ))}
            {r.foldable ? (
              <button
                type="button"
                onClick={() => toggle(r.path)}
                aria-label={r.collapsed ? "Expandir" : "Recolher"}
                className="mt-px -ml-1 mr-0.5 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground/60 hover:text-foreground"
              >
                {r.collapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            ) : (
              <span className="w-4 shrink-0" aria-hidden />
            )}
            <span className="[overflow-wrap:anywhere] whitespace-pre-wrap">
              {r.content}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function CopyBtn({ data }: { data: unknown }) {
  const [copied, setCopied] = React.useState(false);
  const onCopy = () => {
    void navigator.clipboard
      .writeText(JSON.stringify(data ?? null, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Não foi possível copiar."));
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title="Copiar JSON"
      aria-label="Copiar JSON"
      className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Clipboard className="h-3 w-3" />
      )}
    </button>
  );
}

/**
 * Card de um payload JSON: header (label + copiar + expandir), corpo com altura
 * fixa e scroll interno. O expandir abre um modal travado dentro da largura do
 * `boundsRef` (o drill-down), centralizado na vertical da tela, com o resto
 * desfocado.
 */
export function JsonBlock({
  label,
  data,
  boundsRef,
}: {
  label: string;
  data: unknown;
  boundsRef: React.RefObject<HTMLElement | null>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [rect, setRect] = React.useState<{ left: number; width: number } | null>(null);
  // Trata JSON aninhado em string e usa a versao limpa em tudo (arvore, copia,
  // editor expandido).
  const parsed = React.useMemo(() => deepParse(data), [data]);

  const openExpand = () => {
    const el = boundsRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, width: r.width });
    }
    setExpanded(true);
  };

  React.useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  const header = (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <CopyBtn data={parsed} />
        {!expanded && (
          <button
            type="button"
            onClick={openExpand}
            title="Expandir"
            aria-label="Expandir"
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      {header}
      {/* Altura encolhe pro conteúdo (sem sobra); só passa a rolar quando excede
          o teto (~176px). Cada bloco fica do tamanho do seu conteúdo. */}
      <div className="max-h-44 overflow-auto border-t border-border px-2.5 py-2">
        <JsonViewer data={parsed} />
      </div>

      {expanded && rect ? (
        <div className="fixed inset-0 z-50">
          {/* Backdrop: desfoca/escurece todo o resto, captura cliques (trava). */}
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setExpanded(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/50 backdrop-blur-sm"
          />
          {/* Painel: largura/posição horizontal do drill-down, centralizado na
              vertical da tela, altura máxima com scroll interno. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${label} (expandido)`}
            style={{
              left: rect.left,
              width: rect.width,
              top: "50%",
              transform: "translateY(-50%)",
              maxHeight: "85vh",
            }}
            className="absolute flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
              <div className="flex items-center gap-1">
                <CopyBtn data={parsed} />
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  title="Fechar"
                  aria-label="Fechar"
                  className={cn(
                    "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md",
                    "border border-border bg-background text-muted-foreground transition-colors hover:text-foreground",
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* Editor de código: linhas numeradas + fold + guias visíveis. */}
            <div className="min-h-0 flex-1 overflow-auto py-1">
              <JsonCodeFold data={parsed} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
