"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomRangePopover } from "./custom-range-popover";
import {
  periodoParaParams,
  rotuloPeriodo,
  type PeriodoPreset,
  type PeriodoResolvido,
} from "@/lib/reports/periodo";

const PRESETS: { preset: Exclude<PeriodoPreset, "custom">; label: string }[] = [
  { preset: "mes", label: "Este mês" },
  { preset: "3meses", label: "Últimos 3 meses" },
  { preset: "ano", label: "Este ano" },
  { preset: "tudo", label: "Tudo" },
];

interface PeriodBarProps {
  periodo: PeriodoResolvido;
  /** Mês mais antigo com dado ("YYYY-MM") , limita o calendário personalizado. */
  mesMin?: string | null;
}

/**
 * Barra de período: pílulas de preset + "Personalizado". Escreve o estado na
 * URL (`periodo`/`de`/`ate`), preservando os demais searchParams.
 */
export function PeriodBar({ periodo, mesMin }: PeriodBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function aplicar(p: PeriodoResolvido) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("periodo");
    params.delete("de");
    params.delete("ate");
    for (const [k, v] of Object.entries(periodoParaParams(p))) {
      params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const pillClass = (ativo: boolean) =>
    cn(
      "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
      ativo
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
    );

  const customAtivo = periodo.preset === "custom";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        Período
      </span>
      <div
        role="radiogroup"
        aria-label="Período"
        className="flex flex-wrap items-center gap-2"
      >
        {PRESETS.map(({ preset, label }) => {
          const ativo = periodo.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={ativo}
              tabIndex={0}
              className={pillClass(ativo)}
              onClick={() => aplicar({ preset, de: null, ate: null })}
            >
              {label}
            </button>
          );
        })}
        <CustomRangePopover
          periodo={periodo}
          mesMin={mesMin}
          onAplicar={(de, ate) => aplicar({ preset: "custom", de, ate })}
        >
          <button
            type="button"
            role="radio"
            aria-checked={customAtivo}
            tabIndex={0}
            className={pillClass(customAtivo)}
          >
            <CalendarDays className="size-4" aria-hidden />
            {customAtivo ? rotuloPeriodo(periodo) : "Personalizado"}
          </button>
        </CustomRangePopover>
      </div>
    </div>
  );
}
