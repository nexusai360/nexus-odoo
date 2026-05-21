"use client";

import { useState } from "react";
import { BookOpen, Layers, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { McpDocsRenderer } from "./docs-renderer";
import { DocsCatalog } from "./docs-catalog";
import type { DocSection } from "@/content/mcp-docs/index";
import type { CatalogByModule } from "@/lib/actions/mcp-catalog-schema";

interface NavSection {
  id: string;
  title: string;
  description: string;
}

const CATALOG_SECTION_ID = "__catalog__";

// ──────────────────────────────────────────────────────────────────────────────
// Sidebar
// ──────────────────────────────────────────────────────────────────────────────

function Sidebar({
  sections,
  activeId,
  onSelect,
  query,
  onQueryChange,
}: {
  sections: NavSection[];
  activeId: string;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  const filtered = sections.filter(
    (s) =>
      !query ||
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      s.description.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <nav className="w-full md:w-52 shrink-0 space-y-3 md:sticky md:top-6 md:self-start">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar seção…"
          className="pl-8 h-9 text-sm"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>

      <div className="space-y-0.5">
        {filtered.map((section) => {
          const isCatalog = section.id === CATALOG_SECTION_ID;
          const isActive = activeId === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {isCatalog ? (
                <Layers className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="flex-1 truncate">{section.title}</span>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma seção encontrada.
          </p>
        )}
      </div>
    </nav>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// McpDocsLayout
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  sections: DocSection[];
  catalog: CatalogByModule[];
}

export function McpDocsLayout({ sections, catalog }: Props) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? CATALOG_SECTION_ID);
  const [sidebarQuery, setSidebarQuery] = useState("");

  const navSections: NavSection[] = [
    ...sections.map((s) => ({ id: s.id, title: s.title, description: s.description })),
    {
      id: CATALOG_SECTION_ID,
      title: "Catálogo de Tools",
      description: "Todas as tools disponíveis por módulo.",
    },
  ];

  const activeSection = sections.find((s) => s.id === activeId);
  const isCatalog = activeId === CATALOG_SECTION_ID;

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-5xl">
      <Sidebar
        sections={navSections}
        activeId={activeId}
        onSelect={setActiveId}
        query={sidebarQuery}
        onQueryChange={setSidebarQuery}
      />

      <div className="flex-1 min-w-0">
        {isCatalog ? (
          <div className="space-y-4">
            <div className="space-y-1 pb-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">Catálogo de Tools</h2>
              <p className="text-sm text-muted-foreground">
                Todas as tools disponíveis, agrupadas por módulo — leitura e escrita separadas.
              </p>
            </div>
            <DocsCatalog catalog={catalog} />
          </div>
        ) : activeSection ? (
          <div className="max-w-2xl space-y-4">
            <div className="space-y-1 pb-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">{activeSection.title}</h2>
              <p className="text-sm text-muted-foreground">{activeSection.description}</p>
            </div>
            <McpDocsRenderer content={activeSection.content} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 py-12 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Selecione uma seção ao lado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
