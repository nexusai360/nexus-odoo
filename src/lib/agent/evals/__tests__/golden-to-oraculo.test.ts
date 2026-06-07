import { describe, it, expect } from "@jest/globals";
import { goldenToOraculo, frozenProsseguir } from "../golden-to-oraculo";
import type { GoldenEntry } from "../golden-schema";
import goldenData from "../golden/golden-nex.json";

describe("golden-to-oraculo", () => {
  it("mapeia campos e filtra desambiguacao", () => {
    const g = [
      { id: "a", pergunta: "p", dominio: "estoque", classe: "prosseguir", toolEsperada: "t" },
      { id: "b", pergunta: "q", dominio: null, classe: "desambiguacao", toolEsperada: "u", esperaAmbiguidade: {} },
    ] as GoldenEntry[];
    expect(goldenToOraculo(g)).toEqual([
      { pergunta: "p", toolEsperada: "t", dominioEsperado: "estoque", classeEsperada: "prosseguir" },
    ]);
  });
  it("frozen = 30 prosseguir migradas (sem cov-/ouro-/desamb-)", () => {
    const frozen = frozenProsseguir(goldenData as GoldenEntry[]);
    expect(frozen.length).toBe(30);
    expect(frozen.every((e) => !/^(cov|ouro|desamb)-/.test(e.id))).toBe(true);
  });
});
