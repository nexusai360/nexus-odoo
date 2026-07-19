// mcp/tools/estoque/composicao-kit.test.ts
import { estoqueComposicaoKit } from "./composicao-kit.js";
import type { ToolHandlerCtx } from "../../catalog/types.js";
import type { UserContext } from "../../auth/user-context.js";

const FATOS = ["fato_lista_material_item", "fato_produto", "fato_preco", "fato_pedido_item"];
const NOW = new Date("2026-07-19T00:00:00Z");

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    fatoBuildState: {
      findMany: jest.fn().mockResolvedValue(FATOS.map((fato) => ({ fato, ultimoBuildAt: NOW }))),
    },
    syncState: { findMany: jest.fn().mockResolvedValue([]) },
    fatoProduto: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    fatoListaMaterialItem: { findMany: jest.fn().mockResolvedValue([]) },
    fatoPreco: { findMany: jest.fn().mockResolvedValue([]) },
    fatoPedidoItem: { findMany: jest.fn().mockResolvedValue([]) },
    ...over,
  };
}

function makeCtx(prisma: unknown): ToolHandlerCtx {
  return { prisma: prisma as never, user: { userId: "u1", role: "admin", domains: ["estoque"] } as UserContext };
}

describe("estoque_composicao_kit", () => {
  it("estado 'preparando' quando um fato nao tem build", async () => {
    const prisma = makePrisma({
      fatoBuildState: { findMany: jest.fn().mockResolvedValue([{ fato: "fato_produto", ultimoBuildAt: NOW }]) },
    });
    const r = await estoqueComposicaoKit.handler({} as never, makeCtx(prisma));
    expect(r).toEqual({ estado: "preparando" });
  });

  it("rateia por kitId: estrutura vs painel, soma exata, _RESPOSTA humanizada", async () => {
    const prisma = makePrisma({
      fatoProduto: {
        findUnique: jest.fn().mockResolvedValue({ odooId: 894, nome: "ESTEIRA PP", unidadeNome: "kit", marcaNome: "MATRIX" }),
        findMany: jest.fn().mockResolvedValue([
          { odooId: 273, marcaNome: "MATRIX", precoCusto: 37630, precoVenda: 68418.18 },
          { odooId: 501, marcaNome: "MATRIX", precoCusto: 23820.43, precoVenda: 43309.88 },
        ]),
      },
      fatoListaMaterialItem: {
        findMany: jest.fn().mockResolvedValue([
          { componenteProdutoId: 273, componenteNome: "ESTRUTURA", quantidade: 1, listaId: 10, listaDataAtivacao: null, listaInativa: false },
          { componenteProdutoId: 501, componenteNome: "PAINEL", quantidade: 1, listaId: 10, listaDataAtivacao: null, listaInativa: false },
        ]),
      },
      fatoPreco: { findMany: jest.fn().mockResolvedValue([{ produtoId: 894, tabelaId: 3, valor: 102963.64 }]) },
    });
    const r = await estoqueComposicaoKit.handler({ kitId: 894 } as never, makeCtx(prisma));
    expect(r.estado).toBe("ok");
    if (r.estado === "preparando") return;
    expect(r.dados.kit?.kitId).toBe(894);
    expect(r.dados.coberturaCompleta).toBe(true);
    expect(r.dados.valorReferencia).toBe(102963.64);
    const soma = r.dados.componentes.reduce((s, c) => s + c.valorRateado, 0);
    expect(soma).toBeCloseTo(102963.64, 2);
    const estrutura = r.dados.componentes.find((c) => c.percentual > 50)!;
    expect(estrutura.ehMatrix).toBe(true);
    expect(r.dados._RESPOSTA).toContain("vale");
  });

  it("termo com varios matches devolve ambiguidade (nao escolhe sozinho)", async () => {
    const prisma = makePrisma({
      fatoListaMaterialItem: {
        findMany: jest
          .fn()
          // 1a chamada: queryListaKits distinct produtoPaiId
          .mockResolvedValueOnce([{ produtoPaiId: 1 }, { produtoPaiId: 2 }]),
      },
      fatoProduto: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { odooId: 1, nome: "ESTEIRA ONYX", marcaNome: "MATRIX" },
          { odooId: 2, nome: "ESTEIRA PERFORMANCE", marcaNome: "MATRIX" },
        ]),
      },
    });
    const r = await estoqueComposicaoKit.handler({ termo: "esteira" } as never, makeCtx(prisma));
    expect(r.estado).toBe("ok");
    if (r.estado === "preparando") return;
    expect(r.dados.ambiguidade?.totalMatches).toBe(2);
    expect(r.dados.kit).toBeNull();
  });

  it("termo sem match devolve vazio com mensagem", async () => {
    const prisma = makePrisma({
      fatoListaMaterialItem: { findMany: jest.fn().mockResolvedValueOnce([{ produtoPaiId: 1 }]) },
      fatoProduto: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ odooId: 1, nome: "ESTEIRA ONYX", marcaNome: "MATRIX" }]),
      },
    });
    const r = await estoqueComposicaoKit.handler({ termo: "xyznaoexiste" } as never, makeCtx(prisma));
    if (r.estado === "preparando") throw new Error("nao esperado");
    expect(r.estado).toBe("vazio");
    expect(r.dados._RESPOSTA).toContain("Nenhum kit");
  });
});
