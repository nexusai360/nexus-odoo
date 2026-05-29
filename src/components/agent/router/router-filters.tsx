"use client";

/**
 * R1 router de catalogo: filtros do painel de monitoramento (periodo + origem).
 *
 * Mesma ideia do filtro do Backtest: dois selects que atualizam a URL
 * (searchParams), e o Server Component da pagina refaz as queries filtradas.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Calendar, Filter, Loader2 } from "lucide-react";

const PERIOD_OPTIONS = [
  { value: "7", label: "Ultimos 7 dias" },
  { value: "14", label: "Ultimos 14 dias" },
  { value: "30", label: "Ultimos 30 dias" },
  { value: "90", label: "Ultimos 90 dias" },
  { value: "3650", label: "Todo o periodo" },
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
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <select
          value={periodo}
          onChange={(e) => update("periodo", e.target.value)}
          disabled={pending}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={modo}
          onChange={(e) => update("modo", e.target.value)}
          disabled={pending}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          {MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {pending && (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
