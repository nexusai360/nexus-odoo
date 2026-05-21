"use client";

import { useState } from "react";
import {
  BookOpen,
  Code,
  Edit,
  Layers,
  Search,
  ShieldAlert,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { CatalogByModule, CatalogToolItem } from "@/lib/actions/mcp-catalog-schema";

// ──────────────────────────────────────────────────────────────────────────────
// Module label map
// ──────────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────────
// Tool card
// ──────────────────────────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: CatalogToolItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-background/60 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {tool.operation === "write" ? (
            <Edit className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
          ) : (
            <BookOpen className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <code className="text-xs font-mono text-foreground break-all">{tool.id}</code>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              {tool.descricao}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {tool.sensitive && (
            <Badge
              variant="outline"
              className="text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1"
            >
              <ShieldAlert className="h-3 w-3" />
              Sensível
            </Badge>
          )}
          {tool.capability && (
            <Badge variant="outline" className="text-[10px] font-mono hidden sm:inline-flex">
              {tool.capability}
            </Badge>
          )}
          {tool.addedInVersion && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              v{tool.addedInVersion}
            </Badge>
          )}
        </div>
      </div>

      {tool.examples.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <Code className="h-3 w-3" />
            {expanded ? "Ocultar" : "Ver"} exemplo
          </button>
          {expanded && (
            <div className="mt-2 space-y-2">
              {tool.examples.map((ex, i) => (
                <div key={i} className="space-y-1">
                  {ex.description && (
                    <p className="text-[11px] text-muted-foreground">{ex.description}</p>
                  )}
                  <pre className="text-[11px] font-mono bg-muted/60 border border-border rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                    <code>{ex.code}</code>
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Module section
// ──────────────────────────────────────────────────────────────────────────────

function ModuleSection({ data, query }: { data: CatalogByModule; query: string }) {
  const q = query.toLowerCase().trim();

  const readTools = data.readTools.filter(
    (t) => !q || t.id.toLowerCase().includes(q) || t.descricao.toLowerCase().includes(q),
  );
  const writeTools = data.writeTools.filter(
    (t) => !q || t.id.toLowerCase().includes(q) || t.descricao.toLowerCase().includes(q),
  );

  if (readTools.length === 0 && writeTools.length === 0) return null;

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Layers className="h-4 w-4 text-muted-foreground" />
          {moduleLabel(data.module)}
          <span className="text-xs text-muted-foreground font-normal font-mono">{data.module}</span>
          <div className="flex items-center gap-1 ml-auto">
            {readTools.length > 0 && (
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {readTools.length} read
              </Badge>
            )}
            {writeTools.length > 0 && (
              <Badge variant="outline" className="text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400">
                {writeTools.length} write
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        {readTools.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <BookOpen className="h-3 w-3" />
              Como ler
            </p>
            <div className="space-y-2">
              {readTools.map((t) => (
                <ToolCard key={t.id} tool={t} />
              ))}
            </div>
          </div>
        )}
        {readTools.length > 0 && writeTools.length > 0 && <Separator />}
        {writeTools.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Edit className="h-3 w-3" />
              Como escrever
            </p>
            <div className="space-y-2">
              {writeTools.map((t) => (
                <ToolCard key={t.id} tool={t} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// DocsCatalog — main component
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  catalog: CatalogByModule[];
}

export function DocsCatalog({ catalog }: Props) {
  const [query, setQuery] = useState("");

  const totalRead = catalog.reduce((s, m) => s + m.readTools.length, 0);
  const totalWrite = catalog.reduce((s, m) => s + m.writeTools.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {totalRead + totalWrite} tools em {catalog.length} módulos
          </p>
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            {totalRead} read
          </Badge>
          <Badge variant="outline" className="text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400">
            {totalWrite} write
          </Badge>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrar tools…"
            className="pl-8 h-8 text-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Modules */}
      {catalog.map((mod) => (
        <ModuleSection key={mod.module} data={mod} query={query} />
      ))}

      {/* Empty state */}
      {catalog.every(
        (m) =>
          m.readTools.filter(
            (t) =>
              !query ||
              t.id.toLowerCase().includes(query.toLowerCase()) ||
              t.descricao.toLowerCase().includes(query.toLowerCase()),
          ).length === 0 &&
          m.writeTools.filter(
            (t) =>
              !query ||
              t.id.toLowerCase().includes(query.toLowerCase()) ||
              t.descricao.toLowerCase().includes(query.toLowerCase()),
          ).length === 0,
      ) && (
        <Card className="rounded-2xl border border-border bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhuma tool encontrada para &ldquo;{query}&rdquo;.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
