import { buildProfileFromRows, dominioDaTool } from "./build";

const NOW = 1_700_000_000_000;

describe("dominioDaTool", () => {
  it("deriva dominio do prefixo", () => {
    expect(dominioDaTool("fiscal_faturamento_por_empresa")).toBe("fiscal");
    expect(dominioDaTool("estoque_saldo_produto")).toBe("estoque");
    expect(dominioDaTool("cadastro_buscar_parceiro")).toBe("cadastros");
    expect(dominioDaTool("contabil_plano_de_contas")).toBe("contabil");
    expect(dominioDaTool("registrar_lacuna")).toBeNull();
  });
});

describe("buildProfileFromRows", () => {
  it("detecta afinidade de breakdown quando ha dominancia", () => {
    const p = buildProfileFromRows({
      topics: [],
      questions: [],
      nowMs: NOW,
      toolCalls: [
        { toolName: "fiscal_faturamento_por_empresa", count: 3, lastSeenMs: NOW },
        { toolName: "fiscal_faturamento_por_cfop", count: 1, lastSeenMs: NOW },
      ],
    });
    expect(p.presentationPrefs.faturamento?.breakdownPreferido).toBe("empresa");
    expect(p.preferredDomains).toContain("fiscal");
  });

  it("NAO grava pref sem dominancia", () => {
    const p = buildProfileFromRows({
      topics: [],
      questions: [],
      nowMs: NOW,
      toolCalls: [
        { toolName: "fiscal_faturamento_por_empresa", count: 2, lastSeenMs: NOW },
        { toolName: "fiscal_faturamento_por_cfop", count: 2, lastSeenMs: NOW },
      ],
    });
    expect(p.presentationPrefs.faturamento).toBeUndefined();
  });

  it("rankeia topicos por score decaido e descarta antigos fracos", () => {
    const DAY = 86_400_000;
    const p = buildProfileFromRows({
      toolCalls: [],
      questions: [],
      nowMs: NOW,
      topics: [
        { topic: "estoque", count: 10, lastSeenMs: NOW },
        { topic: "fiscal", count: 1, lastSeenMs: NOW - 180 * DAY }, // velho e fraco -> some
      ],
    });
    expect(p.topTopics.map((t) => t.topic)).toEqual(["estoque"]);
  });

  it("recurringQuestions guarda so o label (sem score) e respeita o piso", () => {
    const p = buildProfileFromRows({
      toolCalls: [],
      topics: [],
      nowMs: NOW,
      questions: [{ label: "faturamento", count: 5, lastSeenMs: NOW }],
    });
    expect(p.recurringQuestions[0]).toEqual({
      label: "faturamento",
      count: 5,
      lastSeenAt: new Date(NOW).toISOString(),
    });
  });
});
