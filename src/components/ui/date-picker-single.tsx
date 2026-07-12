"use client";

// Seletor de UMA data, em popover, com navegação rápida por mês e ano (dropdowns no
// cabeçalho do calendário) , sem depender da setinha de mês em mês. Mesma base visual do
// range picker da diretoria (react-day-picker + Popover), só que de data única.
//
// Emite/recebe a data em ISO (AAAA-MM-DD), o formato que a plataforma usa de ponta a ponta.

import { useState } from "react";
import { ptBR } from "date-fns/locale";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** AAAA-MM-DD -> Date local (00:00), sem deslocamento de fuso. */
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

function rotulo(iso: string): string {
  return isoToDate(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

interface DatePickerSingleProps {
  id?: string;
  /** Data selecionada (ISO, AAAA-MM-DD). */
  value: string;
  onChange: (iso: string) => void;
  /** Primeiro ano oferecido no dropdown de anos (padrão: 5 anos atrás). */
  anoInicial?: number;
  /** Último ano oferecido (padrão: ano atual + 1). */
  anoFinal?: number;
  disabled?: boolean;
  className?: string;
}

export function DatePickerSingle({
  id,
  value,
  onChange,
  anoInicial,
  anoFinal,
  disabled,
  className,
}: DatePickerSingleProps) {
  const [aberto, setAberto] = useState(false);
  const hoje = new Date();
  const inicio = new Date(anoInicial ?? hoje.getFullYear() - 5, 0, 1);
  const fim = new Date(anoFinal ?? hoje.getFullYear() + 1, 11, 31);
  const selecionada = value ? isoToDate(value) : undefined;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("h-10 w-full justify-start gap-2 font-normal", className)}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            {value ? rotulo(value) : "Escolher data"}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selecionada}
          defaultMonth={selecionada ?? hoje}
          // Dropdowns de mês e ano: navegar 2 anos para trás não exige 24 cliques.
          captionLayout="dropdown"
          startMonth={inicio}
          endMonth={fim}
          onSelect={(d) => {
            if (!d) return;
            onChange(dateToIso(d));
            setAberto(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
