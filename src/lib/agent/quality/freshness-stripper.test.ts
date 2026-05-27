import { stripFreshnessPlaceholders } from "./freshness-stripper";

describe("stripFreshnessPlaceholders", () => {
  it("remove '(atualizado há Xs)' inline", () => {
    const input = "Saldo total: R$ 124.000,00 (atualizado há Xs).";
    expect(stripFreshnessPlaceholders(input)).toBe("Saldo total: R$ 124.000,00.");
  });

  it("remove com chaves '{x}s'", () => {
    expect(stripFreshnessPlaceholders("Total 500 (atualizado há {x}s)")).toBe(
      "Total 500",
    );
  });

  it("preserva freshness real (numeros + unidades)", () => {
    const input = "Saldo R$ 100 (atualizado há 30s).";
    expect(stripFreshnessPlaceholders(input)).toBe(input);
  });

  it("preserva 'atualizado há 1 dia' e variantes longas", () => {
    const cases = [
      "Total 5 (atualizado há 1 dia)",
      "Total 5 (atualizado há 3 dias)",
      "Total 5 (atualizado há 2h)",
      "Total 5 (atualizado há 15min)",
    ];
    for (const c of cases) {
      expect(stripFreshnessPlaceholders(c)).toBe(c);
    }
  });

  it("remove varias ocorrencias no mesmo texto", () => {
    const input = "L1 (atualizado há Xs)\nL2 (atualizado há Xs)";
    expect(stripFreshnessPlaceholders(input)).toBe("L1\nL2");
  });

  it("remove sem parenteses solto no fim de linha", () => {
    expect(
      stripFreshnessPlaceholders("Saldo: R$ 100 , atualizado há Xs"),
    ).toBe("Saldo: R$ 100");
  });

  it("nao quebra texto sem placeholder", () => {
    const t = "Resposta normal sem freshness alguma.";
    expect(stripFreshnessPlaceholders(t)).toBe(t);
  });
});
