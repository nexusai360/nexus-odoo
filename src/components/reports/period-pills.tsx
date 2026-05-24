"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { ptBR } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { type PeriodKey } from "@/lib/datetime-core";

/**
 * Opções de período da tela de consumo. Declaradas aqui , no nexus-insights
 * vinham de `@/lib/reports/period`; este `PeriodPills` é desacoplado do modelo
 * multi-conta do projeto irmão.
 */
const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana_atual", label: "Esta semana" },
  { key: "mes_atual", label: "Este mês" },
  { key: "todos", label: "Tudo" },
  { key: "custom", label: "Personalizado" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOBILE_BREAKPOINT_PX = 640;

/** Datas no formato yyyy-mm-dd ↔ Date local (sem timezone shift). */
function isoToDate(iso: string): Date {
  // Constrói uma Date no fuso local com hora 00:00 , coerente com o uso
  // do calendário, que opera em "dias" sem timezone.
  const [y, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function dateToIso(d: Date): string {
  const yyyy = String(d.getFullYear()).padStart(4, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatRange(start: string, end: string, locale = "pt-BR"): string {
  const s = isoToDate(start);
  const e = isoToDate(end);
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
  });
  const sStr = fmt.format(s).replace(".", "");
  const eStr = fmt.format(e).replace(".", "");
  return `${sStr} , ${eStr}`;
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

// ---------------------------------------------------------------------------
// Picker (calendário em popover ou dialog full-screen no mobile)
// ---------------------------------------------------------------------------

interface CustomRangePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRange?: { start: string; end: string };
  onApply: (range: { start: string; end: string }) => void;
  trigger: React.ReactNode;
  isMobile: boolean;
  minDate?: Date;
}

function CustomRangePicker({
  open,
  onOpenChange,
  initialRange,
  onApply,
  trigger,
  isMobile,
  minDate,
}: CustomRangePickerProps) {
  // Key estável: só remonta na transição abrir/fechar, evitando perder o
  // primeiro click do calendário (o state interno do react-day-picker
  // disparava re-render que invalidava a key derivada do range).
  const panel = open ? (
    <PickerPanel
      key="panel-open"
      initialRange={initialRange}
      onApply={(range) => {
        onApply(range);
        onOpenChange(false);
      }}
      onCancel={() => onOpenChange(false)}
      minDate={minDate}
    />
  ) : null;

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger render={trigger as React.ReactElement} />
        <DialogContent className="max-w-[calc(100%-2rem)] p-4 sm:max-w-md">
          <DialogTitle className="mb-2">Período personalizado</DialogTitle>
          {panel}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger as React.ReactElement} />
      <PopoverContent align="start" className="w-auto p-3">
        {panel}
      </PopoverContent>
    </Popover>
  );
}

interface PickerPanelProps {
  initialRange?: { start: string; end: string };
  onApply: (range: { start: string; end: string }) => void;
  onCancel: () => void;
  minDate?: Date;
}

function PickerPanel({
  initialRange,
  onApply,
  onCancel,
  minDate,
}: PickerPanelProps) {
  const [range, setRange] = useState<DateRange | undefined>(() =>
    initialRange
      ? {
          from: isoToDate(initialRange.start),
          to: isoToDate(initialRange.end),
        }
      : undefined,
  );

  // Limites: antes de minDate (primeira conversa do banco) e depois de hoje.
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const disabledMatcher = useMemo(() => {
    if (minDate) {
      return { before: minDate, after: today };
    }
    return { after: today };
  }, [minDate, today]);

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
    ? `Selecione a partir de ${new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(minDate)}.`
    : "Selecione qualquer data até hoje.";

  return (
    <div className="flex w-[17rem] max-w-[calc(100vw-3rem)] flex-col gap-3">
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
        className="w-full"
        classNames={{ root: "w-full" }}
      />
      {error ? (
        <p role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">{helperText}</p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="cursor-pointer"
        >
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

// ---------------------------------------------------------------------------
// PeriodPills
// ---------------------------------------------------------------------------

export interface PeriodPillsProps {
  value: PeriodKey;
  customRange?: { start: string; end: string };
  onChange: (
    next: PeriodKey,
    customRange?: { start: string; end: string },
  ) => void;
  className?: string;
  /** Data mínima selecionável no calendário (primeira chamada registrada). */
  minDate?: Date;
}

export function PeriodPills({
  value,
  customRange,
  onChange,
  className,
  minDate,
}: PeriodPillsProps) {
  const isMobile = useIsMobile();
  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePillClick = (key: PeriodKey) => {
    if (key === "custom") {
      // Abre picker; só "ativa" custom quando aplicar.
      setPickerOpen(true);
      return;
    }
    onChange(key);
  };

  const handleApplyCustom = (range: { start: string; end: string }) => {
    onChange("custom", range);
  };

  return (
    <div
      role="tablist"
      aria-label="Período"
      className={cn(
        "-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 snap-x snap-mandatory sm:flex-wrap sm:overflow-visible sm:pb-0",
        className,
      )}
    >
      {PERIOD_OPTIONS.map((opt) => {
        const active = opt.key === value;
        const isCustom = opt.key === "custom";

        // Conteúdo do botão: para "Personalizado" inclui ícone e, quando ativo
        // com range, mostra o range formatado.
        const labelContent = isCustom ? (
          <>
            <CalendarIcon className="h-4 w-4 mr-1.5" />
            {active && customRange
              ? formatRange(customRange.start, customRange.end)
              : opt.label}
          </>
        ) : (
          opt.label
        );

        const pillClasses = cn(
          "inline-flex shrink-0 cursor-pointer snap-start items-center rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
          "border border-transparent",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground",
          // Indicação visual extra para a pill custom quando ativa.
          isCustom && active && "border-primary/50",
        );

        // A pill "Personalizado" precisa ser o trigger do popover/dialog.
        if (isCustom) {
          return (
            <CustomRangePicker
              key={opt.key}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              initialRange={customRange}
              onApply={handleApplyCustom}
              isMobile={isMobile}
              minDate={minDate}
              trigger={
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={
                    active && customRange
                      ? `Período personalizado: ${formatRange(customRange.start, customRange.end)}`
                      : "Selecionar período personalizado"
                  }
                  onClick={() => handlePillClick(opt.key)}
                  className={pillClasses}
                >
                  {labelContent}
                </button>
              }
            />
          );
        }

        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => handlePillClick(opt.key)}
            className={pillClasses}
          >
            {labelContent}
          </button>
        );
      })}
    </div>
  );
}
