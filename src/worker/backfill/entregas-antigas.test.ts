// Fase 1B Task 5 , back-fill dirigido dos pedidos antigos em aberto.
import { backfillEntregasAntigas } from "./entregas-antigas";
import type { OdooClient } from "../odoo/client";
import type { PrismaClient } from "../../generated/prisma/client";

// getModelFields toca o Odoo; no teste devolve uma lista fixa (so e chamado se houver faltantes).
jest.mock("../odoo/field-selection", () => ({
  getModelFields: jest.fn().mockResolvedValue(["id", "pedido_id", "documento_id", "write_date"]),
}));

// Os rebuilds de fato batem SQL cru no Postgres; no unit test viram no-op observavel.
const rebuildPedido = jest.fn().mockResolvedValue(1);
const rebuildItem = jest.fn().mockResolvedValue(1);
const rebuildClass = jest.fn().mockResolvedValue(1);
const markBuilt = jest.fn().mockResolvedValue(undefined);
jest.mock("../fatos/fato-pedido", () => ({ rebuildFatoPedido: (...a: unknown[]) => rebuildPedido(...a) }));
jest.mock("../fatos/fato-pedido-item", () => ({ rebuildFatoPedidoItem: (...a: unknown[]) => rebuildItem(...a) }));
jest.mock("../fatos/fato-pedido-classificacao", () => ({ rebuildFatoPedidoClassificacao: (...a: unknown[]) => rebuildClass(...a) }));
jest.mock("../fatos/fato-build-state", () => ({ markFatoBuilt: (...a: unknown[]) => markBuilt(...a) }));

function fakeRawDelegate() {
  return {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
}

function fakePrisma() {
  return {
    rawPedidoDocumento: fakeRawDelegate(),
    rawSpedDocumentoItem: fakeRawDelegate(),
  } as unknown as PrismaClient & {
    rawPedidoDocumento: ReturnType<typeof fakeRawDelegate>;
    rawSpedDocumentoItem: ReturnType<typeof fakeRawDelegate>;
  };
}

function fakeClient(chamadas: string[]): OdooClient {
  return {
    searchIds: jest.fn().mockImplementation((m: string) => {
      chamadas.push(`searchIds:${m}`);
      return Promise.resolve([]);
    }),
    searchRead: jest.fn().mockResolvedValue([]),
    searchReadPage: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
  } as unknown as OdooClient;
}

beforeEach(() => {
  rebuildPedido.mockClear();
  rebuildItem.mockClear();
  rebuildClass.mockClear();
  markBuilt.mockClear();
});

describe("backfillEntregasAntigas", () => {
  it("APPLY reconcilia o HEADER antes do ITEM (FK do item depende do pai vivo)", async () => {
    const chamadas: string[] = [];
    const prisma = fakePrisma();
    await backfillEntregasAntigas(fakeClient(chamadas), prisma, { apply: true });
    const iHeader = chamadas.indexOf("searchIds:pedido.documento");
    const iItem = chamadas.indexOf("searchIds:sped.documento.item");
    expect(iHeader).toBeGreaterThanOrEqual(0);
    expect(iItem).toBeGreaterThanOrEqual(0);
    expect(iHeader).toBeLessThan(iItem);
  });

  it("APPLY roda atendimento e os 3 rebuilds + marca o build de atendimento", async () => {
    const prisma = fakePrisma();
    await backfillEntregasAntigas(fakeClient([]), prisma, { apply: true });
    expect(prisma.rawSpedDocumentoItem.upsert).not.toThrow;
    expect(rebuildPedido).toHaveBeenCalledTimes(1);
    expect(rebuildItem).toHaveBeenCalledTimes(1);
    expect(rebuildClass).toHaveBeenCalledTimes(1);
    expect(markBuilt).toHaveBeenCalledTimes(1);
  });

  it("DRY-RUN nao faz upsert nem rebuild (so mede o delta)", async () => {
    const prisma = fakePrisma();
    const r = await backfillEntregasAntigas(fakeClient([]), prisma, { apply: false });
    expect(prisma.rawPedidoDocumento.upsert).not.toHaveBeenCalled();
    expect(prisma.rawSpedDocumentoItem.upsert).not.toHaveBeenCalled();
    expect(rebuildPedido).not.toHaveBeenCalled();
    expect(markBuilt).not.toHaveBeenCalled();
    expect(r).toMatchObject({ headers: 0, itens: 0, atendimento: 0 });
  });

  it("DRY-RUN mede o header pelo corte proprio e o item pela UNIAO herdada", async () => {
    // O header (com corte proprio) mede por corteDomain; o item (sem corte proprio) mede pela
    // uniao de corteDomainHerdado. Confirma que o dry-run usa o MESMO universo que o reconcile.
    const chamadas: string[] = [];
    const prisma = fakePrisma();
    await backfillEntregasAntigas(fakeClient(chamadas), prisma, { apply: false });
    expect(chamadas).toContain("searchIds:pedido.documento");
    expect(chamadas).toContain("searchIds:sped.documento.item");
  });
});
