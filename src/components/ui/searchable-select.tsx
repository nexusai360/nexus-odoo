"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  notes?: string;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
}

/**
 * Configura o "modo input editable inline":
 *
 * Quando `value === sentinel`, o trigger renderiza um `<input>` editable
 * (substitui o label estático), foca automaticamente, mostra um botão `X`
 * para limpar e sair do customMode. O chevron continua abrindo o dropdown
 * normalmente — selecionar um item do dropdown sai do customMode (chama
 * `onChange` com o novo value).
 */
export interface SearchableSelectCustomMode {
  /** Sentinela: quando `value` for esse valor, ativa customMode. */
  sentinel: string;
  /** Valor atual do input customizado. */
  customValue: string;
  /** Callback ao digitar. */
  onCustomChange: (next: string) => void;
  /** Placeholder do input editable. */
  placeholder?: string;
  /** Helpa screen reader. */
  inputAriaLabel?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  /**
   * Opções fixadas no topo da lista. Aparecem sempre, mesmo com filtro
   * de busca aplicado, e em ordem antes das `options` filtradas.
   */
  pinnedFirst?: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  className?: string;
  triggerClassName?: string;
  customMode?: SearchableSelectCustomMode;
}

/**
 * Select com busca e endAdornment.
 *
 * Usa `Popover` (base-ui) para portalizar o popup no `<body>`, evitando que
 * containers com `overflow-hidden` ou `transform` (que criam stacking context)
 * cortem ou empurrem o dropdown — bug conhecido como "dropdown preso".
 *
 * Mantém o padrão do `<CustomSelect>` (mesma família visual, sideOffset=4,
 * align="start") para consistência entre selects da plataforma.
 *
 * Quando `customMode` é passado e `value === customMode.sentinel`, o trigger
 * exibe um `<input>` editable inline (com botão X para reset). Selecionar
 * uma opção do dropdown sai automaticamente do customMode.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  pinnedFirst,
  placeholder = "Selecionar",
  disabled = false,
  searchPlaceholder = "Buscar...",
  className,
  triggerClassName,
  customMode,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected =
    options.find((o) => o.value === value) ??
    pinnedFirst?.find((o) => o.value === value);
  const isCustomMode = !!customMode && value === customMode.sentinel;

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Foco automático ao entrar em customMode (a11y + UX: usuário entra
  // direto no estado de digitação, sem precisar clicar no input).
  useEffect(() => {
    if (isCustomMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCustomMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.notes ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <div className={cn("relative", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              role="button"
              aria-haspopup="listbox"
              aria-expanded={open}
              disabled={disabled}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground cursor-pointer transition-all duration-200 hover:border-muted-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed",
                triggerClassName,
              )}
            >
              {isCustomMode && customMode ? (
                <>
                  <input
                    ref={inputRef}
                    type="text"
                    value={customMode.customValue}
                    onChange={(e) =>
                      customMode.onCustomChange(e.currentTarget.value)
                    }
                    onClick={(e) => {
                      // Click no input não abre dropdown — usuário usa o
                      // chevron pra abrir, ou o X pra limpar.
                      e.stopPropagation();
                    }}
                    onKeyDown={(e) => {
                      // Bloqueia Space/Enter de propagar pro botão (que
                      // abriria o dropdown). Tab continua funcionando.
                      if (e.key === " " || e.key === "Enter") {
                        e.stopPropagation();
                      }
                    }}
                    placeholder={customMode.placeholder}
                    aria-label={customMode.inputAriaLabel}
                    className="flex-1 min-w-0 bg-transparent border-0 outline-none p-0 text-sm text-foreground placeholder:text-muted-foreground"
                  />
                  {/*
                    NOTA: usamos <span role="button"> em vez de <button>
                    porque o trigger externo (PopoverTrigger) já é um
                    <button> e button-dentro-de-button é HTML inválido.
                    Mantemos a11y via role + tabIndex + keyboard handler.
                  */}
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="Limpar"
                    onClick={(e) => {
                      e.stopPropagation();
                      customMode.onCustomChange("");
                      onChange("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        customMode.onCustomChange("");
                        onChange("");
                      }
                    }}
                    className="ml-2 inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform ml-1",
                      open && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </>
              ) : (
                <>
                  <span className="truncate">
                    {selected?.label ?? placeholder}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform ml-2",
                      open && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </>
              )}
            </button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={4}
          style={{ minWidth: "var(--anchor-width, 280px)" }}
          className="w-auto max-w-[min(calc(100vw-2rem),420px)] p-0 overflow-hidden"
        >
          <div className="p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder={searchPlaceholder}
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {(() => {
              const renderItem = (opt: SearchableSelectOption) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={value === opt.value}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent cursor-pointer",
                      value === opt.value && "bg-accent/40",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {opt.label}
                        </span>
                        {value === opt.value ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : null}
                      </div>
                      {opt.notes ? (
                        <span className="block text-[11px] text-muted-foreground/80">
                          {opt.notes}
                        </span>
                      ) : null}
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {opt.startAdornment ? <span>{opt.startAdornment}</span> : null}
                      {opt.endAdornment ? <span>{opt.endAdornment}</span> : null}
                    </span>
                  </button>
                </li>
              );
              const pinned = pinnedFirst ?? [];
              if (pinned.length === 0 && filtered.length === 0) {
                return (
                  <li className="px-3 py-3 text-xs text-muted-foreground">
                    Nenhum resultado
                  </li>
                );
              }
              return (
                <>
                  {pinned.map(renderItem)}
                  {pinned.length > 0 && filtered.length > 0 ? (
                    <li className="my-1 border-t border-border/60" aria-hidden />
                  ) : null}
                  {filtered.map(renderItem)}
                </>
              );
            })()}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
