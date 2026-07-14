"use client";

// Picker de período personalizado da Diretoria: UM calendário grande em popover. Trava a data
// mínima (a data de início das análises) e desabilita datas futuras. Mês e ano no cabeçalho
// usam o dropdown do design system, e o mês vem por extenso. Emite { start, end } em
// yyyy-mm-dd.

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { type DateRange, type DropdownProps } from "react-day-picker";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDiretoriaMinDate } from "@/lib/actions/diretoria-period";

const MOBILE_BREAKPOINT_PX = 640;

/** yyyy-mm-dd -> Date local (00:00), sem timezone shift. */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function dateToIso(d: Date): string {
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export interface DiretoriaRangePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRange?: { start: string; end: string };
  onApply: (range: { start: string; end: string }) => void;
  trigger: ReactElement;
}

/**
 * Os seletores de mês e ano do cabeçalho do calendário.
 *
 * O react-day-picker desenha isso com `<select>` NATIVO. Fica com a cara do navegador (o
 * "cru do Chrome"), ignora o tema escuro e não se parece com nenhum outro dropdown da
 * plataforma. Aqui trocamos pelo Select do design system, o mesmo do resto do sistema.
 *
 * O `onChange` do day-picker espera um evento de <select>; como só lemos `target.value`,
 * entregamos exatamente isso.
 */
function CalendarioDropdown({ options, value, onChange, "aria-label": ariaLabel }: DropdownProps) {
  const items = (options ?? []).map((o) => ({ value: String(o.value), label: o.label }));
  return (
    <Select
      items={items}
      value={String(value ?? "")}
      onValueChange={(v) =>
        onChange?.({
          target: { value: String(v) },
        } as React.ChangeEvent<HTMLSelectElement>)
      }
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-9 w-auto min-w-[7.5rem] gap-1 rounded-lg px-3 text-sm font-medium capitalize"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        side="bottom"
        align="start"
        sideOffset={6}
        alignItemWithTrigger={false}
        className="max-h-72"
      >
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value} className="capitalize">
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DiretoriaRangePicker({
  open,
  onOpenChange,
  initialRange,
  onApply,
  trigger,
}: DiretoriaRangePickerProps) {
  const isMobile = useIsMobile();
  const [minDate, setMinDate] = useState<Date | undefined>(undefined);

  // Lazy: só busca a data mínima na primeira vez que o picker abre.
  useEffect(() => {
    if (!open || minDate) return;
    let cancelled = false;
    getDiretoriaMinDate()
      .then((iso) => {
        if (cancelled || !iso) return;
        const d = isoToDate(iso);
        if (!Number.isNaN(d.getTime())) setMinDate(d);
      })
      .catch(() => {
        // Silencioso , o picker funciona sem o limite mínimo.
      });
    return () => {
      cancelled = true;
    };
  }, [open, minDate]);

  // Key estável: só remonta na transição abrir/fechar, para não perder o
  // primeiro clique do calendário.
  const panel = open ? (
    <PickerPanel
      key="panel-open"
      initialRange={initialRange}
      minDate={minDate}
      isMobile={isMobile}
      onApply={(range) => {
        onApply(range);
        onOpenChange(false);
      }}
      onCancel={() => onOpenChange(false)}
    />
  ) : null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="end"
        className="w-auto max-w-[min(calc(100vw-2rem),640px)] p-3"
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}

interface PickerPanelProps {
  initialRange?: { start: string; end: string };
  minDate?: Date;
  isMobile: boolean;
  onApply: (range: { start: string; end: string }) => void;
  onCancel: () => void;
}

function PickerPanel({
  initialRange,
  minDate,
  isMobile,
  onApply,
  onCancel,
}: PickerPanelProps) {
  const [range, setRange] = useState<DateRange | undefined>(() =>
    initialRange
      ? { from: isoToDate(initialRange.start), to: isoToDate(initialRange.end) }
      : undefined,
  );

  // Limites: antes de minDate (primeira nota) e depois de hoje.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const disabledMatcher = useMemo(
    () => (minDate ? { before: minDate, after: today } : { after: today }),
    [minDate, today],
  );

  const error = useMemo(() => {
    if (!range?.from || !range?.to) return null;
    if (range.to.getTime() < range.from.getTime()) {
      return "A data final deve ser igual ou posterior à data inicial.";
    }
    return null;
  }, [range]);

  const canApply = !!range?.from && !!range?.to && !error;

  const handleApply = () => {
    if (!canApply || !range?.from || !range?.to) return;
    onApply({ start: dateToIso(range.from), end: dateToIso(range.to) });
  };

  const helperText = minDate
    ? `Selecione qualquer intervalo a partir de ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(minDate)}.`
    : "Selecione qualquer intervalo até hoje.";

  return (
    <div className="flex flex-col gap-3">
      {/* UM mês, e grande. Dois meses lado a lado espremiam tudo num tamanho ilegível, e o
          intervalo quase sempre nasce dentro do mesmo mês. Quem precisa cruzar meses usa os
          seletores de mês e ano do cabeçalho, que agora são os do design system. */}
      <Calendar
        mode="range"
        selected={range}
        onSelect={setRange}
        locale={ptBR}
        numberOfMonths={1}
        defaultMonth={range?.from ?? today}
        disabled={disabledMatcher}
        startMonth={minDate}
        endMonth={today}
        // Dropdowns de mês e ano no cabeçalho: pular meses sem clicar na setinha um a um.
        captionLayout="dropdown"
        className="p-1 [--cell-size:2.75rem]"
        // Mês por extenso: "julho", não "jul.". Cabe, porque agora é um mês só.
        formatters={{
          formatMonthDropdown: (date) => date.toLocaleString("pt-BR", { month: "long" }),
        }}
        // O react-day-picker desenha o mês e o ano com <select> NATIVO, que é o visual cru do
        // navegador e destoa de tudo na plataforma. Aqui ele passa a usar o mesmo dropdown do
        // resto do sistema.
        components={{ Dropdown: CalendarioDropdown }}
      />
      {error ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">{helperText}</p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} className="cursor-pointer">
          Cancelar
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleApply}
          disabled={!canApply}
          className="cursor-pointer disabled:cursor-not-allowed"
        >
          Aplicar
        </Button>
      </div>
    </div>
  );
}
