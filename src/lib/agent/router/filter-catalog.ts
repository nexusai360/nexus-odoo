// R1 router de catalogo: filtra o catalogo MCP entregue ao LLM.
//
// Spec: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §5.2.
// Regras de inclusao:
//  - routerEnabled=false OU fallback.triggered=true  -> catalogo inteiro
//  - senao, filtra por pickedDomains + excludeFromFiltering + UNKNOWN_DOMAIN
//  - dominio sem tool e' ignorado silenciosamente (warn em dev)

import { DOMAINS } from "./domain-vocabulary";
import { UNKNOWN_DOMAIN, getToolDomain } from "./tool-to-domain";
import type {
  CatalogTool,
  FilterCatalogInput,
  FilterCatalogOutput,
} from "./types";

const EXCLUDE_FROM_FILTERING: ReadonlySet<string> = new Set(
  DOMAINS.filter((d) => d.excludeFromFiltering).map((d) => d.domain),
);

export function filterCatalog<T extends CatalogTool>(
  input: FilterCatalogInput<T>,
): FilterCatalogOutput<T> {
  const { allTools, decision, routerEnabled } = input;

  // Caminho 1: shadow ou fallback -> catalogo inteiro.
  if (!routerEnabled || decision.fallback.triggered) {
    return {
      tools: allTools,
      diagnostic: {
        totalIn: allTools.length,
        totalOut: allTools.length,
        domainsRepresented: collectDomains(allTools),
        filtered: false,
      },
    };
  }

  // Caminho 2: filtragem efetiva.
  const allowedDomains: Set<string> = new Set();
  for (const d of decision.pickedDomains) allowedDomains.add(d);
  for (const d of EXCLUDE_FROM_FILTERING) allowedDomains.add(d);
  allowedDomains.add(UNKNOWN_DOMAIN); // conservador: tool desconhecida fica.

  // Quais dominios pedidos NAO tem tool no catalogo? Warn em dev.
  const domainsInCatalog = new Set(
    allTools.map((t) => getToolDomain(t.name)),
  );
  const emptyPicked = decision.pickedDomains.filter(
    (d) => !domainsInCatalog.has(d),
  );
  if (emptyPicked.length > 0 && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.warn("[router:filter] dominios sem tool no catalogo, ignorados:", {
      empty: emptyPicked,
    });
  }

  const tools = allTools.filter((t) =>
    allowedDomains.has(getToolDomain(t.name)),
  );

  return {
    tools,
    diagnostic: {
      totalIn: allTools.length,
      totalOut: tools.length,
      domainsRepresented: collectDomains(tools),
      filtered: true,
    },
  };
}

function collectDomains<T extends CatalogTool>(tools: T[]): string[] {
  const set = new Set<string>();
  for (const t of tools) set.add(getToolDomain(t.name));
  return Array.from(set).sort();
}
