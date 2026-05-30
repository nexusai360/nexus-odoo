import { DOMAINS } from "./domain-vocabulary";

const fiscal = DOMAINS.find((d) => d.domain === "fiscal");

describe("vocabulário fiscal , termos de DF-e (O1)", () => {
  it("o domínio fiscal existe", () => {
    expect(fiscal).toBeDefined();
  });

  it("forceIncludeOn casa os termos de DF-e da onda O1", () => {
    const patterns = fiscal!.forceIncludeOn ?? [];
    const casa = (texto: string) => patterns.some((re) => re.test(texto));
    expect(casa("quais DF-e chegaram este mes?")).toBe(true);
    expect(casa("notas de fornecedor importadas")).toBe(true);
    expect(casa("DF-e pendentes de manifestacao")).toBe(true);
    expect(casa("quais notas estao pendentes de manifestação?")).toBe(true);
    expect(casa("compras eletronicas por fornecedor")).toBe(true);
  });

  it("a description menciona DF-e importados e manifestação", () => {
    expect(fiscal!.description).toMatch(/DF-e importados/i);
    expect(fiscal!.description).toMatch(/manifesta/i);
  });
});
