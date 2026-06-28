const findMany = jest.fn();
jest.mock("@/lib/prisma", () => ({ prisma: { fatoBuildState: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { freshnessDoEntry } from "./freshness-builder";
import type { BuilderReportEntry } from "./types";

function entry(fatos: string[]): BuilderReportEntry {
  return {
    id: "r",
    titulo: "x",
    dominio: "estoque",
    schemaVersion: 1,
    tipo: "tela_cheia",
    parametros: [],
    secoes: fatos.map((fato, i) => ({
      id: `s${i}`,
      template: "DataTable",
      fato,
      shapeDerivado: "tabela",
      config: {},
      filtros: [],
    })),
  };
}

beforeEach(() => findMany.mockReset());

describe("freshnessDoEntry", () => {
  it("retorna o MENOR ultimoBuildAt entre os fatos das secoes", async () => {
    findMany.mockResolvedValue([
      { fato: "fato_estoque_saldo", ultimoBuildAt: new Date("2026-06-28T00:00:00Z") },
      { fato: "fato_estoque_armazem", ultimoBuildAt: new Date("2026-06-27T00:00:00Z") },
    ]);
    const f = await freshnessDoEntry(entry(["fato_estoque_saldo", "fato_estoque_armazem"]));
    expect(f).toEqual(new Date("2026-06-27T00:00:00Z"));
  });

  it("retorna null se algum fato nunca foi construido", async () => {
    findMany.mockResolvedValue([{ fato: "fato_estoque_saldo", ultimoBuildAt: new Date() }]);
    const f = await freshnessDoEntry(entry(["fato_estoque_saldo", "fato_estoque_armazem"]));
    expect(f).toBeNull();
  });
});
