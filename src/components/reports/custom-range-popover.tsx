"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { mesCorrente, type PeriodoResolvido } from "@/lib/reports/periodo";

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

interface CustomRangePopoverProps {
  /** Período corrente — pré-seleciona os meses ao abrir. */
  periodo: PeriodoResolvido;
  /** Chamado ao aplicar um intervalo válido (meses em ordem crescente). */
  onAplicar: (de: string, ate: string) => void;
  /** Elemento gatilho (a pílula "Personalizado" da PeriodBar). */
  children: React.ReactElement;
}

/** "YYYY-MM" de um ano + índice de mês (0–11). */
function mesStr(ano: number, i: number): string {
  return `${ano}-${String(i + 1).padStart(2, "0")}`;
}

/**
 * Popover de seleção de intervalo de meses. Grão de mês — grade de 12 meses
 * navegável por ano. Meses futuros (> mês corrente) ficam desabilitados.
 */
export function CustomRangePopover({
  periodo,
  onAplicar,
  children,
}: CustomRangePopoverProps) {
  const corrente = mesCorrente();
  const anoCorrente = Number(corrente.slice(0, 4));
  const iniDe = periodo.preset === "custom" ? periodo.de : null;
  const iniAte = periodo.preset === "custom" ? periodo.ate : null;

  const [open, setOpen] = useState(false);
  const [de, setDe] = useState<string | null>(iniDe);
  const [ate, setAte] = useState<string | null>(iniAte);
  const [ano, setAno] = useState<number>(
    iniAte ? Number(iniAte.slice(0, 4)) : anoCorrente,
  );

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (v) {
      // Ao abrir, ressincroniza o estado com o período corrente.
      setDe(iniDe);
      setAte(iniAte);
      setAno(iniAte ? Number(iniAte.slice(0, 4)) : anoCorrente);
    }
  }

  function selecionar(m: string) {
    if (de === null || ate !== null) {
      // Inicia um novo intervalo.
      setDe(m);
      setAte(null);
    } else if (m < de) {
      setAte(de);
      setDe(m);
    } else {
      setAte(m);
    }
  }

  function aplicar() {
    if (de && ate) {
      onAplicar(de, ate);
      setOpen(false);
    }
  }

  const podeAplicar = de !== null && ate !== null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={children} />
      <PopoverContent className="w-72" align="start">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Ano anterior"
            onClick={() => setAno((a) => a - 1)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-semibold tabular-nums">{ano}</span>
          <button
            type="button"
            aria-label="Próximo ano"
            onClick={() => setAno((a) => a + 1)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MESES.map((label, i) => {
            const m = mesStr(ano, i);
            const futuro = m > corrente;
            const isDe = m === de;
            const isAte = m === ate;
            const noIntervalo =
              de !== null && ate !== null && m > de && m < ate;
            const ativo = isDe || isAte;
            return (
              <button
                key={m}
                type="button"
                disabled={futuro}
                aria-disabled={futuro}
                aria-pressed={ativo}
                aria-label={`${MESES_LONGOS[i]} de ${ano}`}
                onClick={() => selecionar(m)}
                className={cn(
                  "flex h-11 items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  futuro && "cursor-not-allowed opacity-40",
                  !futuro && "cursor-pointer",
                  !futuro &&
                    !ativo &&
                    !noIntervalo &&
                    "hover:bg-muted",
                  noIntervalo && "bg-primary/15 text-foreground",
                  ativo && "bg-primary text-primary-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" disabled={!podeAplicar} onClick={aplicar}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
