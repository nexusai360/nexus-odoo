"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";

import { cn } from "@/lib/utils";
import { DIRETORIA_PERIODO_PRESETS } from "@/lib/diretoria/periodo";
import { DiretoriaRangePicker } from "@/components/diretoria/diretoria-range-picker";

/** Intervalo formatado para a pílula ativa (ex.: "01 mai – 30 jun"). */
function formatRange(start: string, end: string): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  const toDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
    return new Date(y, m - 1, d);
  };
  const s = fmt.format(toDate(start)).replace(".", "");
  const e = fmt.format(toDate(end)).replace(".", "");
  return `${s} a ${e}`;
}

/**
 * Barra de período da Diretoria com os presets do HTML do cliente. Escreve
 * `periodo`/`de`/`ate` na URL preservando os demais searchParams. O preset
 * "Personalizado" abre o calendário de 2 meses (DiretoriaRangePicker) em popover.
 */
export function DiretoriaPeriodBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const atual = sp.get("periodo") ?? "este_mes";
  const de = sp.get("de") ?? "";
  const ate = sp.get("ate") ?? "";

  const [pickerOpen, setPickerOpen] = useState(false);

  function aplicar(periodo: string, range?: { de: string; ate: string }) {
    const params = new URLSearchParams(sp.toString());
    params.set("periodo", periodo);
    if (range) {
      params.set("de", range.de);
      params.set("ate", range.ate);
    } else {
      params.delete("de");
      params.delete("ate");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Período"
      className="flex flex-wrap items-center gap-2"
    >
      {DIRETORIA_PERIODO_PRESETS.map((p) => {
        const ativo = atual === p.id;
        const pillClasses = cn(
          "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors",
          ativo
            ? "bg-violet-600 text-white"
            : "bg-muted/40 text-foreground/80 hover:bg-muted",
        );

        if (p.id === "custom") {
          const rotulo = ativo && de && ate ? formatRange(de, ate) : p.label;
          return (
            <DiretoriaRangePicker
              key={p.id}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              initialRange={de && ate ? { start: de, end: ate } : undefined}
              onApply={(range) => aplicar("custom", { de: range.start, ate: range.end })}
              trigger={
                <button
                  type="button"
                  aria-pressed={ativo}
                  aria-label={
                    ativo && de && ate
                      ? `Período personalizado: ${formatRange(de, ate)}`
                      : "Selecionar período personalizado"
                  }
                  className={cn(pillClasses, ativo && "border border-violet-300/50")}
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  {rotulo}
                </button>
              }
            />
          );
        }

        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => {
              setPickerOpen(false);
              aplicar(p.id);
            }}
            className={pillClasses}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
