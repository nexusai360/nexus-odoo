"use client";

// Picker de período personalizado da Diretoria , calendário de 2 meses em
// popover (igual ao relatório de conversas do nexus-insights). Trava a data
// mínima (primeira nota do cache) e desabilita datas futuras; o dia de hoje fica
// destacado de leve. No mobile mostra 1 mês. Emite { start, end } em yyyy-mm-dd.

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { type DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
    ? `Selecione qualquer intervalo a partir de ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(minDate)}.`
    : "Selecione qualquer intervalo até hoje.";

  return (
    <div className="flex flex-col gap-3">
      <Calendar
        mode="range"
        selected={range}
        onSelect={setRange}
        locale={ptBR}
        numberOfMonths={isMobile ? 1 : 2}
        defaultMonth={range?.from ?? today}
        disabled={disabledMatcher}
        startMonth={minDate}
        endMonth={today}
        // Dropdowns de mês e ano no cabeçalho: pular meses sem clicar na setinha um a um.
        captionLayout="dropdown"
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
