import { describe, expect, it } from "@jest/globals";
import { filterCatalog } from "../filter-catalog";
import type { RouterDecision, CatalogTool } from "../types";

const TOOLS: CatalogTool[] = [
  { name: "fiscal_notas_emitidas" },
  { name: "fiscal_notas_recebidas" },
  { name: "financeiro_contas_pagar" },
  { name: "financeiro_saldo" },
  { name: "comercial_pedidos" },
  { name: "estoque_saldo" },
  { name: "cadastros_clientes" },
  { name: "caminho3_bi_consulta" },
  { name: "tool_misteriosa" }, // dominio desconhecido
];

function buildDecision(overrides: Partial<RouterDecision> = {}): RouterDecision {
  return {
    pickedDomains: ["financeiro"],
    scores: { financeiro: 0.9 },
    topScore: 0.9,
    fallback: { triggered: false },
    pickDurationMs: 5,
    routerVersion: "r1.0.0-aaaaaaaa",
    ...overrides,
  };
}

describe("filterCatalog: routerEnabled=false", () => {
  it("retorna catalogo inteiro em shadow", () => {
    const out = filterCatalog({
      allTools: TOOLS,
      decision: buildDecision(),
      routerEnabled: false,
    });
    expect(out.tools).toHaveLength(TOOLS.length);
    expect(out.diagnostic.filtered).toBe(false);
  });
});

describe("filterCatalog: fallback triggered", () => {
  it("retorna catalogo inteiro mesmo com routerEnabled=true", () => {
    const out = filterCatalog({
      allTools: TOOLS,
      decision: buildDecision({
        fallback: { triggered: true, reason: "score_baixo" },
      }),
      routerEnabled: true,
    });
    expect(out.tools).toHaveLength(TOOLS.length);
    expect(out.diagnostic.filtered).toBe(false);
  });
});

describe("filterCatalog: filtragem efetiva", () => {
  it("filtra so para os dominios picked + escape hatch + desconhecido", () => {
    const out = filterCatalog({
      allTools: TOOLS,
      decision: buildDecision({ pickedDomains: ["financeiro"] }),
      routerEnabled: true,
    });
    const names = out.tools.map((t) => t.name);
    // financeiro entra (picked)
    expect(names).toContain("financeiro_contas_pagar");
    expect(names).toContain("financeiro_saldo");
    // caminho3 entra (excludeFromFiltering)
    expect(names).toContain("caminho3_bi_consulta");
    // tool_misteriosa entra (dominio desconhecido, conservador)
    expect(names).toContain("tool_misteriosa");
    // fiscal NAO entra
    expect(names).not.toContain("fiscal_notas_emitidas");
    // comercial NAO entra
    expect(names).not.toContain("comercial_pedidos");
  });

  it("multiplos dominios picked", () => {
    const out = filterCatalog({
      allTools: TOOLS,
      decision: buildDecision({ pickedDomains: ["fiscal", "estoque"] }),
      routerEnabled: true,
    });
    const names = out.tools.map((t) => t.name);
    expect(names).toContain("fiscal_notas_emitidas");
    expect(names).toContain("estoque_saldo");
    expect(names).not.toContain("financeiro_saldo");
  });

  it("diagnostic.filtered=true em modo ativo sem fallback", () => {
    const out = filterCatalog({
      allTools: TOOLS,
      decision: buildDecision(),
      routerEnabled: true,
    });
    expect(out.diagnostic.filtered).toBe(true);
    expect(out.diagnostic.totalOut).toBeLessThan(TOOLS.length);
  });

  it("idempotencia: filtrar 2x da o mesmo resultado", () => {
    const decision = buildDecision({ pickedDomains: ["financeiro"] });
    const a = filterCatalog({
      allTools: TOOLS,
      decision,
      routerEnabled: true,
    });
    const b = filterCatalog({
      allTools: a.tools,
      decision,
      routerEnabled: true,
    });
    expect(b.tools.map((t) => t.name)).toEqual(a.tools.map((t) => t.name));
  });

  it("pickedDomains vazio + escape hatch -> so caminho3/dominios-vazios", () => {
    const out = filterCatalog({
      allTools: TOOLS,
      decision: buildDecision({ pickedDomains: [] }),
      routerEnabled: true,
    });
    const names = out.tools.map((t) => t.name);
    // Tudo que NAO e caminho3 nem unknown NAO entra
    expect(names).toContain("caminho3_bi_consulta");
    expect(names).toContain("tool_misteriosa"); // desconhecido
    expect(names).not.toContain("financeiro_saldo");
  });

  it("catalogo vazio retorna vazio", () => {
    const out = filterCatalog({
      allTools: [],
      decision: buildDecision(),
      routerEnabled: true,
    });
    expect(out.tools).toEqual([]);
    expect(out.diagnostic.totalIn).toBe(0);
    expect(out.diagnostic.totalOut).toBe(0);
  });

  it("dominio picked sem tool no catalogo (ex: crm) e ignorado silenciosamente", () => {
    const out = filterCatalog({
      allTools: TOOLS,
      decision: buildDecision({ pickedDomains: ["crm"] }),
      routerEnabled: true,
    });
    const names = out.tools.map((t) => t.name);
    // crm nao tem tool no catalogo -> nada de crm entra
    // mas caminho3 + desconhecido entram
    expect(names).toContain("caminho3_bi_consulta");
    expect(names).toContain("tool_misteriosa");
    expect(names).not.toContain("fiscal_notas_emitidas");
  });

  it("totalIn registra o catalogo original", () => {
    const out = filterCatalog({
      allTools: TOOLS,
      decision: buildDecision(),
      routerEnabled: true,
    });
    expect(out.diagnostic.totalIn).toBe(TOOLS.length);
  });

  it("domainsRepresented lista todos os dominios das tools finais", () => {
    const out = filterCatalog({
      allTools: TOOLS,
      decision: buildDecision({ pickedDomains: ["financeiro", "fiscal"] }),
      routerEnabled: true,
    });
    expect(out.diagnostic.domainsRepresented).toContain("financeiro");
    expect(out.diagnostic.domainsRepresented).toContain("fiscal");
    expect(out.diagnostic.domainsRepresented).toContain("caminho3");
  });
});
