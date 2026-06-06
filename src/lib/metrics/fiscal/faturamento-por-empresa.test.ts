import { faturamentoPorEmpresa } from "./faturamento-por-empresa";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoPorEmpresa", () => {
  it("agrupa so por empresaId, resolve nome na dim, null por ultimo", async () => {
    const fnfFindMany = jest
      .fn()
      .mockResolvedValueOnce([{ naturezaOperacaoId: 9, naturezaOperacaoNome: "Devolução" }]) // idsNaoVenda
      .mockResolvedValueOnce([
        { empresaId: 8, vrNf: 1000, empresaNome: "Matriz" },
        { empresaId: 9, vrNf: 600, empresaNome: "Filial SE" },
        { empresaId: 8, vrNf: 400, empresaNome: "Matriz" },
        { empresaId: null, vrNf: 50, empresaNome: null },
      ]);
    const dimFindMany = jest.fn().mockResolvedValue([
      { odooId: 8, nome: "Matriz DF" },
      { odooId: 9, nome: "Filial SE" },
    ]);
    const prisma = {
      fatoNotaFiscal: { findMany: fnfFindMany },
      dimEmpresaGrupo: { findMany: dimFindMany },
    } as unknown as PrismaClient;

    const r = await faturamentoPorEmpresa(prisma, { periodoDe: "2026-01-01", periodoAte: "2026-01-31" });

    expect(r.totalGrupo).toBe(2050);
    expect(r.empresasComFaturamento).toBe(2);
    expect(r.valorSemEmpresa).toBe(50);
    expect(r.totalNotasSemEmpresa).toBe(1);
    expect(r.linhas[0]).toEqual({ empresaId: 8, empresaNome: "Matriz DF", totalNotas: 2, valor: 1400 });
    expect(r.linhas[r.linhas.length - 1].empresaId).toBeNull();
  });
});
