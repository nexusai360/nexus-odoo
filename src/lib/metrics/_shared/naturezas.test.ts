import { idsNaoVenda, buildNaturezaVendaWhere, NATUREZAS_NAO_VENDA_TERMOS } from "./naturezas";
import type { PrismaClient } from "../../../generated/prisma/client";

function mkPrisma(rows: Array<{ naturezaOperacaoId: number | null; naturezaOperacaoNome: string | null }>): PrismaClient {
  return {
    fatoNotaFiscal: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaClient;
}

describe("naturezas", () => {
  it("NATUREZAS_NAO_VENDA_TERMOS exporta a lista esperada", () => {
    expect(NATUREZAS_NAO_VENDA_TERMOS).toEqual([
      "devolu",
      "transfer",
      "retorno",
      "remessa",
      "bonifica",
      "comodato",
      "demonstra",
    ]);
  });

  it("idsNaoVenda marca nao-venda por termo, imune a acento; venda fica de fora", async () => {
    const prisma = mkPrisma([
      { naturezaOperacaoId: 1, naturezaOperacaoNome: "Venda de mercadoria" },
      { naturezaOperacaoId: 2, naturezaOperacaoNome: "Devolução de venda" },
      { naturezaOperacaoId: 3, naturezaOperacaoNome: "Transferencia entre filiais" },
      { naturezaOperacaoId: 4, naturezaOperacaoNome: "Remessa para conserto" },
      { naturezaOperacaoId: 5, naturezaOperacaoNome: "Bonificação" },
      { naturezaOperacaoId: 6, naturezaOperacaoNome: "Comodato de equipamento" },
      { naturezaOperacaoId: 7, naturezaOperacaoNome: "Demonstração" },
      { naturezaOperacaoId: 8, naturezaOperacaoNome: "Retorno de remessa" },
      { naturezaOperacaoId: null, naturezaOperacaoNome: "sem natureza" },
    ]);
    const ids = await idsNaoVenda(prisma);
    expect(ids).toEqual(expect.arrayContaining([2, 3, 4, 5, 6, 7, 8]));
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(null);
  });

  it("buildNaturezaVendaWhere monta notIn ou objeto vazio", () => {
    expect(buildNaturezaVendaWhere([1, 2])).toEqual({ naturezaOperacaoId: { notIn: [1, 2] } });
    expect(buildNaturezaVendaWhere([])).toEqual({});
  });
});
