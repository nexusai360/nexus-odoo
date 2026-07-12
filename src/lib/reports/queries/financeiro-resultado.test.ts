import { corteAtualDate } from "@/lib/corte-dados";
import { queryResultadoPorConta } from "./financeiro-resultado";
import type { PrismaClient } from "@/generated/prisma/client";

function mk(rows: unknown[]): PrismaClient {
  return { fatoFinanceiroLancamentoItem: { findMany: jest.fn().mockResolvedValue(rows) } } as unknown as PrismaClient;
}

/** Where efetivamente enviado ao Prisma na 1a chamada. */
function whereDaChamada(p: PrismaClient) {
  const findMany = (p as unknown as { fatoFinanceiroLancamentoItem: { findMany: jest.Mock } })
    .fatoFinanceiroLancamentoItem.findMany;
  return findMany.mock.calls[0][0].where;
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

  // Regra do corte: lancamento e historico. Sem periodo o DRE somava o cache inteiro.
  it("aplica o piso do corte quando o período vem vazio", async () => {
    const p = mk([]);
    await queryResultadoPorConta(p, {});
    expect(whereDaChamada(p).dataDocumento.gte).toEqual(corteAtualDate());
  });

  it("grampeia periodoDe anterior ao corte e usa borda superior exclusiva", async () => {
    const p = mk([]);
    await queryResultadoPorConta(p, { periodoDe: "2021-01-01", periodoAte: "2026-06-30" });
    const where = whereDaChamada(p);
    expect(where.dataDocumento.gte).toEqual(corteAtualDate());
    expect(where.dataDocumento.lt).toEqual(new Date("2026-07-01T00:00:00Z"));
  });

  it("preserva o período quando ele já começa depois do corte", async () => {
    const p = mk([]);
    await queryResultadoPorConta(p, { periodoDe: "2026-05-01", periodoAte: "2026-05-31" });
    const where = whereDaChamada(p);
    expect(where.dataDocumento.gte).toEqual(new Date("2026-05-01T00:00:00Z"));
    expect(where.dataDocumento.lt).toEqual(new Date("2026-06-01T00:00:00Z"));
  });
});
