"use client";

import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Label acessível para o trigger (lido por screen readers). */
  "aria-label"?: string;
}

/**
 * Select customizado em cima do `Popover` da base-ui. A base-ui já trata
 * click-outside, foco e dismiss via Escape — evitamos o handler manual de
 * `mousedown` que causava race no toggle do trigger.
 *
 * Largura mínima fixa (280px) garante boa legibilidade dos labels descritivos
 * sem depender de variável CSS exposta pelo `PopoverContent`.
 */
export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Selecionar",
  className,
  triggerClassName,
  icon,
  disabled = false,
  "aria-label": ariaLabel,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              disabled={disabled}
              aria-label={ariaLabel}
              aria-haspopup="listbox"
              aria-expanded={open}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground cursor-pointer transition-all duration-200 hover:border-muted-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed",
                triggerClassName,
              )}
            >
              <span className="flex items-center gap-2 truncate">
                {icon}
                {selected?.icon}
                {selected?.label ?? placeholder}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0 ml-2",
                  open && "rotate-180",
                )}
              />
            </button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={4}
          className="min-w-[280px] w-auto max-w-[min(calc(100vw-2rem),420px)] p-0 overflow-hidden"
        >
          <ul role="listbox" className="flex flex-col">
            {options.map((option) => {
              const isSelected = value === option.value;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-2.5 text-left cursor-pointer transition-all duration-200 hover:bg-accent",
                      isSelected && "bg-accent/50",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {option.label}
                        </span>
                        {option.icon ? (
                          <span className="shrink-0">{option.icon}</span>
                        ) : null}
                      </div>
                      {option.description ? (
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {option.description}
                        </span>
                      ) : null}
                    </div>
                    {isSelected ? (
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
