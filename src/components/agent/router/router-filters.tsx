"use client";

/**
 * R1 router de catalogo: filtros do painel (periodo + origem), no MESMO padrao
 * do Backtest. Periodo usa o componente PeriodPills (pilulas + "Personalizado"
 * com calendario); origem usa um multi-select de checkboxes (igual ao
 * StatusMultiSelect da tabela de avaliacoes). Os filtros vao para a URL
 * (searchParams) e o Server Component da pagina refaz as queries.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { PeriodPills } from "@/components/reports/period-pills";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { PeriodKey } from "@/lib/datetime-core";

interface Props {
  pk: PeriodKey;
  customStart?: string;
  customEnd?: string;
  /** Origens selecionadas (markers de rodada e/ou virtuais). */
  origens: string[];
  /** Opcoes do filtro: origens distintas no periodo, com contagem. */
  origensOptions: Array<{ marker: string; count: number }>;
  /** marker -> label legivel ("Rodada 24", "Agente Nex", "Calibragem"). */
  labelMap: Record<string, string>;
  minDateIso?: string;
}

export function RouterFilters({
  pk,
  customStart,
  customEnd,
  origens,
  origensOptions,
  labelMap,
  minDateIso,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const push = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    params.set("page", "0"); // qualquer mudanca de filtro volta pra pagina 1
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const onPeriodChange = (
    next: PeriodKey,
    range?: { start: string; end: string },
  ) => {
    push((p) => {
      p.set("pk", next);
      if (next === "custom" && range) {
        p.set("cs", range.start);
        p.set("ce", range.end);
      } else {
        p.delete("cs");
        p.delete("ce");
      }
    });
  };

  const toggleOrigem = (value: string) => {
    const next = origens.includes(value)
      ? origens.filter((m) => m !== value)
      : [...origens, value];
    push((p) => {
      if (next.length > 0) p.set("origens", next.join(","));
      else p.delete("origens");
    });
  };

  const clearOrigens = () =>
    push((p) => {
      p.delete("origens");
    });

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3",
        pending && "opacity-70",
      )}
    >
      <PeriodPills
        value={pk}
        customRange={
          customStart && customEnd
            ? { start: customStart, end: customEnd }
            : undefined
        }
        onChange={onPeriodChange}
        minDate={minDateIso ? new Date(minDateIso) : undefined}
      />
      <div className="ml-auto">
        <OrigemMultiSelect
          options={origensOptions}
          selected={origens}
          labelFor={(m) => labelMap[m] ?? m}
          onToggle={toggleOrigem}
          onClear={clearOrigens}
        />
      </div>
    </div>
  );
}

/** Multi-select de origem (rodadas + virtuais) com checkboxes e contagem.
 *  Mesmo padrao do RodadaMultiSelect do Backtest. */
function OrigemMultiSelect({
  options,
  selected,
  labelFor,
  onToggle,
  onClear,
}: {
  options: Array<{ marker: string; count: number }>;
  selected: string[];
  labelFor: (marker: string) => string;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    selected.length === 0
      ? "Todas as origens"
      : selected.length === 1
        ? labelFor(selected[0])
        : `${selected.length} origens`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Filtrar por origem"
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-9 min-w-[180px] cursor-pointer items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:border-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <span className="truncate">{label}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-[220px] overflow-hidden p-1"
      >
        {options.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Sem origens no período.
          </div>
        ) : (
          <ul
            role="listbox"
            aria-label="Origem"
            className="flex max-h-[388px] flex-col overflow-y-auto"
          >
            {options.map((opt) => {
              const isOn = selected.includes(opt.marker);
              return (
                <li key={opt.marker} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isOn}
                    onClick={() => onToggle(opt.marker)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border bg-background transition-colors",
                        isOn && "border-violet-500 bg-violet-500 text-white",
                      )}
                      aria-hidden
                    >
                      {isOn ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      {labelFor(opt.marker)}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {opt.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selected.length > 0 && (
          <div className="mt-1 border-t border-border pt-1">
            <button
              type="button"
              onClick={onClear}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden />
              Limpar seleção
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
