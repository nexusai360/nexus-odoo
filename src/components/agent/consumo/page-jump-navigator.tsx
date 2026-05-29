"use client";

/**
 * Navegador de paginas clicavel: o texto "Pagina X de Y" abre um popover com
 * (a) uma busca que aceita so numero (Enter pula direto pra pagina) e (b) uma
 * lista rolavel de todas as paginas (janela de ~10 visiveis). Substitui a
 * navegacao seta-por-seta no Historico de chamadas do Consumo.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  /** Pagina atual (0-indexed). */
  page: number;
  /** Total de paginas. */
  totalPages: number;
  /** Pula para a pagina informada (0-indexed). */
  onJump: (pageIndex: number) => void;
  disabled?: boolean;
}

export function PageJumpNavigator({ page, totalPages, onJump, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  // Ao abrir, rola a lista para a pagina atual ficar visivel.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = setTimeout(() => {
      listRef.current
        ?.querySelector('[data-current="true"]')
        ?.scrollIntoView({ block: "center" });
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const jump = (oneBased: number) => {
    const clamped = Math.min(Math.max(1, oneBased), totalPages);
    onJump(clamped - 1);
    setOpen(false);
  };

  const handleSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const n = Number(query.trim());
    if (Number.isInteger(n) && n >= 1 && n <= totalPages) {
      jump(n);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            aria-label="Ir para uma pagina"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs tabular-nums text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Página {page + 1} de {totalPages}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        }
      />
      <PopoverContent align="center" sideOffset={6} className="w-56 p-2">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={totalPages}
          placeholder={`Ir para a página (1 a ${totalPages})`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleSearchKey}
          aria-label="Número da página"
          className="mb-2 h-8 text-xs"
        />
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Páginas"
          className="max-h-[280px] overflow-y-auto"
        >
          {Array.from({ length: totalPages }, (_, i) => {
            const oneBased = i + 1;
            const isCurrent = i === page;
            return (
              <li key={oneBased} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  data-current={isCurrent ? "true" : undefined}
                  onClick={() => jump(oneBased)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs tabular-nums transition-colors hover:bg-accent",
                    isCurrent
                      ? "bg-violet-500/10 font-medium text-violet-700 dark:text-violet-300"
                      : "text-foreground",
                  )}
                >
                  Página {oneBased}
                  {isCurrent ? (
                    <span className="text-[10px] text-muted-foreground">
                      atual
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
