// mcp/tools/estoque/produtos-saldo-zero.test.ts
//
// A agregacao "saldo por produto" e feita em memoria (Map por produtoId),
// entao a paginacao e a EXCECAO documentada do briefing: ordena estavel e
// fatia [offset, offset+limit); total = candidatos encontrados.
import { estoqueProdutosSaldoZero } from "./produtos-saldo-zero.js";
import { PAGINACAO_LIMIT_DEFAULT } from "../../lib/paginacao";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoEstoqueSaldo: { findMany: jest.fn() },
  };
}

function makeCtx(): ToolHandlerCtx {
  return {
    prisma: makePrisma() as never,
    user: { userId: "u1", role: "admin", domains: ["estoque"] } as UserContext,
  };
}

function primeFreshness(ctx: ToolHandlerCtx) {
  const now = new Date("2026-06-01T12:00:00Z");
  (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([
    { fato: "fato_estoque_saldo", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "estoque.saldo.hoje", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
  ]);
}

// Gera N produtos com saldo zero, 1 local cada.
function fakeZerados(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    produtoId: i + 1,
    produtoNome: `P${i + 1}`,
    familiaNome: null,
    marcaNome: null,
    localId: 1,
    quantidade: 0,
  }));
}

describe("estoque_produtos_saldo_zero , paginacao (alavanca 2b)", () => {
  it("fatia [offset, offset+limit) em memoria e _PAGINACAO reflete total real", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue(fakeZerados(25));

    const r = await estoqueProdutosSaldoZero.handler({ limit: 10, offset: 0 } as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas).toHaveLength(10);
      expect(r.dados._PAGINACAO.total).toBe(25);
      expect(r.dados._PAGINACAO.temMais).toBe(true);
      expect(r.dados._PAGINACAO.proximoOffset).toBe(10);
    }
  });

  it("offset avanca a janela sem sobrepor", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue(fakeZerados(25));

    const pag1 = await estoqueProdutosSaldoZero.handler({ limit: 10, offset: 0 } as never, ctx);
    const pag2 = await estoqueProdutosSaldoZero.handler({ limit: 10, offset: 10 } as never, ctx);
    if (pag1.estado !== "preparando" && pag2.estado !== "preparando") {
      const ids1 = pag1.dados.linhas.map((l) => l.produtoId);
      const ids2 = pag2.dados.linhas.map((l) => l.produtoId);
      expect(ids1.some((id) => ids2.includes(id))).toBe(false);
    }
  });

  it("ultima pagina nao tem mais", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue(fakeZerados(15));

    const r = await estoqueProdutosSaldoZero.handler({ limit: 10, offset: 10 } as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas).toHaveLength(5);
      expect(r.dados._PAGINACAO.temMais).toBe(false);
      expect(r.dados._PAGINACAO.proximoOffset).toBeNull();
    }
  });

  it("default limit = 50 quando ausente", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoEstoqueSaldo.findMany as jest.Mock).mockResolvedValue(fakeZerados(60));

    const r = await estoqueProdutosSaldoZero.handler({} as never, ctx);
    if (r.estado !== "preparando") {
      expect(r.dados.linhas).toHaveLength(PAGINACAO_LIMIT_DEFAULT);
    }
  });
});
