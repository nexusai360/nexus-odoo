"use client";

import { useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Layers,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { McpDocsRenderer } from "./docs-renderer";
import { DocsCatalog } from "./docs-catalog";
import type { DocSection } from "@/content/mcp-docs/index";
import type { CatalogByModule } from "@/lib/actions/mcp-catalog-schema";

// ──────────────────────────────────────────────────────────────────────────────
// Section entry types for sidebar
// ──────────────────────────────────────────────────────────────────────────────

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
    <nav className="w-full md:w-52 shrink-0 space-y-2">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Buscar seção…"
          className="pl-8 h-8 text-xs"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>

      <Separator />

      {/* Nav items */}
      <div className="space-y-0.5">
        {filtered.map((section) => {
          const isCatalog = section.id === CATALOG_SECTION_ID;
          const isActive = activeId === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {isCatalog ? (
                <Layers className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="flex-1 truncate">{section.title}</span>
              {isActive && <ChevronRight className="h-3 w-3 shrink-0" />}
            </button>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-4">
            Nenhuma seção encontrada.
          </p>
        )}
      </div>
    </nav>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// McpDocsLayout — main component
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  sections: DocSection[];
  catalog: CatalogByModule[];
}

export function McpDocsLayout({ sections, catalog }: Props) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? CATALOG_SECTION_ID);
  const [sidebarQuery, setSidebarQuery] = useState("");

  const navSections: NavSection[] = [
    ...sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
    })),
    {
      id: CATALOG_SECTION_ID,
      title: "Catálogo de Tools",
      description: "Todas as tools disponíveis por módulo.",
    },
  ];

  const activeSection = sections.find((s) => s.id === activeId);
  const isCatalog = activeId === CATALOG_SECTION_ID;

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-5xl">
      {/* Sidebar */}
      <Sidebar
        sections={navSections}
        activeId={activeId}
        onSelect={setActiveId}
        query={sidebarQuery}
        onQueryChange={setSidebarQuery}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isCatalog ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                Catálogo de Tools
              </h2>
              <p className="text-xs text-muted-foreground">
                Todas as tools disponíveis, agrupadas por módulo. Read e write separadas.
              </p>
            </div>
            <DocsCatalog catalog={catalog} />
          </div>
        ) : activeSection ? (
          <Card className="rounded-xl border border-border bg-muted/30 p-2">
            <CardContent className="pt-4 pb-6 px-5">
              <div className="mb-4 space-y-1 pb-4 border-b border-border">
                <h2 className="text-base font-semibold text-foreground">
                  {activeSection.title}
                </h2>
                <p className="text-xs text-muted-foreground">{activeSection.description}</p>
              </div>
              <McpDocsRenderer content={activeSection.content} />
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-xl border border-border bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Selecione uma seção na sidebar.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
