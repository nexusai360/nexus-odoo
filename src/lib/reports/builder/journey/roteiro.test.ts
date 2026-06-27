jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { roteiroDerivado, dimensaoCoberta, NUCLEO } from "./roteiro";
import type { RoteiroInput } from "./roteiro";

const base = (over: Partial<RoteiroInput> = {}): RoteiroInput => ({
  dimensoesRelevantes: [...NUCLEO],
  dimensoesTocadas: {},
  intencao: { secoes: [] },
  turnosUsuario: 0,
  ...over,
});

describe("roteiroDerivado", () => {
  it("total = nucleo (4) quando nada opcional foi marcado", () => {
    expect(roteiroDerivado(base()).total).toBe(4);
  });

  it("respondidas conta dimensoes cobertas por evidencia", () => {
    const s = base({
      entendimento: "quero ver o saldo por armazem para repor",
      turnosUsuario: 2,
      intencao: {
        secoes: [{ fato: "fato_estoque_saldo", template: "BarChart" }],
        semKpiDeclarado: true,
      },
    });
    // objetivo + dados + visualizacao + indicadores(semKpi) = 4
    expect(roteiroDerivado(s).respondidas).toBe(4);
  });

  it("dimensao opcional marcada entra no total (clamp <= 7)", () => {
    const s = base({ dimensoesRelevantes: [...NUCLEO, "filtros", "periodo"] });
    expect(roteiroDerivado(s).total).toBe(6);
  });

  it("turno sem captura nova NAO aumenta respondidas (gera logo nao avanca)", () => {
    // entendimento setado mas SEM secao registrada: dados/visualizacao/indicadores
    // continuam descobertos, entao respondidas nao chega ao total.
    const s = base({ entendimento: "x".repeat(25), turnosUsuario: 5 });
    const r = roteiroDerivado(s);
    expect(r.respondidas).toBeLessThan(r.total);
  });
});

describe("dimensaoCoberta", () => {
  it("indicadores cobre via KPIRow", () => {
    const s = base({ intencao: { secoes: [{ fato: "fato_estoque_saldo", template: "KPIRow" }] } });
    expect(dimensaoCoberta(s, "indicadores")).toBe(true);
  });
});
