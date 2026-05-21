"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CustomSelect } from "@/components/ui/custom-select";
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

/** Nomes completos dos meses, capitalizados. */
const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => {
  const name = new Date(2000, i, 1).toLocaleString("pt-BR", { month: "long" });
  return name.charAt(0).toUpperCase() + name.slice(1);
});

/** Quantos anos a frente o seletor de ano vai (faixa: ano atual ate +30). */
const YEAR_SPAN = 30;

/**
 * Campo de data único no padrão do sistema: botão estilizado que abre um
 * calendário em popover. A navegação de mês e ano usa o `CustomSelect` do
 * sistema (lista suspensa padrão, rolável), em vez dos dropdowns nativos.
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
  const today = new Date();
  const minYear = (fromDate ?? today).getFullYear();
  const [displayMonth, setDisplayMonth] = useState<Date>(value ?? fromDate ?? today);

  // Ao abrir, posiciona o calendário no mês do valor atual (ou hoje).
  function handleOpenChange(next: boolean) {
    if (next) setDisplayMonth(value ?? fromDate ?? today);
    setOpen(next);
  }

  const monthOptions = MONTH_NAMES.map((label, i) => ({ value: String(i), label }));
  const yearOptions = Array.from({ length: YEAR_SPAN + 1 }, (_, i) => {
    const y = minYear + i;
    return { value: String(y), label: String(y) };
  });

  // Navegação por mês com travas: não volta antes do mês corrente (ou do
  // fromDate) e não passa de dezembro do ano máximo (ano atual +30).
  const baseDate = fromDate ?? today;
  const minMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const maxMonth = new Date(minYear + YEAR_SPAN, 11, 1);
  const monthCursor = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
  const atMinMonth = monthCursor.getTime() <= minMonth.getTime();
  const atMaxMonth = monthCursor.getTime() >= maxMonth.getTime();

  function shiftMonth(delta: number) {
    setDisplayMonth(
      new Date(displayMonth.getFullYear(), displayMonth.getMonth() + delta, 1),
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--anchor-width)] min-w-[300px] p-0"
      >
        <div className="flex items-center gap-2 border-b border-border p-2">
          <button
            type="button"
            aria-label="Mês anterior"
            disabled={atMinMonth}
            onClick={() => shiftMonth(-1)}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors",
              "hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground",
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <CustomSelect
            aria-label="Mês"
            className="min-w-0 flex-1"
            value={String(displayMonth.getMonth())}
            onChange={(v) =>
              setDisplayMonth(new Date(displayMonth.getFullYear(), Number(v), 1))
            }
            options={monthOptions}
          />
          <CustomSelect
            aria-label="Ano"
            className="w-[80px] shrink-0"
            value={String(displayMonth.getFullYear())}
            onChange={(v) => setDisplayMonth(new Date(Number(v), displayMonth.getMonth(), 1))}
            options={yearOptions}
          />
          <button
            type="button"
            aria-label="Próximo mês"
            disabled={atMaxMonth}
            onClick={() => shiftMonth(1)}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors",
              "hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground",
            )}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <Calendar
          mode="single"
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          hideNavigation
          classNames={{ month_caption: "hidden", root: "w-full" }}
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
