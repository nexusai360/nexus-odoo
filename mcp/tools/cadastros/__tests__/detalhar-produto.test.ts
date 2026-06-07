import { cadastroDetalharProduto } from "../detalhar-produto.js";
import type { ToolHandlerCtx } from "../../../catalog/types.js";
import type { UserContext } from "../../../auth/user-context.js";

function makePrisma() {
  return {
    fatoBuildState: { findMany: jest.fn() },
    syncState: { findMany: jest.fn() },
    fatoProduto: { findFirst: jest.fn() },
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
    { fato: "fato_produto", ultimoBuildAt: now },
  ]);
  (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([
    { model: "product.product", lastStatus: "ok", lastSnapshotAt: now, lastIncrementalAt: null },
  ]);
}

function fakeProduto() {
  return {
    odooId: 42,
    nome: "Esteira Pro X",
    codigo: "ESTX-001",
    codigoUnico: "UNI-ESTX-001",
    codigoBarras: "7890000000017",
    marcaNome: "Matrix",
    familiaNome: "Cardio",
    unidadeNome: "UN",
    ncmCodigo: "95069100",
    precoVenda: { toString: () => "12999.9000" },
    precoCusto: { toString: () => "8500.5000" },
    ativo: true,
  };
}

describe("cadastro_detalhar_produto", () => {
  it("estado preparando quando freshness nao foi primada", async () => {
    const ctx = makeCtx();
    (ctx.prisma.fatoBuildState.findMany as jest.Mock).mockResolvedValue([]);
    (ctx.prisma.syncState.findMany as jest.Mock).mockResolvedValue([]);

    const r = await cadastroDetalharProduto.handler({ odooId: 42 } as never, ctx);
    expect(r.estado).toBe("preparando");
  });

  it("odooId existente retorna encontrado:true com os campos confirmados", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProduto.findFirst as jest.Mock).mockResolvedValue(fakeProduto());

    const r = await cadastroDetalharProduto.handler({ odooId: 42 } as never, ctx);
    if (r.estado === "preparando") throw new Error("nao deveria estar preparando");

    expect(r.estado).toBe("ok");
    expect(r.dados.encontrado).toBe(true);
    const p = r.dados.produto;
    expect(p).not.toBeNull();
    expect(p?.odooId).toBe(42);
    expect(p?.nome).toBe("Esteira Pro X");
    expect(p?.codigo).toBe("ESTX-001");
    expect(p?.codigoUnico).toBe("UNI-ESTX-001");
    expect(p?.codigoBarras).toBe("7890000000017");
    expect(p?.marcaNome).toBe("Matrix");
    expect(p?.familiaNome).toBe("Cardio");
    expect(p?.unidadeNome).toBe("UN");
    expect(p?.ncmCodigo).toBe("95069100");
    expect(p?.precoVenda).toBe(12999.9);
    expect(p?.precoCusto).toBe(8500.5);
    expect(p?.ativo).toBe(true);

    const where = (ctx.prisma.fatoProduto.findFirst as jest.Mock).mock.calls[0][0].where;
    expect(where).toEqual({ odooId: 42 });
  });

  it("odooId inexistente retorna encontrado:false SEM throw", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProduto.findFirst as jest.Mock).mockResolvedValue(null);

    const r = await cadastroDetalharProduto.handler({ odooId: 999 } as never, ctx);
    if (r.estado === "preparando") throw new Error("nao deveria estar preparando");

    expect(r.dados.encontrado).toBe(false);
    expect(r.dados.produto).toBeNull();
  });

  it("o retorno valida contra o outputSchema Zod (parse)", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProduto.findFirst as jest.Mock).mockResolvedValue(fakeProduto());

    const r = await cadastroDetalharProduto.handler({ odooId: 42 } as never, ctx);
    expect(() => cadastroDetalharProduto.outputSchema.parse(r)).not.toThrow();
  });

  it("precos nulos viram null sem quebrar o parse", async () => {
    const ctx = makeCtx();
    primeFreshness(ctx);
    (ctx.prisma.fatoProduto.findFirst as jest.Mock).mockResolvedValue({
      ...fakeProduto(),
      precoVenda: null,
      precoCusto: null,
    });

    const r = await cadastroDetalharProduto.handler({ odooId: 42 } as never, ctx);
    if (r.estado === "preparando") throw new Error("nao deveria estar preparando");
    expect(r.dados.produto?.precoVenda).toBeNull();
    expect(r.dados.produto?.precoCusto).toBeNull();
    expect(() => cadastroDetalharProduto.outputSchema.parse(r)).not.toThrow();
  });
});
