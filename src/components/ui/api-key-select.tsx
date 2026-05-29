"use client";

/**
 * ApiKeySelect , seletor de chave de API com sufixo mascarado ("Nome · ••••XXXX")
 * e ação de rodapé "Nova chave de <Provedor>" que leva ao cadastro filtrado pelo
 * provedor. Substitui o CustomSelect simples nas seções que lidam com chaves.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, KeyRound, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ApiKeyOption {
  id: string;
  label: string;
  /** Ex.: "••••DFYA". Opcional. */
  maskedSuffix?: string | null;
}

interface ApiKeySelectProps {
  value: string;
  onChange: (id: string) => void;
  options: ApiKeyOption[];
  /** Slug do provedor (ex.: "openai") usado no link de nova chave. */
  provider: string;
  /** Rótulo amigável do provedor (ex.: "OpenAI"). */
  providerLabel: string;
  disabled?: boolean;
  "aria-label"?: string;
}

function optionText(o: ApiKeyOption): string {
  return o.maskedSuffix ? `${o.label} · ${o.maskedSuffix}` : o.label;
}

export function ApiKeySelect({
  value,
  onChange,
  options,
  provider,
  providerLabel,
  disabled = false,
  "aria-label": ariaLabel,
}: ApiKeySelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-muted/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className="truncate">
          {selected ? optionText(selected) : "Selecionar chave"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg"
        >
          <div className="max-h-56 overflow-y-auto p-1">
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Nenhuma chave de {providerLabel}.
              </div>
            ) : (
              options.map((o) => {
                const isActive = o.id === value;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                      isActive ? "text-violet-700 dark:text-violet-300" : "text-foreground",
                    )}
                  >
                    <span className="truncate">{optionText(o)}</span>
                    {isActive ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  </button>
                );
              })
            )}
          </div>
          <Link
            href={`/agente/chaves?provider=${encodeURIComponent(provider)}`}
            className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-500/10 dark:text-violet-300"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            Nova chave de {providerLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
