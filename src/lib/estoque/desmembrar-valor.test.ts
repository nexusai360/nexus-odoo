import { describe, it, expect } from "@jest/globals";
import { desmembrarValor } from "./desmembrar-valor";

describe("desmembrarValor", () => {
  it("rateia proporcional ao peso e fecha a soma exata (maior resto)", () => {
    // total 100,00 (10000 centavos), pesos 1:1:1 -> 3334,3333,3333 (soma 10000)
    const r = desmembrarValor(10000, [
      { componenteId: 1, peso: 1 },
      { componenteId: 2, peso: 1 },
      { componenteId: 3, peso: 1 },
    ]);
    expect(r.reduce((s, x) => s + x.valor, 0)).toBe(10000);
    expect(r.map((x) => x.valor).sort((a, b) => a - b)).toEqual([3333, 3333, 3334]);
  });

  it("estrutura cara leva mais que painel barato (proporcional ao custo)", () => {
    const r = desmembrarValor(50000, [
      { componenteId: 10, peso: 8000 },
      { componenteId: 20, peso: 2000 },
    ]);
    expect(r.find((x) => x.componenteId === 10)!.valor).toBe(40000);
    expect(r.find((x) => x.componenteId === 20)!.valor).toBe(10000);
  });

  it("pesos fracionarios (custo em reais) funcionam pela proporcao", () => {
    // kit 48 real: estrutura 9969.68, painel 3398.41; total 26909.09 -> centavos
    const r = desmembrarValor(2690909, [
      { componenteId: 159, peso: 9969.68 },
      { componenteId: 162, peso: 3398.41 },
    ]);
    expect(r.reduce((s, x) => s + x.valor, 0)).toBe(2690909); // soma exata
    // painel ~25,4%
    const painel = r.find((x) => x.componenteId === 162)!.valor;
    expect(painel / 2690909).toBeCloseTo(0.2542, 3);
  });

  it("todos os pesos zero: divide igualmente (fallback), soma exata", () => {
    const r = desmembrarValor(10000, [
      { componenteId: 1, peso: 0 },
      { componenteId: 2, peso: 0 },
      { componenteId: 3, peso: 0 },
    ]);
    expect(r.reduce((s, x) => s + x.valor, 0)).toBe(10000);
  });

  it("peso negativo é tratado como zero", () => {
    const r = desmembrarValor(10000, [
      { componenteId: 1, peso: -5 },
      { componenteId: 2, peso: 10 },
    ]);
    expect(r.find((x) => x.componenteId === 1)!.valor).toBe(0);
    expect(r.find((x) => x.componenteId === 2)!.valor).toBe(10000);
  });

  it("lista vazia devolve vazio; total zero devolve zeros", () => {
    expect(desmembrarValor(10000, [])).toEqual([]);
    const r = desmembrarValor(0, [{ componenteId: 1, peso: 5 }]);
    expect(r).toEqual([{ componenteId: 1, valor: 0 }]);
  });
});
