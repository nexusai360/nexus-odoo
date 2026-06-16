"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CountryFlag } from "@/components/ui/country-flag";
import {
  type Country,
  DEFAULT_COUNTRY,
  formatNational,
  searchCountries,
} from "@/lib/whatsapp/countries";

interface PhoneInputProps {
  /** País selecionado (default Brasil). */
  country: Country;
  onCountryChange: (country: Country) => void;
  /**
   * Número nacional (DDD + número) em **dígitos crus**, sem o DDI. O componente
   * cuida da máscara de exibição e só reporta dígitos de volta.
   */
  national: string;
  onNationalChange: (digits: string) => void;
  /** Disparado ao pressionar Enter no campo de número. */
  onSubmit?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  inputId?: string;
  ariaDescribedBy?: string;
  /** Foca o campo de número ao montar (usado na edição inline). */
  autoFocus?: boolean;
  className?: string;
}

/** Limite de dígitos do número nacional por país (Brasil é fixo em 11). */
function maxNationalDigits(country: Country): number {
  return country.iso === "BR" ? 11 : 15;
}

/**
 * Campo de telefone agrupado: seletor de país (bandeira + DDI, com busca em
 * português) à esquerda e o número nacional à direita, numa única caixa que
 * recebe o anel de foco como um todo.
 *
 * O campo de número aceita **apenas dígitos** (qualquer outro caractere é
 * descartado na hora) e mostra a máscara local quando o número fica completo.
 * O seletor reusa o `Popover` (base-ui) portalizado, mesmo padrão visual do
 * `SearchableSelect`.
 */
export function PhoneInput({
  country,
  onCountryChange,
  national,
  onNationalChange,
  onSubmit,
  disabled,
  invalid,
  placeholder = "11 99123-4567",
  inputId,
  ariaDescribedBy,
  autoFocus,
  className,
}: PhoneInputProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const nationalRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => searchCountries(query), [query]);

  // Foco automático ao montar (edição inline): cursor no fim do número.
  useEffect(() => {
    if (!autoFocus) return;
    const el = nationalRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [autoFocus]);

  return (
    <div
      className={cn(
        "flex h-9 items-stretch overflow-hidden rounded-lg border bg-transparent transition-colors dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50",
        invalid
          ? "border-destructive dark:border-destructive/60"
          : "border-input",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
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
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`País: ${country.name} (${country.dial})`}
              disabled={disabled}
              className="flex cursor-pointer items-center gap-1.5 pl-3 pr-2 text-sm text-foreground transition-colors outline-none hover:bg-accent focus-visible:bg-accent"
            >
              <CountryFlag iso={country.iso} title={country.name} />
              <span className="font-medium tabular-nums">{country.dial}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={6}
          style={{ minWidth: "var(--anchor-width, 260px)" }}
          className="w-auto max-w-[min(calc(100vw-2rem),320px)] overflow-hidden p-0"
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
                placeholder="Buscar país ou código"
                aria-label="Buscar país"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <ul
            role="listbox"
            aria-label="Países"
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-muted-foreground">
                Nenhum país encontrado
              </li>
            ) : (
              filtered.map((c) => {
                const selected = c.iso === country.iso;
                return (
                  <li key={c.iso} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => {
                        onCountryChange(c);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                        selected && "bg-accent/40",
                      )}
                    >
                      <CountryFlag iso={c.iso} title={c.name} />
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {c.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {c.dial}
                      </span>
                      {selected ? (
                        <Check
                          className="h-3.5 w-3.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </PopoverContent>
      </Popover>

      <div className="my-1.5 w-px shrink-0 bg-border" aria-hidden="true" />

      <input
        ref={nationalRef}
        id={inputId}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={formatNational(country, national)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onNationalChange(digits.slice(0, maxNationalDigits(country)));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export { DEFAULT_COUNTRY };
