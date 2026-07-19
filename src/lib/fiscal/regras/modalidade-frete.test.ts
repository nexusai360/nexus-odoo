import { describe, it, expect } from "@jest/globals";
import { rotuloModalidadeFrete, MODALIDADE_FRETE_LABELS } from "./modalidade-frete";

describe("rotuloModalidadeFrete", () => {
  it("mapeia os codigos NF-e (modFrete) para rotulos curtos", () => {
    expect(rotuloModalidadeFrete("0")).toBe("CIF (remetente)");
    expect(rotuloModalidadeFrete("1")).toBe("FOB (destinatario)");
    expect(rotuloModalidadeFrete("2")).toBe("Terceiros");
    expect(rotuloModalidadeFrete("3")).toBe("Proprio (remetente)");
    expect(rotuloModalidadeFrete("4")).toBe("Proprio (destinatario)");
    expect(rotuloModalidadeFrete("9")).toBe("Sem frete");
  });

  it("devolve rotulo neutro para nulo, vazio ou indefinido", () => {
    expect(rotuloModalidadeFrete(null)).toBe("Nao informada");
    expect(rotuloModalidadeFrete(undefined)).toBe("Nao informada");
    expect(rotuloModalidadeFrete("")).toBe("Nao informada");
  });

  it("nao inventa semantica para codigo desconhecido", () => {
    expect(rotuloModalidadeFrete("7")).toBe("Outra (7)");
  });

  it("expoe o de-para completo como constante", () => {
    expect(MODALIDADE_FRETE_LABELS["0"]).toBe("CIF (remetente)");
    expect(Object.keys(MODALIDADE_FRETE_LABELS)).toEqual(["0", "1", "2", "3", "4", "9"]);
  });
});
