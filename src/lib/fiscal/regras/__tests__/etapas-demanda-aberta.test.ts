import { ETAPAS_DEMANDA_ABERTA } from "../etapas-demanda-aberta";

describe("ETAPAS_DEMANDA_ABERTA , whitelist curada do relatorio oficial (ID 28)", () => {
  it("tem exatamente as 27 etapas do oficial", () => {
    expect(ETAPAS_DEMANDA_ABERTA.size).toBe(27);
  });

  it("inclui a excecao 'Nota emitida e nao entregue' (226) e a venda futura em aberto (103,171,179)", () => {
    for (const id of [226, 103, 171, 179, 130, 5]) {
      expect(ETAPAS_DEMANDA_ABERTA.has(id)).toBe(true);
    }
  });

  it("NAO inclui Cancelado (6) nem VF - Cancelado (123)", () => {
    expect(ETAPAS_DEMANDA_ABERTA.has(6)).toBe(false);
    expect(ETAPAS_DEMANDA_ABERTA.has(123)).toBe(false);
  });
});
