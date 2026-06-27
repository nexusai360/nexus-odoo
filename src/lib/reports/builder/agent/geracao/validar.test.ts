jest.mock("@/lib/prisma", () => ({ prisma: {} }));

import { validarFichaGerada } from "./validar";
import type { BuilderReportEntry } from "../../types";

/* eslint-disable @typescript-eslint/no-explicit-any */
function ficha(secoes: any[]): BuilderReportEntry {
  return {
    id: "r", titulo: "t", dominio: "estoque", schemaVersion: 1, tipo: "tela_cheia", parametros: [],
    secoes: secoes.map((s, i) => ({ id: `s${i}`, config: {}, filtros: [], ...s })),
  } as any;
}

describe("validarFichaGerada", () => {
  it("aprova ficha com visualizacao", () => {
    const f = ficha([{ template: "BarChart", fato: "fato_estoque_saldo", shapeDerivado: "agregacaoCategorica" }]);
    expect(validarFichaGerada(f).problemas).toHaveLength(0);
  });

  it("aponta ficha sem nenhuma visualizacao", () => {
    const f = ficha([]);
    const r = validarFichaGerada(f);
    expect(r.problemas.length).toBeGreaterThan(0);
  });

  it("aponta secao incompativel", () => {
    const f = ficha([{ template: "LineChart", fato: "fato_estoque_saldo", shapeDerivado: "serieTemporal" }]);
    const r = validarFichaGerada(f);
    expect(r.problemas.length).toBeGreaterThan(0);
  });
});
