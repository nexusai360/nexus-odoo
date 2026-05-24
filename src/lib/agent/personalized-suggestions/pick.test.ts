import { pickPersonalizedQuestions } from "./pick";

describe("pickPersonalizedQuestions", () => {
  test("vazio quando nao ha historico", () => {
    expect(pickPersonalizedQuestions([], [], 3)).toEqual([]);
  });

  test("1 slot all-time + 2 slots recentes", () => {
    const allTime = [
      { toolName: "fiscal_faturamento_periodo", count: 50 },
      { toolName: "estoque_saldo_produto", count: 30 },
    ];
    const recent = [
      { toolName: "comercial_pedidos_atrasados", count: 8 },
      { toolName: "financeiro_titulos_vencidos", count: 5 },
    ];
    const out = pickPersonalizedQuestions(allTime, recent, 3);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe("Quanto faturamos no mês corrente?");
    expect(out[1]).toBe("Quais pedidos de venda estão atrasados?");
    expect(out[2]).toBe("Quais títulos venceram nos últimos 7 dias?");
  });

  test("dedup quando recente repete o all-time top", () => {
    const allTime = [{ toolName: "fiscal_faturamento_periodo", count: 50 }];
    const recent = [
      { toolName: "fiscal_faturamento_periodo", count: 10 },
      { toolName: "estoque_saldo_produto", count: 7 },
    ];
    const out = pickPersonalizedQuestions(allTime, recent, 3);
    expect(out).toEqual([
      "Quanto faturamos no mês corrente?",
      "Qual o saldo de estoque dos produtos mais movimentados?",
    ]);
  });

  test("tool sem template e ignorada", () => {
    const out = pickPersonalizedQuestions(
      [{ toolName: "ferramenta_inexistente", count: 99 }],
      [{ toolName: "fiscal_faturamento_periodo", count: 5 }],
      3,
    );
    expect(out).toEqual(["Quanto faturamos no mês corrente?"]);
  });

  test("respeita max clampado em 1..5", () => {
    const allTime = Array.from({ length: 10 }, (_, i) => ({
      toolName: ["fiscal_faturamento_periodo", "estoque_saldo_produto"][i % 2],
      count: 10 - i,
    }));
    expect(pickPersonalizedQuestions(allTime, [], 0)).toHaveLength(1);
    expect(pickPersonalizedQuestions(allTime, [], 99)).toHaveLength(2); // so 2 unicas no map
  });
});
