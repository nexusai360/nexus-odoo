import { mapSerialRow, rebuildFatoSerial } from "./fato-serial";
import type { PrismaClient } from "../../generated/prisma/client";

// ─── mapSerialRow ──────────────────────────────────────────────────────────────
describe("mapSerialRow", () => {
  it("mapeia serial, produto, local e datas", () => {
    const row = mapSerialRow({
      id: 10,
      nome: "SN-123",
      produto_id: [7, "Esteira"],
      local_id: [2, "Galpao"],
      valor_custo: 900,
      data_compra: "2024-01-10",
      data_venda: "2024-05-01",
      quantidade: 1,
    });
    expect(row.odooId).toBe(10);
    expect(row.serial).toBe("SN-123");
    expect(row.produtoId).toBe(7);
    expect(row.produtoNome).toBe("Esteira");
    expect(row.localId).toBe(2);
    expect(row.localNome).toBe("Galpao");
    expect(row.valorCusto).toBe(900);
    expect(row.dataSaida).toEqual(new Date("2024-05-01"));
  });

  it("dataSaida cai para data_baixa quando nao ha data_venda", () => {
    const row = mapSerialRow({ id: 1, nome: "X", data_baixa: "2024-06-02" });
    expect(row.dataSaida).toEqual(new Date("2024-06-02"));
  });

  it("descarta os blobs de imagem (image_*): FatoSerialRow nao tem campo de imagem", () => {
    const row = mapSerialRow({ id: 1, nome: "X", image: "AAAA", image_1024: "BBBB" });
    expect(Object.keys(row).some((k) => k.startsWith("image"))).toBe(false);
  });
});

// ─── rebuildFatoSerial ─────────────────────────────────────────────────────────
// raw_sped_produto_lote_serie tambem carregava image_* legadas (~3.3GB). O builder
// deve ler o jsonb SEM os blobs, excluindo-os no Postgres via $queryRaw.
describe("rebuildFatoSerial", () => {
  function makeMocks(rows: { data: Record<string, unknown> }[]) {
    const mocks = {
      queryRaw: jest.fn().mockResolvedValue(rows),
      executeRaw: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
      upsert: jest.fn().mockResolvedValue({}),
    };
    const mockTx = {
      fatoSerial: { deleteMany: mocks.deleteMany, createMany: mocks.createMany },
      fatoBuildState: { upsert: mocks.upsert },
    };
    const mockPrisma = {
      $queryRaw: mocks.queryRaw,
      $executeRaw: mocks.executeRaw,
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
    };
    return { mocks, mockPrisma };
  }

  it("le os seriais via $queryRaw que EXCLUI os blobs de imagem no Postgres", async () => {
    const { mocks, mockPrisma } = makeMocks([{ data: { id: 1, nome: "SN-1" } }]);
    await rebuildFatoSerial(mockPrisma as unknown as PrismaClient);

    expect(mocks.queryRaw).toHaveBeenCalled();
    const sql = (mocks.queryRaw.mock.calls[0][0] as string[]).join(" ");
    expect(sql).toMatch(/-\s*'image'/);
    expect(sql).toContain("image_1024");
    expect(sql).toContain("image_1920");
    expect(sql).toContain("raw_sped_produto_lote_serie");
  });

  it("mapeia, insere em fato_serial com markFatoBuilt e roda o enriquecimento", async () => {
    const { mocks, mockPrisma } = makeMocks([
      { data: { id: 5, nome: "SN-5", produto_id: [7, "Esteira"] } },
    ]);
    const n = await rebuildFatoSerial(mockPrisma as unknown as PrismaClient);

    expect(n).toBe(1);
    expect(mocks.deleteMany).toHaveBeenCalledWith({});
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    const inserted = mocks.createMany.mock.calls[0][0].data as Array<Record<string, unknown>>;
    expect(inserted[0].serial).toBe("SN-5");
    expect(mocks.upsert).toHaveBeenCalled();
    // enriquecimento (data_saida/local_nome via rastreabilidade) roda apos a tx
    expect(mocks.executeRaw).toHaveBeenCalled();
  });
});
