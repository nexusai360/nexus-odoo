import { queryResultadoPorConta } from "./financeiro-resultado";
import type { PrismaClient } from "@/generated/prisma/client";

function mk(rows: unknown[]): PrismaClient {
  return { fatoFinanceiroLancamentoItem: { findMany: jest.fn().mockResolvedValue(rows) } } as unknown as PrismaClient;
}

describe("queryResultadoPorConta", () => {
  it("separa receita/despesa por conta e calcula resultado", async () => {
    const p = mk([
      { contaNome: "Vendas", tipo: "a_receber", vrTotal: "1000" },
      { contaNome: "Vendas", tipo: "recebimento", vrTotal: "500" },
      { contaNome: "Aluguel", tipo: "a_pagar", vrTotal: "300" },
      { contaNome: "Config", tipo: "outro", vrTotal: "999" }, // ignorado
    ]);
    const r = await queryResultadoPorConta(p, {});
    expect(r.totalReceita).toBe(1500);
    expect(r.totalDespesa).toBe(300);
    expect(r.resultado).toBe(1200);
    expect(r.linhas[0]).toEqual({ contaNome: "Vendas", natureza: "receita", total: 1500, itens: 2 });
  });
  it("filtra por natureza", async () => {
    const p = mk([
      { contaNome: "Vendas", tipo: "a_receber", vrTotal: "1000" },
      { contaNome: "Aluguel", tipo: "a_pagar", vrTotal: "300" },
    ]);
    const r = await queryResultadoPorConta(p, { natureza: "despesa" });
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].contaNome).toBe("Aluguel");
    expect(r.totalReceita).toBe(0);
  });
});
