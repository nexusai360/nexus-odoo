import { describe, expect, it } from "@jest/globals";
import { maybeExpandCatalogAndRetry } from "./router-retry";
import type { RouterDecision } from "../router/types";

function decision(overrides: Partial<RouterDecision> = {}): RouterDecision {
  return {
    pickedDomains: ["financeiro"],
    scores: { financeiro: 0.6 },
    topScore: 0.6,
    fallback: { triggered: false },
    pickDurationMs: 5,
    routerVersion: "r1.0.0-aaaaaaaa",
    ...overrides,
  };
}

const TOOLS = [{ name: "a" }, { name: "b" }, { name: "c" }];

const BASE = {
  validatorReason: "sem_metrica" as const,
  routerDecision: decision({ topScore: 0.5 }),
  allTools: TOOLS,
  expandThreshold: 0.7,
  routerRetryEnabled: true,
  routerMode: "active" as const,
};

describe("maybeExpandCatalogAndRetry: disparo positivo", () => {
  it("dispara retry quando todas as condicoes batem", () => {
    const r = maybeExpandCatalogAndRetry(BASE);
    expect(r).not.toBeNull();
    expect(r!.shouldRetry).toBe(true);
    expect(r!.expandedCatalog).toBe(TOOLS);
    expect(r!.fallbackReasonSuffix).toBe("+retry_v5_expanded");
  });
});

describe("maybeExpandCatalogAndRetry: master switch routerRetryEnabled", () => {
  it("retorna null quando routerRetryEnabled=false", () => {
    expect(
      maybeExpandCatalogAndRetry({ ...BASE, routerRetryEnabled: false }),
    ).toBeNull();
  });
});

describe("maybeExpandCatalogAndRetry: routerMode", () => {
  it("retorna null em shadow", () => {
    expect(
      maybeExpandCatalogAndRetry({ ...BASE, routerMode: "shadow" }),
    ).toBeNull();
  });

  it("retorna null em qualquer outro modo", () => {
    expect(
      maybeExpandCatalogAndRetry({ ...BASE, routerMode: "calibracao" }),
    ).toBeNull();
  });
});

describe("maybeExpandCatalogAndRetry: validatorReason", () => {
  it("retorna null quando reason e null", () => {
    expect(
      maybeExpandCatalogAndRetry({ ...BASE, validatorReason: null }),
    ).toBeNull();
  });

  it("retorna null quando reason e undefined", () => {
    expect(
      maybeExpandCatalogAndRetry({ ...BASE, validatorReason: undefined }),
    ).toBeNull();
  });

  it("retorna null quando reason e outro tipo de falha", () => {
    expect(
      maybeExpandCatalogAndRetry({
        ...BASE,
        validatorReason: "dado_inventado",
      }),
    ).toBeNull();
  });
});

describe("maybeExpandCatalogAndRetry: routerDecision.fallback", () => {
  it("retorna null se router ja estava em fallback (catalogo era inteiro)", () => {
    expect(
      maybeExpandCatalogAndRetry({
        ...BASE,
        routerDecision: decision({
          fallback: { triggered: true, reason: "score_baixo" },
          topScore: 0.4,
        }),
      }),
    ).toBeNull();
  });
});

describe("maybeExpandCatalogAndRetry: expandThreshold", () => {
  it("retorna null quando topScore >= threshold (router confiante)", () => {
    expect(
      maybeExpandCatalogAndRetry({
        ...BASE,
        routerDecision: decision({ topScore: 0.9 }),
      }),
    ).toBeNull();
  });

  it("retorna null quando topScore = threshold exato", () => {
    expect(
      maybeExpandCatalogAndRetry({
        ...BASE,
        routerDecision: decision({ topScore: 0.7 }),
        expandThreshold: 0.7,
      }),
    ).toBeNull();
  });

  it("dispara quando topScore = threshold - epsilon", () => {
    const r = maybeExpandCatalogAndRetry({
      ...BASE,
      routerDecision: decision({ topScore: 0.69 }),
      expandThreshold: 0.7,
    });
    expect(r).not.toBeNull();
  });

  it("dispara quando topScore e null (router nao computou)", () => {
    const r = maybeExpandCatalogAndRetry({
      ...BASE,
      routerDecision: decision({ topScore: null }),
    });
    expect(r).not.toBeNull();
  });
});

describe("maybeExpandCatalogAndRetry: ordem das condicoes", () => {
  it("master switch curto-circuita as outras", () => {
    const r = maybeExpandCatalogAndRetry({
      ...BASE,
      routerRetryEnabled: false,
      validatorReason: "sem_metrica",
      routerDecision: decision({ topScore: 0.1 }),
    });
    expect(r).toBeNull();
  });

  it("modo shadow curto-circuita validatorReason", () => {
    const r = maybeExpandCatalogAndRetry({
      ...BASE,
      routerMode: "shadow",
      validatorReason: "sem_metrica",
      routerDecision: decision({ topScore: 0.1 }),
    });
    expect(r).toBeNull();
  });
});

describe("maybeExpandCatalogAndRetry: tipos genericos", () => {
  it("preserva o tipo do catalogo passado", () => {
    type Tool = { name: string; description: string };
    const typedTools: Tool[] = [
      { name: "a", description: "desc-a" },
      { name: "b", description: "desc-b" },
    ];
    const r = maybeExpandCatalogAndRetry<Tool>({
      ...BASE,
      allTools: typedTools,
    });
    expect(r).not.toBeNull();
    expect(r!.expandedCatalog).toBe(typedTools);
    // O tipo deve estar preservado em compile-time, validamos apenas runtime aqui.
    expect(r!.expandedCatalog[0]!.description).toBe("desc-a");
  });
});
