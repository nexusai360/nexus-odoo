"use client";

/**
 * FiltersDialog , modal de filtros com duas abas:
 * - Simples: accordion de facetas (armazém, família, sentido, faixaDias)
 *   com campo de busca + lista de checkboxes + "Selecionar todos".
 * - Avançado: construtor recursivo de condições E/OU.
 *
 * "Aplicar" grava na URL via searchParams; "Limpar todos" zera o draft da
 * aba ativa. Botão "Filtros" na barra do relatório abre o diálogo.
 *
 * Design (ui-ux-pro-max §1/§2/§8):
 * - progressive-disclosure: accordion , apenas 1 seção aberta por vez
 * - touch targets ≥ 36px em checkboxes e botões
 * - aria-labels descritivos; anel de foco visível em todos os interativos
 * - sem emoji; ícones lucide
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Filter,
  RotateCcw,
  Warehouse,
  Layers,
  ArrowLeftRight,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FilterOptions } from "@/components/reports/report-filters";
import { type Grupo, grupoVazio } from "@/lib/reports/filtro-avancado";
import { GrupoBuilder } from "@/components/reports/filtro-avancado-builder";

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

/** Faceta do modo Simples: um campo com lista de opções. */
interface Faceta {
  key: string;
  rotulo: string;
  icon: React.ReactNode;
  opcoes: { value: string; label: string }[];
}

/** Estado do modo Simples: seleção por faceta. */
type SimpleState = Record<string, Set<string>>;

type TabMode = "simples" | "avancado";

// ---------------------------------------------------------------------------
// Componente de faceta (accordion + busca + checkboxes)
// ---------------------------------------------------------------------------

interface FacetSectionProps {
  faceta: Faceta;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  open: boolean;
  onToggle: () => void;
}

function FacetSection({
  faceta,
  selected,
  onChange,
  open,
  onToggle,
}: FacetSectionProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Foca o campo de busca ao abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faceta.opcoes;
    return faceta.opcoes.filter((o) => o.label.toLowerCase().includes(q));
  }, [faceta.opcoes, query]);

  const allSelected =
    filtered.length > 0 && filtered.every((o) => selected.has(o.value));

  function toggleAll() {
    const next = new Set(selected);
    if (allSelected) {
      for (const o of filtered) next.delete(o.value);
    } else {
      for (const o of filtered) next.add(o.value);
    }
    onChange(next);
  }

  function toggleOne(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  const count = selected.size;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header do accordion */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`facet-${faceta.key}`}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors",
          "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          open && "bg-muted/30",
        )}
      >
        <span className="text-muted-foreground">{faceta.icon}</span>
        <span className="flex-1 text-left">{faceta.rotulo}</span>
        {count > 0 && (
          <span className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-violet-500">
            {count}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Corpo do accordion */}
      {open && (
        <div
          id={`facet-${faceta.key}`}
          className="border-t border-border px-3 py-2 space-y-2"
        >
          {/* Campo de busca */}
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar ${faceta.rotulo.toLowerCase()}…`}
            className="h-7 text-xs"
            aria-label={`Buscar em ${faceta.rotulo}`}
          />

          {/* Selecionar todos */}
          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted/40">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              aria-label={`Selecionar todos em ${faceta.rotulo}`}
            />
            Selecionar todos
          </label>

          {/* Lista de opções */}
          <ul
            className="max-h-40 overflow-y-auto space-y-0.5"
            aria-label={`Opções de ${faceta.rotulo}`}
          >
            {filtered.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/40">
                  <Checkbox
                    checked={selected.has(o.value)}
                    onCheckedChange={() => toggleOne(o.value)}
                    aria-label={o.label}
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="py-2 text-center text-xs text-muted-foreground">
                Nenhum resultado
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FiltersDialog principal
// ---------------------------------------------------------------------------

export interface FiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: FilterOptions;
  /** Campos disponíveis para o modo Avançado. */
  campos: { value: string; label: string }[];
  /** Callback quando o usuário aplica os filtros (muda a URL). */
  onApply?: () => void;
}

function buildFacetas(options: FilterOptions): Faceta[] {
  return [
    {
      key: "armazemId",
      rotulo: "Armazém",
      icon: <Warehouse className="size-4" />,
      opcoes: options.armazens.map((a) => ({
        value: String(a.id),
        label: a.nome,
      })),
    },
    {
      key: "familiaId",
      rotulo: "Família",
      icon: <Layers className="size-4" />,
      opcoes: options.familias.map((f) => ({
        value: String(f.id),
        label: f.nome,
      })),
    },
    {
      key: "sentido",
      rotulo: "Sentido",
      icon: <ArrowLeftRight className="size-4" />,
      opcoes: [
        { value: "entrada", label: "Entradas" },
        { value: "saida", label: "Saídas" },
      ],
    },
    {
      key: "faixaDias",
      rotulo: "Faixa de dias parado",
      icon: <Clock className="size-4" />,
      opcoes: [
        { value: "30", label: "+30 dias" },
        { value: "60", label: "+60 dias" },
        { value: "90", label: "+90 dias" },
      ],
    },
  ].filter(
    (f) =>
      f.opcoes.length > 0 ||
      f.key === "sentido" ||
      f.key === "faixaDias",
  );
}

function simpleStateFromParams(
  params: URLSearchParams,
  facetas: Faceta[],
): SimpleState {
  const state: SimpleState = {};
  for (const f of facetas) {
    const raw = params.get(f.key);
    state[f.key] = raw ? new Set([raw]) : new Set();
  }
  return state;
}

export function FiltersDialog({
  open,
  onOpenChange,
  options,
  campos,
  onApply,
}: FiltersDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const facetas = useMemo(() => buildFacetas(options), [options]);

  const [tab, setTab] = useState<TabMode>("simples");
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [simpleDraft, setSimpleDraft] = useState<SimpleState>(() =>
    simpleStateFromParams(searchParams, facetas),
  );
  const [advDraft, setAdvDraft] = useState<Grupo>(grupoVazio);

  // Sync draft com params ao abrir
  useEffect(() => {
    if (!open) return;
    setSimpleDraft(simpleStateFromParams(searchParams, facetas));
    setAdvDraft(grupoVazio());
    setOpenSection(null);
    setTab("simples");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSimple = Object.values(simpleDraft).some((s) => s.size > 0);
  const hasAdvanced = advDraft.itens.length > 0;
  const hasAny = tab === "simples" ? hasSimple : hasAdvanced;

  function handleClearDraft() {
    if (tab === "simples") {
      const cleared: SimpleState = {};
      for (const f of facetas) cleared[f.key] = new Set();
      setSimpleDraft(cleared);
    } else {
      setAdvDraft(grupoVazio());
    }
  }

  const handleApply = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());

    if (tab === "simples") {
      // Para cada faceta, grava o primeiro valor selecionado (os filtros
      // atuais são single-select via searchParam). Se a faceta suportar
      // multi-select no futuro, o modelo já recebe Set<string>.
      for (const f of facetas) {
        const sel = simpleDraft[f.key];
        if (sel && sel.size > 0) {
          // Pega o primeiro valor selecionado , single-select por ora
          params.set(f.key, Array.from(sel)[0]!);
        } else {
          params.delete(f.key);
        }
      }
      // Limpa o filtro avançado se tinha algum
      params.delete("filtroAvancado");
    } else {
      // Serializa o grupo avançado como JSON na URL
      if (advDraft.itens.length > 0) {
        params.set("filtroAvancado", JSON.stringify(advDraft));
      } else {
        params.delete("filtroAvancado");
      }
      // Limpa filtros simples ao aplicar avançado
      for (const f of facetas) params.delete(f.key);
    }

    router.push(`${pathname}?${params.toString()}`);
    onApply?.();
    onOpenChange(false);
  }, [tab, simpleDraft, advDraft, facetas, searchParams, router, pathname, onApply, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[85vh] w-[min(96vw,600px)] max-w-[96vw] flex-col gap-0 p-0 sm:max-w-[600px]"
      >
        {/* Header */}
        <div className="border-b border-border px-5 py-4">
          <DialogTitle>Filtros</DialogTitle>
          <DialogDescription className="sr-only">
            Filtre os dados do relatório por facetas no modo Simples ou
            construa condições E/OU no modo Avançado.
          </DialogDescription>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabMode)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="w-fit">
              <TabsTrigger value="simples" className="cursor-pointer">
                Simples
              </TabsTrigger>
              <TabsTrigger value="avancado" className="cursor-pointer">
                Avançado
              </TabsTrigger>
            </TabsList>

            {/* Aba Simples */}
            <TabsContent
              value="simples"
              className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
            >
              {facetas.map((f) => (
                <FacetSection
                  key={f.key}
                  faceta={f}
                  selected={simpleDraft[f.key] ?? new Set()}
                  onChange={(next) =>
                    setSimpleDraft((prev) => ({ ...prev, [f.key]: next }))
                  }
                  open={openSection === f.key}
                  onToggle={() =>
                    setOpenSection((prev) =>
                      prev === f.key ? null : f.key,
                    )
                  }
                />
              ))}
            </TabsContent>

            {/* Aba Avançado */}
            <TabsContent
              value="avancado"
              className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
            >
              <GrupoBuilder
                grupo={advDraft}
                campos={campos}
                onChange={setAdvDraft}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearDraft}
            disabled={!hasAny}
            aria-label="Limpar todos os filtros da aba atual"
            className="cursor-pointer gap-1.5 disabled:cursor-not-allowed"
          >
            <RotateCcw className="size-4" aria-hidden />
            Limpar todos
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              aria-label="Aplicar filtros"
              className="cursor-pointer gap-1.5"
            >
              <Filter className="size-4" aria-hidden />
              Aplicar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FiltersDialog;
