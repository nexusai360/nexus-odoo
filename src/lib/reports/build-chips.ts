// src/lib/reports/build-chips.ts

import { limparNomeLocal } from "@/lib/reports/local-nome";
import type { FiltroAtivoChip } from "@/components/reports/applied-filters-chips";
import type { FilterOptions } from "@/components/reports/report-filters";

const SENTIDO_LABEL: Record<string, string> = {
  entrada: "Entradas",
  saida: "Saídas",
};

const FAIXA_DIAS_LABEL: Record<string, string> = {
  "30": "+30 dias",
  "60": "+60 dias",
  "90": "+90 dias",
};

/**
 * Constrói a lista de chips de filtros aplicados a partir dos searchParams
 * e das opções disponíveis (armazéns e famílias). Retorna apenas os filtros
 * que têm valor não-vazio e que fazem parte dos filtros declarados no relatório.
 *
 * Reutilizável pela F6 (construtor de relatórios): recebe apenas os params
 * e as opções, sem acoplamento ao catálogo de relatórios.
 */
export function buildChipsFromParams(
  params: URLSearchParams,
  options: FilterOptions,
): FiltroAtivoChip[] {
  const chips: FiltroAtivoChip[] = [];

  const armazemId = params.get("armazemId");
  if (armazemId) {
    const found = options.armazens.find((a) => String(a.id) === armazemId);
    const valorLabel = found
      ? limparNomeLocal(found.nome).rotulo
      : `Armazém #${armazemId}`;
    chips.push({ param: "armazemId", rotulo: "Armazém", valorLabel });
  }

  const familiaId = params.get("familiaId");
  if (familiaId) {
    const found = options.familias.find((f) => String(f.id) === familiaId);
    const valorLabel = found ? found.nome : `Família #${familiaId}`;
    chips.push({ param: "familiaId", rotulo: "Família", valorLabel });
  }

  const sentido = params.get("sentido");
  if (sentido && SENTIDO_LABEL[sentido]) {
    chips.push({
      param: "sentido",
      rotulo: "Sentido",
      valorLabel: SENTIDO_LABEL[sentido]!,
    });
  }

  const faixaDias = params.get("faixaDias");
  if (faixaDias && FAIXA_DIAS_LABEL[faixaDias]) {
    chips.push({
      param: "faixaDias",
      rotulo: "Faixa de dias",
      valorLabel: FAIXA_DIAS_LABEL[faixaDias]!,
    });
  }

  return chips;
}
