"use client";

/**
 * Controle de filtro avançado E/OU do DataTable (Fase 4 do B-09).
 *
 * Botão "Filtros" no padrão da toolbar (Popover + Button outline) que abre o
 * `GrupoBuilder` (reusado dos Relatórios). Estado do grupo vive no DataTable
 * (este componente é controlado por `onChange`). Um badge mostra quantas
 * condições estão ativas; "Limpar" zera o filtro.
 */

import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  GrupoBuilder,
  type CampoOpcao,
} from "@/components/reports/filtro-avancado-builder";
import {
  type Grupo,
  isGrupo,
  grupoVazio,
} from "@/lib/reports/filtro-avancado";

/**
 * Conta as condições efetivas de um grupo (folhas com `campo` preenchido),
 * recursivamente. Condições sem campo (recém-criadas, ainda em branco) e
 * subgrupos vazios não contam.
 */
export function contarCondicoes(grupo: Grupo): number {
  let n = 0;
  for (const item of grupo.itens) {
    if (isGrupo(item)) {
      n += contarCondicoes(item);
    } else if (item.campo) {
      n += 1;
    }
  }
  return n;
}

interface DataTableFiltroAvancadoProps {
  campos: CampoOpcao[];
  grupo: Grupo;
  onChange: (g: Grupo) => void;
}

export function DataTableFiltroAvancado({
  campos,
  grupo,
  onChange,
}: DataTableFiltroAvancadoProps) {
  const total = contarCondicoes(grupo);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            aria-label={
              total > 0
                ? `Filtro personalizado, ${total} condição(ões) ativa(s)`
                : "Filtro personalizado"
            }
          >
            <Filter className="size-3.5" aria-hidden />
            Filtros
            {total > 0 && (
              <span className="ml-0.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-violet-500">
                {total}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-[min(92vw,34rem)] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Filtro personalizado
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(grupoVazio())}
            disabled={total === 0}
            className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Limpar
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          <GrupoBuilder grupo={grupo} campos={campos} onChange={onChange} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
