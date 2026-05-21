"use client";

import { useState } from "react";
import { ChevronDown, Search, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CatalogByModule, CatalogToolItem } from "@/lib/actions/mcp-catalog-schema";

const MODULE_LABELS: Record<string, string> = {
  estoque: "Estoque",
  financeiro: "Financeiro",
  comercial: "Comercial",
  fiscal: "Fiscal",
  cadastros: "Cadastros",
  contabil: "Contábil",
  crm: "CRM",
  outros: "Outros",
};

function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

function matchesQuery(t: CatalogToolItem, q: string): boolean {
  if (!q) return true;
  return t.id.toLowerCase().includes(q) || t.descricao.toLowerCase().includes(q);
}

// ──────────────────────────────────────────────────────────────────────────────
// Linha de tool — expansível, estilo endpoint do NFE
// ──────────────────────────────────────────────────────────────────────────────

function ToolRow({ tool }: { tool: CatalogToolItem }) {
  const [expanded, setExpanded] = useState(false);
  const isWrite = tool.operation === "write";

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors"
      >
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide border",
            isWrite
              ? "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {isWrite ? "Write" : "Read"}
        </span>
        <div className="flex-1 min-w-0">
          <code className="text-sm font-mono text-foreground break-all">{tool.id}</code>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{tool.descricao}</p>
        </div>
        {tool.sensitive && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-3 w-3" />
            Sensível
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2.5">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {tool.capability && (
              <span>
                Capability:{" "}
                <code className="font-mono text-foreground">{tool.capability}</code>
              </span>
            )}
            {tool.addedInVersion && <span>Disponível desde a v{tool.addedInVersion}</span>}
          </div>
          {tool.examples.length > 0 ? (
            tool.examples.map((ex, i) => (
              <div key={i} className="space-y-1">
                {ex.description && (
                  <p className="text-xs text-muted-foreground">{ex.description}</p>
                )}
                <pre className="text-xs font-mono bg-muted/50 border border-border rounded-lg p-3 overflow-x-auto leading-relaxed">
                  <code>{ex.code}</code>
                </pre>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground italic">Sem exemplo cadastrado.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Seção de módulo
// ──────────────────────────────────────────────────────────────────────────────

function ModuleSection({ data, query }: { data: CatalogByModule; query: string }) {
  const q = query.toLowerCase().trim();
  const readTools = data.readTools.filter((t) => matchesQuery(t, q));
  const writeTools = data.writeTools.filter((t) => matchesQuery(t, q));
  if (readTools.length === 0 && writeTools.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">{moduleLabel(data.module)}</h3>
        <code className="text-xs font-mono text-muted-foreground">{data.module}</code>
        <span className="text-xs text-muted-foreground ml-auto">
          {readTools.length} leitura · {writeTools.length} escrita
        </span>
      </div>
      <div className="space-y-1.5">
        {readTools.map((t) => (
          <ToolRow key={t.id} tool={t} />
        ))}
        {writeTools.map((t) => (
          <ToolRow key={t.id} tool={t} />
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DocsCatalog
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  catalog: CatalogByModule[];
}

export function DocsCatalog({ catalog }: Props) {
  const [query, setQuery] = useState("");
  const q = query.toLowerCase().trim();

  const totalRead = catalog.reduce((s, m) => s + m.readTools.length, 0);
  const totalWrite = catalog.reduce((s, m) => s + m.writeTools.length, 0);
  const anyMatch = catalog.some(
    (m) =>
      m.readTools.some((t) => matchesQuery(t, q)) ||
      m.writeTools.some((t) => matchesQuery(t, q)),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {totalRead + totalWrite} tools em {catalog.length} módulos — {totalRead} de leitura,{" "}
          {totalWrite} de escrita.
        </p>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrar tools…"
            className="pl-8 h-9 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {catalog.map((mod) => (
        <ModuleSection key={mod.module} data={mod} query={query} />
      ))}

      {!anyMatch && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-12 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            Nenhuma tool encontrada para &ldquo;{query}&rdquo;.
          </p>
        </div>
      )}
    </div>
  );
}
