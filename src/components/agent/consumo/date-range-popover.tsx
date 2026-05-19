"use client";

/**
 * DateRangePopover — seletor de intervalo de datas (grão de dia) para a tela
 * de consumo do Agente Nex. Cópia funcional do padrão do nexus-insights:
 * dois campos de data nativos dentro de um Popover portalizado, com validação
 * de ordem e atalho de aplicar.
 *
 * Bloco 5 / Task 5.1 — opção "Personalizado" do seletor de período.
 */

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface DateRangePopoverProps {
  /** Intervalo atual ("YYYY-MM-DD") — pré-preenche os campos ao abrir. */
  value?: { start: string; end: string };
  /** Chamado ao aplicar um intervalo válido. */
  onApply: (start: string, end: string) => void;
  /** Data mínima selecionável ("YYYY-MM-DD") — antes disso não há dado. */
  minDate?: string;
  /** Elemento gatilho — a pílula "Personalizado". */
  children: React.ReactElement;
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

export function DateRangePopover({
  value,
  onApply,
  minDate,
  children,
}: DateRangePopoverProps) {
  const [open, setOpen] = useState(false);
  const max = todayIso();
  const [start, setStart] = useState(value?.start ?? "");
  const [end, setEnd] = useState(value?.end ?? max);

  const valid = start !== "" && end !== "" && start <= end;

  function handleApply() {
    if (!valid) return;
    onApply(start, end);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setStart(value?.start ?? "");
          setEnd(value?.end ?? max);
        }
      }}
    >
      <PopoverTrigger render={children} />
      <PopoverContent align="start" sideOffset={4} className="w-[280px] p-4">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CalendarRange className="h-4 w-4 text-violet-500" aria-hidden />
            Intervalo personalizado
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="range-start" className="text-xs text-muted-foreground">
              De
            </Label>
            <input
              id="range-start"
              type="date"
              value={start}
              min={minDate}
              max={end || max}
              onChange={(e) => setStart(e.currentTarget.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors focus-visible:border-violet-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="range-end" className="text-xs text-muted-foreground">
              Até
            </Label>
            <input
              id="range-end"
              type="date"
              value={end}
              min={start || minDate}
              max={max}
              onChange={(e) => setEnd(e.currentTarget.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors focus-visible:border-violet-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/30"
            />
          </div>
          {!valid && start !== "" && end !== "" ? (
            <p className="text-xs text-destructive">
              A data inicial deve ser anterior à final.
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={!valid}
            className="h-8 w-full cursor-pointer text-xs"
          >
            Aplicar intervalo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
