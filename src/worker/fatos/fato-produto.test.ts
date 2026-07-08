import { mapProdutoRow, rebuildFatoProduto } from "./fato-produto";
import type { PrismaClient } from "../../generated/prisma/client";

// ─── mapProdutoRow ─────────────────────────────────────────────────────────────
describe("mapProdutoRow", () => {
  it("mapeia campos basicos e relacoes M2O", () => {
    const row = mapProdutoRow({
      id: 42,
      nome: "Esteira X",
      codigo: "EST-X",
      marca_id: [7, "Matrix"],
      familia_id: [3, "Cardio"],
      preco_venda: 1500,
      preco_custo: 900,
    });
    expect(row.odooId).toBe(42);
    expect(row.nome).toBe("Esteira X");
    expect(row.codigo).toBe("EST-X");
    expect(row.marcaId).toBe(7);
    expect(row.marcaNome).toBe("Matrix");
    expect(row.familiaId).toBe(3);
    expect(row.precoVenda).toBe(1500);
    expect(row.precoCusto).toBe(900);
  });

  it("descarta os blobs de imagem (image_*): FatoProdutoRow nao tem campo de imagem", () => {
    const row = mapProdutoRow({
      id: 1,
      nome: "P1",
      image: "AAAA",
      image_1024: "BBBB",
      image_1920: "CCCC",
    });
    const keys = Object.keys(row);
    expect(keys.some((k) => k.startsWith("image"))).toBe(false);
  });
});

// ─── rebuildFatoProduto ────────────────────────────────────────────────────────
// O builder deve ler o jsonb SEM os blobs de imagem (image_*), excluindo-os no
// Postgres via $queryRaw , eles chegam a 1.7MB/linha e, carregados inteiros no
// heap, estouravam o OOM do worker antes da classificacao rodar (2026-07-08).
describe("rebuildFatoProduto", () => {
  function makeMocks(rows: { data: Record<string, unknown> }[]) {
    const mocks = {
      queryRaw: jest.fn().mockResolvedValue(rows),
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const mockTx = {
      fatoProduto: { deleteMany: mocks.deleteMany, createMany: mocks.createMany },
      fatoBuildState: { upsert: mocks.upsert },
    };
    const mockPrisma = {
      $queryRaw: mocks.queryRaw,
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    };
    return { mocks, mockPrisma };
  }

  it("le os produtos via $queryRaw que EXCLUI os blobs de imagem no Postgres", async () => {
    const { mocks, mockPrisma } = makeMocks([{ data: { id: 1, nome: "P1" } }]);
    await rebuildFatoProduto(mockPrisma as unknown as PrismaClient);

    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    const sql = (mocks.queryRaw.mock.calls[0][0] as string[]).join(" ");
    expect(sql).toMatch(/-\s*'image'/); // remove a chave base
    expect(sql).toContain("image_1024");
    expect(sql).toContain("image_1920");
    expect(sql).toContain("raw_sped_produto");
  });

  it("mapeia o data (ja sem blob) e insere em fato_produto com markFatoBuilt", async () => {
    const { mocks, mockPrisma } = makeMocks([
      { data: { id: 5, nome: "Esteira", marca_id: [7, "Matrix"] } },
    ]);
    const n = await rebuildFatoProduto(mockPrisma as unknown as PrismaClient);

    expect(n).toBe(1);
    expect(mocks.deleteMany).toHaveBeenCalledWith({});
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    const inserted = mocks.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(inserted[0].odooId).toBe(5);
    expect(inserted[0].nome).toBe("Esteira");
    expect(inserted[0].marcaNome).toBe("Matrix");
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it("filtra linhas sem odooId valido ou sem nome", async () => {
    const { mockPrisma } = makeMocks([
      { data: { id: 5, nome: "Valido" } },
      { data: { id: 6, nome: "" } }, // sem nome
      { data: { nome: "SemId" } }, // sem id
    ]);
    const n = await rebuildFatoProduto(mockPrisma as unknown as PrismaClient);
    expect(n).toBe(1);
  });
});
