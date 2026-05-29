"use client";

/**
 * R1 router de catalogo: filtros do painel de monitoramento (periodo + origem).
 *
 * Padrao visual alinhado ao resto do Monitoramento: periodo em segmented
 * control de pilulas (igual ao MonitoramentoNav) e origem via CustomSelect (o
 * mesmo dropdown do filtro do Backtest). Atualiza a URL (searchParams); o
 * Server Component da pagina refaz as queries filtradas.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";
import { CustomSelect } from "@/components/ui/custom-select";

const PERIOD_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "3650", label: "Tudo" },
];

const MODE_OPTIONS = [
  { value: "todos", label: "Todas as origens" },
  { value: "calibracao", label: "Calibragem" },
  { value: "shadow", label: "Shadow (producao)" },
  { value: "active", label: "Ativo (producao)" },
];

interface Props {
  periodo: string;
  modo: string;
}

export function RouterFilters({ periodo, modo }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {/* Periodo: segmented control de pilulas (padrao MonitoramentoNav). */}
      <div
        role="group"
        aria-label="Periodo"
        className={cn(
          "inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1",
          pending && "opacity-70",
        )}
      >
        {PERIOD_OPTIONS.map((o) => {
          const active = periodo === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              disabled={pending}
              onClick={() => update("periodo", o.value)}
              className={cn(
                "inline-flex cursor-pointer items-center rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Origem: dropdown CustomSelect (mesmo do filtro do Backtest). */}
      <CustomSelect
        value={modo}
        onChange={(v) => update("modo", v)}
        triggerClassName="min-h-[36px] h-9 min-w-[180px]"
        aria-label="Origem das decisoes"
        options={MODE_OPTIONS}
      />
    </div>
  );
}
