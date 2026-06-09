import { faturamentoPorEmpresa } from "./faturamento-por-empresa";
import type { PrismaClient } from "../../../generated/prisma/client";

describe("faturamentoPorEmpresa", () => {
  it("agrupa so por empresaId e usa o NOME DA NOTA (fato.empresaNome), null por ultimo", async () => {
    // O nome da nota e a fonte autoritativa: o dim_empresa_grupo tem odooId
    // deslocado vs empresaId das notas e rotularia a empresa errada. Por isso a
    // metrica NAO resolve nome pela dim , usa o empresaNome denormalizado da nota.
    const fnfFindMany = jest
      .fn()
      .mockResolvedValueOnce([{ naturezaOperacaoId: 9, naturezaOperacaoNome: "Devolução" }]) // idsNaoVenda
      .mockResolvedValueOnce([
        { empresaId: 8, vrNf: 1000, empresaNome: "Jds Comércio - Filial SE" },
        { empresaId: 9, vrNf: 600, empresaNome: "Jib DF Comércio - Matriz" },
        { empresaId: 8, vrNf: 400, empresaNome: "Jds Comércio - Filial SE" },
        { empresaId: null, vrNf: 50, empresaNome: null },
      ]);
    const prisma = {
      fatoNotaFiscal: { findMany: fnfFindMany },
    } as unknown as PrismaClient;

    const r = await faturamentoPorEmpresa(prisma, { periodoDe: "2026-01-01", periodoAte: "2026-01-31" });

    expect(r.totalGrupo).toBe(2050);
    expect(r.empresasComFaturamento).toBe(2);
    expect(r.valorSemEmpresa).toBe(50);
    expect(r.totalNotasSemEmpresa).toBe(1);
    // nome vem da NOTA, nao do dim (que rotularia errado)
    expect(r.linhas[0]).toEqual({
      empresaId: 8,
      empresaNome: "Jds Comércio - Filial SE",
      totalNotas: 2,
      valor: 1400,
    });
    expect(r.linhas[r.linhas.length - 1].empresaId).toBeNull();
  });
});
