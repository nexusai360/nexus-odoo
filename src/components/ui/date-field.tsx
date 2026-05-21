"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface DateFieldProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  id?: string;
  /** Datas anteriores a esta ficam desabilitadas. */
  fromDate?: Date;
  className?: string;
}

/**
 * Campo de data único no padrão do sistema: botão estilizado que abre um
 * calendário em popover. Substitui o `<input type="date">` nativo.
 */
export function DateField({
  value,
  onChange,
  placeholder = "Selecione uma data",
  id,
  fromDate,
  className,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            id={id}
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm transition-colors",
              "focus-visible:border-violet-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30",
              value ? "text-foreground" : "text-muted-foreground",
              className,
            )}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
            <span className="flex-1 text-left">
              {value ? format(value, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : placeholder}
            </span>
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={4} className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            onChange(d ?? undefined);
            setOpen(false);
          }}
          disabled={fromDate ? { before: fromDate } : undefined}
          locale={ptBR}
        />
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(new Date());
              setOpen(false);
            }}
            className="text-xs font-medium text-violet-500 transition-colors hover:text-violet-600"
          >
            Hoje
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
