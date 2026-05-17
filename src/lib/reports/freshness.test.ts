import { reportFreshness } from "./freshness";
import type { ReportEntry } from "./types";
import { Home } from "lucide-react";

function entry(modeloFonte: string, fatos: string[]): ReportEntry {
  return {
    id: "r", titulo: "R", dominio: "estoque", descricao: "",
    icone: Home, modeloFonte,
    secoes: fatos.map((f, i) => ({
      id: `s${i}`, template: "DataTable", fato: f, config: {}, filtros: [],
    })),
  };
}

describe("reportFreshness", () => {
  it("devolve o menor entre lastSnapshotAt e ultimoBuildAt", async () => {
    const prisma = {
      syncState: {
        findUnique: jest.fn().mockResolvedValue({
          lastSnapshotAt: new Date("2026-05-16T10:00:00Z"),
        }),
      },
      fatoBuildState: {
        findUnique: jest.fn().mockResolvedValue({
          ultimoBuildAt: new Date("2026-05-16T09:00:00Z"),
        }),
      },
    } as never;
    const r = await reportFreshness(prisma, entry("estoque.saldo.hoje", ["fato_estoque_saldo"]));
    expect(r).toEqual(new Date("2026-05-16T09:00:00Z"));
  });
  it("relatório multi-fato pega o menor de todos os fatos", async () => {
    const prisma = {
      syncState: {
        findUnique: jest.fn().mockResolvedValue({
          lastSnapshotAt: new Date("2026-05-16T12:00:00Z"),
        }),
      },
      fatoBuildState: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ ultimoBuildAt: new Date("2026-05-16T11:00:00Z") })
          .mockResolvedValueOnce({ ultimoBuildAt: new Date("2026-05-16T08:00:00Z") }),
      },
    } as never;
    const r = await reportFreshness(
      prisma,
      entry("estoque.saldo.hoje", ["fato_estoque_saldo", "fato_estoque_movimento"]),
    );
    expect(r).toEqual(new Date("2026-05-16T08:00:00Z"));
  });
  it("devolve null quando um fato nunca foi construído", async () => {
    const prisma = {
      syncState: {
        findUnique: jest.fn().mockResolvedValue({
          lastSnapshotAt: new Date("2026-05-16T12:00:00Z"),
        }),
      },
      fatoBuildState: { findUnique: jest.fn().mockResolvedValue(null) },
    } as never;
    const r = await reportFreshness(prisma, entry("estoque.saldo.hoje", ["fato_estoque_saldo"]));
    expect(r).toBeNull();
  });
});
