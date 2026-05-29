// R1 router de catalogo: testes de integracao da Wave C1 (wire em run-agent).
//
// Valida que o helper de filter-catalog usado pelo run-agent decide
// corretamente entre shadow e active, e que multi-tool turn nao perde nada.

import { describe, expect, it } from "@jest/globals";
import { filterCatalog } from "../router/filter-catalog";
import { getToolDomains } from "../router/tool-to-domain";
import type { RouterDecision } from "../router/types";

const FULL_CATALOG = [
  { name: "fiscal_notas_emitidas", description: "" },
  { name: "fiscal_notas_recebidas", description: "" },
  { name: "financeiro_contas_pagar", description: "" },
  { name: "financeiro_saldo", description: "" },
  { name: "comercial_pedidos", description: "" },
  { name: "estoque_saldo", description: "" },
  { name: "cadastros_clientes", description: "" },
  { name: "caminho3_bi_consulta", description: "" },
];

function decision(over: Partial<RouterDecision> = {}): RouterDecision {
  return {
    pickedDomains: ["financeiro"],
    scores: { financeiro: 0.85, fiscal: 0.4 },
    topScore: 0.85,
    fallback: { triggered: false },
    pickDurationMs: 12,
    routerVersion: "r1.0.0-aaaaaaaa",
    ...over,
  };
}

describe("Wave C1 integration: shadow mode", () => {
  it("catalogo inteiro entregue ao LLM em shadow (decisao logica ignorada)", () => {
    const out = filterCatalog({
      allTools: FULL_CATALOG,
      decision: decision({ pickedDomains: ["financeiro"] }),
      routerEnabled: false,
    });
    expect(out.tools).toHaveLength(FULL_CATALOG.length);
    expect(out.diagnostic.filtered).toBe(false);
  });
});

describe("Wave C1 integration: active mode", () => {
  it("active filtra catalogo, caminho3 entra sempre", () => {
    const out = filterCatalog({
      allTools: FULL_CATALOG,
      decision: decision({ pickedDomains: ["financeiro"] }),
      routerEnabled: true,
    });
    const names = out.tools.map((t) => t.name);
    expect(names).toContain("financeiro_saldo");
    expect(names).toContain("financeiro_contas_pagar");
    expect(names).toContain("caminho3_bi_consulta");
    expect(names).not.toContain("fiscal_notas_emitidas");
    expect(names).not.toContain("comercial_pedidos");
    expect(out.diagnostic.filtered).toBe(true);
  });

  it("active + fallback triggered = catalogo inteiro (escape hatch)", () => {
    const out = filterCatalog({
      allTools: FULL_CATALOG,
      decision: decision({
        fallback: { triggered: true, reason: "score_baixo" },
        pickedDomains: [],
      }),
      routerEnabled: true,
    });
    expect(out.tools).toHaveLength(FULL_CATALOG.length);
    expect(out.diagnostic.filtered).toBe(false);
  });
});

describe("Wave C1 integration: multi-tool turn (KPI top-1)", () => {
  it("captura todas as N tools chamadas no mesmo turno", () => {
    // Cenario simulado: agente chamou 3 tools em sequencia.
    const toolsUsedNoTurno = [
      "cadastros_clientes_resolver",
      "financeiro_saldo",
      "financeiro_contas_pagar",
    ];
    const domains = getToolDomains(toolsUsedNoTurno);
    expect(domains).toEqual(["cadastros", "financeiro", "financeiro"]);
  });

  it("KPI top-1: acerto se qualquer tool chamada esta no dominio top-1", () => {
    const picked = decision({ pickedDomains: ["financeiro", "cadastros"] });
    const toolsUsed = ["financeiro_saldo"];
    const domainsUsed = getToolDomains(toolsUsed);
    const top1 = picked.pickedDomains[0];
    const acerto = domainsUsed.some((d) => d === top1);
    expect(acerto).toBe(true);
  });

  it("KPI top-1: nao-acerto quando tools de fato chamadas estao fora", () => {
    const picked = decision({ pickedDomains: ["financeiro", "cadastros"] });
    const toolsUsed = ["fiscal_notas_emitidas"];
    const domainsUsed = getToolDomains(toolsUsed);
    const top1 = picked.pickedDomains[0];
    const acerto = domainsUsed.some((d) => d === top1);
    expect(acerto).toBe(false);
  });
});

describe("Wave C1 integration: dominio picked sem tool", () => {
  it("crm picked sem tool no catalogo -> ignorado silenciosamente", () => {
    const out = filterCatalog({
      allTools: FULL_CATALOG,
      decision: decision({ pickedDomains: ["crm"] }),
      routerEnabled: true,
    });
    const names = out.tools.map((t) => t.name);
    // crm nao tem tool no catalogo, mas caminho3 entra como escape hatch.
    expect(names).toContain("caminho3_bi_consulta");
    expect(names).not.toContain("financeiro_saldo");
    expect(names).not.toContain("fiscal_notas_emitidas");
  });
});

describe("Wave C1 integration: ROUTER_FORCE_DISABLE", () => {
  // O env var override e' aplicado em src/lib/agent/run-agent.ts antes de
  // chamar filterCatalog: routerEnabled fica false. Testamos o efeito final.
  it("simula ROUTER_FORCE_DISABLE=true (env override) -> shadow", () => {
    // Mesmo com decisao "active" no logico, se routerEnabled vier false,
    // catalogo inteiro entregue.
    const out = filterCatalog({
      allTools: FULL_CATALOG,
      decision: decision({ pickedDomains: ["financeiro"] }),
      routerEnabled: false, // simulando override
    });
    expect(out.tools).toHaveLength(FULL_CATALOG.length);
  });
});
