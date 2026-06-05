import { cadastroParceirosPorCidade } from "./parceiros-por-cidade.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoParceiro: { findMany: jest.fn(), count: jest.fn() },
  };
}

function makeCtx(): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role: "admin", domains: ["cadastros"] } as UserContext,
  };
}

function primeFreshness(ctx: ToolHandlerCtx) {
  const now = new Date("2026-06-01T12:00:00Z");
  (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
    { fato: "fato_parceiro", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "res.partner", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
  ]);
}

// Sem filtro de zona, o conjunto bruto = conjunto filtrado. Ordem de entrada
// embaralhada de proposito para provar que o resultado sai ordenado por odooId.
function fakeBruto(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    odooId: n - i, // ordem decrescente na entrada
    nome: `P${n - i}`,
    documento: "12345",
    cidade: "Cidade",
    uf: "Sao Paulo (BR)",
    ehCliente: true,
    ehFornecedor: false,
  }));
}

describe("cadastro_parceiros_por_cidade , paginacao (alavanca 2b, excecao em memoria)", () => {
  it("fatia [offset, offset+limit) em memoria com ordem estavel por odooId", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    // 25 parceiros no recorte (zona=todas => sem filtro extra em JS).
    (ctx.prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue(fakeBruto(25));

    const r = await cadastroParceirosPorCidade.handler(
      { uf: "SP", limit: 10, offset: 0 } as never,
      ctx,
    );

    if (r.estado !== "preparando") {
      // total = conjunto filtrado inteiro.
      expect(r.dados._PAGINACAO.total).toBe(25);
      expect(r.dados.linhasExibidas).toBe(10);
      // ordenado por odooId asc: primeira pagina comeca em 1.
      expect(r.dados.linhas[0].odooId).toBe(1);
      expect(r.dados.linhas[9].odooId).toBe(10);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("offset avanca a janela em memoria sem sobrepor", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue(fakeBruto(25));

    const r = await cadastroParceirosPorCidade.handler(
      { uf: "SP", limit: 10, offset: 10 } as never,
      ctx,
    );
    if (r.estado !== "preparando") {
      expect(r.dados.linhas[0].odooId).toBe(11);
      expect(r.dados.linhas[9].odooId).toBe(20);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(20);
    }
  });

  it("default limit = 10 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue(fakeBruto(3));

    const r = await cadastroParceirosPorCidade.handler({ uf: "SP" } as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhasExibidas).toBe(3);
      expect(r.dados._PAGINACAO.temMais).toBe(false);
    }
  });
});
