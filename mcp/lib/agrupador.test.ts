import { describe, it, expect } from "@jest/globals";
import { topPorParticipante } from "./agrupador";

const TITULOS = [
  { participanteNome: "Smartfit", vrSaldo: 200 },
  { participanteNome: "Smartfit", vrSaldo: 300 },
  { participanteNome: "Casa Ferolla", vrSaldo: 150 },
  { participanteNome: "Casa Ferolla", vrSaldo: 50 },
  { participanteNome: "Jds Comercio", vrSaldo: 1000 },
  { participanteNome: null, vrSaldo: 25 },
  { participanteNome: "Smartfit", vrSaldo: 100 },
];

describe("topPorParticipante", () => {
  it("agrega por nome, soma vrSaldo, conta n", () => {
    const top = topPorParticipante(TITULOS, 10);
    expect(top).toEqual([
      { nome: "Jds Comercio", soma: 1000, n: 1 },
      { nome: "Smartfit", soma: 600, n: 3 },
      { nome: "Casa Ferolla", soma: 200, n: 2 },
    ]);
  });

  it("respeita limite (top 2)", () => {
    const top = topPorParticipante(TITULOS, 2);
    expect(top).toHaveLength(2);
    expect(top[0]?.nome).toBe("Jds Comercio");
    expect(top[1]?.nome).toBe("Smartfit");
  });

  it("ignora linhas com participanteNome null/undefined/vazio", () => {
    const top = topPorParticipante(TITULOS, 10);
    expect(top.find((t) => !t.nome)).toBeUndefined();
  });

  it("retorna [] para lista vazia", () => {
    expect(topPorParticipante([], 10)).toEqual([]);
  });

  it("default limite = 10", () => {
    const muitos = Array.from({ length: 15 }, (_, i) => ({
      participanteNome: `P${i}`,
      vrSaldo: 100 - i,
    }));
    const top = topPorParticipante(muitos);
    expect(top).toHaveLength(10);
  });

  it("trim de espaços no participanteNome (Smartfit vs ' Smartfit ' agrega)", () => {
    const lista = [
      { participanteNome: "Smartfit", vrSaldo: 100 },
      { participanteNome: " Smartfit ", vrSaldo: 200 },
    ];
    const top = topPorParticipante(lista, 5);
    expect(top).toHaveLength(1);
    expect(top[0]?.soma).toBe(300);
    expect(top[0]?.n).toBe(2);
  });

  it("vrSaldo null/undefined conta como 0", () => {
    const lista = [
      { participanteNome: "A", vrSaldo: 100 },
      { participanteNome: "A", vrSaldo: null as unknown as number },
      { participanteNome: "A", vrSaldo: undefined },
    ];
    const top = topPorParticipante(lista, 5);
    expect(top[0]?.soma).toBe(100);
    expect(top[0]?.n).toBe(3);
  });
});
