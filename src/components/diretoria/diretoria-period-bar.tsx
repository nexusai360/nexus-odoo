"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";

import { cn } from "@/lib/utils";
import { DIRETORIA_PERIODO_PRESETS } from "@/lib/diretoria/periodo";

/**
 * Barra de período da Diretoria com os presets do HTML do cliente. Escreve
 * `periodo`/`de`/`ate` na URL preservando os demais searchParams. Padrão visual
 * do "Consumo do Agente Nex" (pílulas; a ativa em roxo sólido).
 */
export function DiretoriaPeriodBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const atual = sp.get("periodo") ?? "este_mes";

  const [customOpen, setCustomOpen] = useState(atual === "custom");
  const [de, setDe] = useState(sp.get("de") ?? "");
  const [ate, setAte] = useState(sp.get("ate") ?? "");

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
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Período" className="flex flex-wrap items-center gap-2">
        {DIRETORIA_PERIODO_PRESETS.map((p) => {
          if (p.id === "custom") {
            const ativo = atual === "custom";
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => setCustomOpen((o) => !o)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors",
                  ativo
                    ? "bg-violet-600 text-white"
                    : "bg-muted/40 text-foreground/80 hover:bg-muted",
                )}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                {p.label}
              </button>
            );
          }
          const ativo = atual === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => {
                setCustomOpen(false);
                aplicar(p.id);
              }}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm transition-colors",
                ativo
                  ? "bg-violet-600 text-white"
                  : "bg-muted/40 text-foreground/80 hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {customOpen ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/60 bg-card/60 p-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            De
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Até
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-sm text-foreground"
            />
          </label>
          <button
            type="button"
            disabled={!de || !ate}
            onClick={() => aplicar("custom", { de, ate })}
            className="rounded-lg bg-violet-600 px-3.5 py-1.5 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Aplicar
          </button>
        </div>
      ) : null}
    </div>
  );
}
