// R1 router de catalogo: filtra o catalogo MCP entregue ao LLM.
//
// Spec original: docs/superpowers/specs/2026-05-28-router-catalogo-design.md §5.2.
// RBAC v2 (SPEC §6.1): adicionada camada B (gate de permissão), aplicada APÓS
// a camada A do Router, SEMPRE quando `userAllowedDomains` é fornecido.
//
// Camada A (Router R1):
//  - routerEnabled=false OU fallback.triggered=true  -> catalogo inteiro
//  - senao, filtra por pickedDomains + EXCLUDE_FROM_FILTERING + UNKNOWN_DOMAIN
//
// Camada B (RBAC v2):
//  - userAllowedDomains === "all" ou undefined  -> sem corte (backwards-compat)
//  - senao, corta toda tool cujo dominio nao esta em
//    userAllowedDomains UNIAO EXCLUDE_FROM_FILTERING UNIAO {UNKNOWN_DOMAIN}

import { DOMAINS } from "./domain-vocabulary";
import { UNKNOWN_DOMAIN, getToolDomain } from "./tool-to-domain";
import type {
  CatalogTool,
  FilterCatalogInput,
  FilterCatalogOutput,
} from "./types";

export const EXCLUDE_FROM_FILTERING: ReadonlySet<string> = new Set(
  DOMAINS.filter((d) => d.excludeFromFiltering).map((d) => d.domain),
);

export function filterCatalog<T extends CatalogTool>(
  input: FilterCatalogInput<T>,
): FilterCatalogOutput<T> {
  const { allTools, decision, routerEnabled, userAllowedDomains } = input;

  // CAMADA A — Router R1 (existente).
  let afterRouterA: T[];
  let routerCut: boolean;
  if (!routerEnabled || decision.fallback.triggered) {
    afterRouterA = allTools;
    routerCut = false;
  } else {
    const allowedByRouter: Set<string> = new Set();
    for (const d of decision.pickedDomains) allowedByRouter.add(d);
    for (const d of EXCLUDE_FROM_FILTERING) allowedByRouter.add(d);
    allowedByRouter.add(UNKNOWN_DOMAIN); // conservador.

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

    afterRouterA = allTools.filter((t) =>
      allowedByRouter.has(getToolDomain(t.name)),
    );
    routerCut = true;
  }

  // CAMADA B — Gate de permissão do RBAC v2.
  // Backwards-compat: callers que não passam userAllowedDomains ou passam "all"
  // recebem o resultado da camada A inalterado.
  let afterPermissionB: T[];
  let permissionFilteredOut = 0;
  if (userAllowedDomains === undefined || userAllowedDomains === "all") {
    afterPermissionB = afterRouterA;
  } else {
    const allowedByPermission: Set<string> = new Set(userAllowedDomains);
    afterPermissionB = afterRouterA.filter((t) => {
      const dom = getToolDomain(t.name);
      const passes =
        allowedByPermission.has(dom) ||
        EXCLUDE_FROM_FILTERING.has(dom) ||
        dom === UNKNOWN_DOMAIN;
      if (!passes) permissionFilteredOut++;
      return passes;
    });
  }

  return {
    tools: afterPermissionB,
    diagnostic: {
      totalIn: allTools.length,
      totalOut: afterPermissionB.length,
      domainsRepresented: collectDomains(afterPermissionB),
      filtered: routerCut,
      permissionFilteredOut,
    },
  };
}

function collectDomains<T extends CatalogTool>(tools: T[]): string[] {
  const set = new Set<string>();
  for (const t of tools) set.add(getToolDomain(t.name));
  return Array.from(set).sort();
}
