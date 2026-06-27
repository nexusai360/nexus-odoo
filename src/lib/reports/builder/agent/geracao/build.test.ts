jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { buildFicha } from "./build";
import type { Blueprint } from "./blueprint-types";

describe("buildFicha", () => {
  it("monta a ficha a partir do blueprint (via dispatcher), com id/filtros preenchidos", () => {
    const bp: Blueprint = {
      titulo: "Estoque por armazem",
      objetivo: "repor",
      secoes: [
        { template: "KPIRow", fato: "fato_estoque_saldo", shapeDerivado: "kpis", config: { titulo: "Visao geral" } },
        { template: "DataTable", fato: "fato_estoque_saldo", shapeDerivado: "tabela", config: { titulo: "Detalhe" } },
      ],
    };
    const { ficha, omitidos } = buildFicha(bp);
    expect(ficha.titulo).toBe("Estoque por armazem");
    expect(ficha.secoes).toHaveLength(2);
    expect(ficha.secoes[0].id).toBeTruthy();
    expect(Array.isArray(ficha.secoes[0].filtros)).toBe(true);
    expect(omitidos).toHaveLength(0);
  });

  it("manda secao rejeitada pelo dispatcher para omitidos (sem descartar em silencio)", () => {
    const bp: Blueprint = {
      titulo: "t",
      objetivo: "o",
      secoes: [
        { template: "KPIRow", fato: "fato_estoque_saldo", shapeDerivado: "kpis", config: {} },
        // shape incompativel com a fonte -> dispatcher recusa
        { template: "LineChart", fato: "fato_estoque_saldo", shapeDerivado: "serieTemporal", config: {} },
      ],
    };
    const { ficha, omitidos } = buildFicha(bp);
    expect(ficha.secoes).toHaveLength(1);
    expect(omitidos).toHaveLength(1);
  });
});
