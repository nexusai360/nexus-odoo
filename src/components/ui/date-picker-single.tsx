"use client";

// Seletor de UMA data, em popover, no padrao de calendario do sistema (o mesmo do
// Personalizado do Backtest e da Diretoria): calendario grande, mes por extenso, dias fora
// da faixa apagados, texto de ajuda dizendo o limite e o par Cancelar/Aplicar.
//
// A navegacao de mes e ano usa o Select do proprio design system (base-ui), nao o <select>
// nativo do navegador que o react-day-picker traz no captionLayout="dropdown" , aquele
// destoava do resto da plataforma e ainda abreviava o nome do mes ("mar.").
//
// A faixa e travada por minIso/maxIso: ano, mes e dia fora dela nem aparecem como opcao.
// Emite/recebe a data em ISO (AAAA-MM-DD), o formato que a plataforma usa de ponta a ponta.

import { useEffect, useMemo, useState } from "react";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

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

/** "1º de janeiro de 2026" , o jeito que se le uma data de inicio em portugues. */
function rotuloLimite(d: Date): string {
  const dia = d.getDate() === 1 ? "1º" : String(d.getDate());
  return `${dia} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

interface DatePickerSingleProps {
  id?: string;
  /** Data selecionada (ISO, AAAA-MM-DD). */
  value: string;
  onChange: (iso: string) => void;
  /** Primeira data selecionavel (ISO). Nada antes dela aparece como opcao. */
  minIso: string;
  /** Ultima data selecionavel (ISO). Padrao: hoje. */
  maxIso?: string;
  disabled?: boolean;
  className?: string;
}

export function DatePickerSingle({
  id,
  value,
  onChange,
  minIso,
  maxIso,
  disabled,
  className,
}: DatePickerSingleProps) {
  const [aberto, setAberto] = useState(false);

  const minDate = useMemo(() => isoToDate(minIso), [minIso]);
  const maxDate = useMemo(
    () => (maxIso ? isoToDate(maxIso) : new Date(new Date().setHours(0, 0, 0, 0))),
    [maxIso],
  );

  const selecionada = value ? isoToDate(value) : undefined;

  // Rascunho: so vira valor de verdade no Aplicar (o Cancelar descarta).
  const [rascunho, setRascunho] = useState<Date | undefined>(selecionada);
  const [mesVisivel, setMesVisivel] = useState<Date>(selecionada ?? minDate);

  useEffect(() => {
    if (!aberto) return;
    setRascunho(selecionada);
    setMesVisivel(selecionada ?? minDate);
    // Ao reabrir, o painel volta a refletir o valor salvo.
  }, [aberto, value, minIso]); // eslint-disable-line react-hooks/exhaustive-deps

  const ano = mesVisivel.getFullYear();
  const mes = mesVisivel.getMonth();

  // Anos e meses OFERECIDOS: so o que cabe na faixa. Nao existe "escolher e ser barrado".
  const anos = useMemo(() => {
    const lista: number[] = [];
    for (let a = minDate.getFullYear(); a <= maxDate.getFullYear(); a++) lista.push(a);
    return lista;
  }, [minDate, maxDate]);

  const mesesDoAno = useMemo(() => {
    const primeiro = ano === minDate.getFullYear() ? minDate.getMonth() : 0;
    const ultimo = ano === maxDate.getFullYear() ? maxDate.getMonth() : 11;
    return MESES.map((nome, i) => ({ i, nome })).filter((m) => m.i >= primeiro && m.i <= ultimo);
  }, [ano, minDate, maxDate]);

  /** Move o mes visivel mantendo-o dentro da faixa. */
  function irPara(novoAno: number, novoMes: number) {
    const alvo = new Date(novoAno, novoMes, 1);
    const pisoMes = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const tetoMes = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    if (alvo < pisoMes) return setMesVisivel(pisoMes);
    if (alvo > tetoMes) return setMesVisivel(tetoMes);
    setMesVisivel(alvo);
  }

  const temAnterior = new Date(ano, mes, 1) > new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const temProximo = new Date(ano, mes, 1) < new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

  function aplicar() {
    if (!rascunho) return;
    onChange(dateToIso(rascunho));
    setAberto(false);
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("h-10 w-full justify-start gap-2 font-normal sm:w-64", className)}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            {value ? rotulo(value) : "Escolher data"}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex flex-col gap-3">
          {/* Cabecalho proprio: setas + selects do design system (mes por extenso). */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Mês anterior"
              disabled={!temAnterior}
              onClick={() => irPara(mes === 0 ? ano - 1 : ano, mes === 0 ? 11 : mes - 1)}
              className="size-9 shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="size-4" />
            </Button>

            <Select
              items={mesesDoAno.map((m) => ({ value: String(m.i), label: m.nome }))}
              value={String(mes)}
              onValueChange={(v) => irPara(ano, Number(v))}
            >
              <SelectTrigger aria-label="Mês" className="h-9 flex-1 capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mesesDoAno.map((m) => (
                  <SelectItem key={m.i} value={String(m.i)} className="capitalize">
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={anos.map((a) => ({ value: String(a), label: String(a) }))}
              value={String(ano)}
              onValueChange={(v) => irPara(Number(v), mes)}
            >
              <SelectTrigger aria-label="Ano" className="h-9 w-[5.5rem] tabular-nums">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Próximo mês"
              disabled={!temProximo}
              onClick={() => irPara(mes === 11 ? ano + 1 : ano, mes === 11 ? 0 : mes + 1)}
              className="size-9 shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <Calendar
            mode="single"
            locale={ptBR}
            selected={rascunho}
            month={mesVisivel}
            onMonthChange={setMesVisivel}
            onSelect={setRascunho}
            disabled={{ before: minDate, after: maxDate }}
            startMonth={minDate}
            endMonth={maxDate}
            // O cabecalho e o nosso (acima): o do react-day-picker sai de cena.
            classNames={{ nav: "hidden", month_caption: "hidden" }}
            // Celula maior: o calendario de 28px era pequeno demais para clicar e para ler.
            className="p-0 [--cell-size:--spacing(10)]"
          />

          <p className="px-0.5 text-xs text-muted-foreground">
            Selecione datas a partir de {rotuloLimite(minDate)}.
          </p>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAberto(false)}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={aplicar}
              disabled={!rascunho}
              className="cursor-pointer disabled:cursor-not-allowed"
            >
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
