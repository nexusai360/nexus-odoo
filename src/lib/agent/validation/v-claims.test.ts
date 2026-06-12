// Onda P (Arquitetura 3.0) P.3 , testes dos V-claims.
import { validateV10Percentuais, validateV11RankingItem, validateV12Consistencia, validateV13Proveniencia } from "./v-claims";
import type { ValidationContext } from "./auto-validator";

function ctx(partial: Partial<ValidationContext>): ValidationContext {
  return {
    question: "pergunta",
    llmResponse: "",
    toolResults: [],
    ...partial,
  };
}

describe("V10 , percentuais/variacoes recomputados (shadow)", () => {
  test("percentual derivavel de par das fontes passa (35,6% = 4682948.64/13153133.05)", () => {
    const r = validateV10Percentuais(
      ctx({
        llmResponse: "Do total, R$ 4.682.948,64 foram intercompany, 35,6% do bruto.",
        toolResults: [
          { toolName: "fiscal_faturamento_periodo", dados: { bruto: 13153133.05, intercompany: 4682948.64 } },
        ],
      }),
    );
    expect(r).toBeNull();
  });

  test("percentual literal na fonte passa", () => {
    const r = validateV10Percentuais(
      ctx({
        llmResponse: "A margem foi de 23,4%.",
        toolResults: [{ toolName: "t", dados: { margemPct: 23.4 } }],
      }),
    );
    expect(r).toBeNull();
  });

  test("percentual nao derivavel de nada dispara", () => {
    const r = validateV10Percentuais(
      ctx({
        llmResponse: "O faturamento cresceu 47% no periodo.",
        toolResults: [{ toolName: "t", dados: { total: 1000, anterior: 900 } }],
      }),
    );
    expect(r?.reason).toBe("V10");
  });

  test("variacao derivavel passa (cresceu 11,1% de 900 para 1000)", () => {
    const r = validateV10Percentuais(
      ctx({
        llmResponse: "Cresceu 11,1% em relacao ao mes anterior.",
        toolResults: [{ toolName: "t", dados: { total: 1000, anterior: 900 } }],
      }),
    );
    expect(r).toBeNull();
  });

  test("sem percentual na resposta nao dispara", () => {
    expect(
      validateV10Percentuais(ctx({ llmResponse: "Top 10 clientes listados." })),
    ).toBeNull();
  });
});

describe("V11 , item do ranking confere com topMaiores (active)", () => {
  const TOOL = {
    toolName: "financeiro_titulos_vencidos",
    dados: {
      topMaiores: [
        { nome: "Johnson Industrial do Brasil Ltda", valor: 170800000 },
        { nome: "Smartfit Escola de Ginastica", valor: 9000000 },
      ],
    },
  };

  test("resposta destaca o item certo como maior -> passa", () => {
    const r = validateV11RankingItem(
      ctx({
        llmResponse: "O maior devedor e a Johnson Industrial, com R$ 170,8 mi.",
        toolResults: [TOOL],
      }),
    );
    expect(r).toBeNull();
  });

  test("resposta destaca OUTRO item do ranking como o maior -> reprova", () => {
    const r = validateV11RankingItem(
      ctx({
        llmResponse: "O maior devedor e a Smartfit, com R$ 9 mi.",
        toolResults: [TOOL],
      }),
    );
    expect(r?.ok).toBe(false);
    expect(r?.reason).toBe("V11");
  });

  test("sem alegacao de superlativo nao dispara", () => {
    const r = validateV11RankingItem(
      ctx({ llmResponse: "Ha varios devedores na lista.", toolResults: [TOOL] }),
    );
    expect(r).toBeNull();
  });

  test("nenhum nome do ranking na resposta -> inconclusivo, nao dispara", () => {
    const r = validateV11RankingItem(
      ctx({ llmResponse: "O maior credor e o Banco X.", toolResults: [TOOL] }),
    );
    expect(r).toBeNull();
  });
});

describe("V12 , consistencia entre turnos (shadow, freshness-aware)", () => {
  test("mesma tool+chave com valor divergente sem mencao a atualizacao -> loga", () => {
    const r = validateV12Consistencia(
      ctx({
        llmResponse: "O total e R$ 1.100,00.",
        toolResults: [{ toolName: "fiscal_faturamento_periodo", dados: { _DESTAQUE: { total: 1100 } } }],
        fontesMemoria: ["[fiscal_faturamento_periodo] dominio=fiscal numeros: total=1000"],
      }),
    );
    expect(r?.reason).toBe("V12");
  });

  test("divergencia com mencao a atualizacao passa (freshness-aware)", () => {
    const r = validateV12Consistencia(
      ctx({
        llmResponse: "Atualizado agora: o total e R$ 1.100,00 (era R$ 1.000,00).",
        toolResults: [{ toolName: "fiscal_faturamento_periodo", dados: { _DESTAQUE: { total: 1100 } } }],
        fontesMemoria: ["[fiscal_faturamento_periodo] dominio=fiscal numeros: total=1000"],
      }),
    );
    expect(r).toBeNull();
  });

  test("tools diferentes nao comparam", () => {
    const r = validateV12Consistencia(
      ctx({
        llmResponse: "O total e R$ 1.100,00.",
        toolResults: [{ toolName: "outra_tool", dados: { _DESTAQUE: { total: 1100 } } }],
        fontesMemoria: ["[fiscal_faturamento_periodo] dominio=fiscal numeros: total=1000"],
      }),
    );
    expect(r).toBeNull();
  });
});

describe("V13 , proveniencia declarada (shadow)", () => {
  test("resposta numerica com periodo declarado passa", () => {
    const r = validateV13Proveniencia(
      ctx({
        llmResponse: "Em junho de 2026, o faturamento foi R$ 8.300.184,41 em 457 notas.",
      }),
    );
    expect(r).toBeNull();
  });

  test("numeros relevantes sem nenhuma marca de recorte/periodo -> loga", () => {
    const r = validateV13Proveniencia(
      ctx({ llmResponse: "Foram R$ 8.300.184,41, com 457 e 1.349 em aberto." }),
    );
    expect(r?.reason).toBe("V13");
  });

  test("resposta sem numeros relevantes nao dispara", () => {
    expect(validateV13Proveniencia(ctx({ llmResponse: "Tudo certo por aqui!" }))).toBeNull();
  });
});
