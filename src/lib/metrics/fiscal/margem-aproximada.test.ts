import { margemAproximada } from "./margem-aproximada";
import type { PrismaClient } from "../../../generated/prisma/client";

// 1 query agregada por cfop_nome; classificacao ehReceita em TS (classificarCfop real).
function mockPrisma(rows: unknown[]): PrismaClient {
  return {
    $queryRawUnsafe: jest.fn().mockResolvedValue(rows),
  } as unknown as PrismaClient;
}

describe("margemAproximada", () => {
  it("soma so itens de venda (ehReceita); custo/cobertura/margem coerentes", async () => {
    // 5102=venda(receita); 5152=transferencia(nao-receita, IGNORADO no custo e na receita)
    const r = await margemAproximada(
      mockPrisma([
        { cfop_nome: "5102 - Venda", vr: 1000, vr_com_custo: 800, custo: 500, itens_com_custo: 8, itens_custo_maior: 0 },
        { cfop_nome: "5152 - Transferencia", vr: 999, vr_com_custo: 999, custo: 999, itens_com_custo: 9, itens_custo_maior: 9 },
      ]),
      {},
    );
    expect(r.receitaVendaTotal).toBe(1000); // so a venda
    expect(r.receitaComCusto).toBe(800);
    expect(r.custoEstimado).toBe(500);
    expect(r.margemBrutaAproximada).toBe(300); // 800 - 500
    expect(r.percentualMargem).toBeCloseTo(0.375, 3); // 300/800
    expect(r.coberturaCusto).toBeCloseTo(0.8, 3); // 800/1000
    expect(r.receitaSemCusto).toBe(200);
    expect(r.custoDesatualizadoProvavel).toBe(false); // 0/8 custo>receita
  });

  it("custoDesatualizadoProvavel=true quando >10% dos itens de venda tem custo>receita", async () => {
    const r = await margemAproximada(
      mockPrisma([
        { cfop_nome: "5102 - Venda", vr: 1000, vr_com_custo: 1000, custo: 1200, itens_com_custo: 10, itens_custo_maior: 3 },
      ]),
      {},
    );
    expect(r.custoDesatualizadoProvavel).toBe(true); // 3/10 = 30% > 10%
    expect(r.margemBrutaAproximada).toBe(-200); // honesto: pode ser negativa
  });
});
