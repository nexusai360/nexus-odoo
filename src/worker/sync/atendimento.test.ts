import { syncAtendimento, dominioAtendimento } from "./atendimento";
import type { OdooClient } from "../odoo/client";
import type { RawDelegate } from "./incremental";

jest.mock("../odoo/field-selection", () => ({
  getModelFields: jest
    .fn()
    .mockResolvedValue([
      "id",
      "pedido_id",
      "produto_id",
      "quantidade",
      "vr_produtos",
      "write_date",
      "quantidade_a_atender_pedido",
      "quantidade_atendida_pedido",
    ]),
}));

function item(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    pedido_id: [2348, "PV-2051/26"],
    produto_id: [99, "Esteira"],
    quantidade: 10,
    vr_produtos: 1000,
    write_date: "2026-06-23 12:46:08",
    quantidade_a_atender_pedido: 4,
    quantidade_atendida_pedido: 6,
    ...extra,
  };
}

function fakeClient(paginas: Record<string, unknown>[][]): OdooClient {
  let chamada = 0;
  return {
    searchReadPage: jest.fn().mockImplementation(() => {
      const records = paginas[chamada] ?? [];
      const hasMore = chamada < paginas.length - 1;
      chamada += 1;
      return Promise.resolve({ records, hasMore });
    }),
  } as unknown as OdooClient;
}

function fakeRaw(): RawDelegate & { upsert: jest.Mock } {
  return {
    upsert: jest.fn().mockResolvedValue(undefined),
    createMany: jest.fn().mockResolvedValue(undefined),
  } as unknown as RawDelegate & { upsert: jest.Mock };
}

describe("dominioAtendimento", () => {
  it("le so itens que pertencem a um pedido", () => {
    expect(dominioAtendimento()).toContainEqual(["pedido_id", "!=", false]);
  });

  it("recua com o override de sped.documento.item (a_atender dos antigos fresco)", () => {
    // Fase 1B: e uma FUNCAO, nao const. A const congelava CORTE_INGESTAO_ISO no import; o
    // a_atender dos pedidos antigos (2024-11) nunca atualizaria (ficaria congelado/NULL).
    // O gate pedido_id!=false garante que o recuo NAO traz itens de nota.
    expect(dominioAtendimento()).toContainEqual([
      "documento_id.data_emissao",
      ">=",
      "2024-11-01",
    ]);
  });

  it("NAO filtra por write_date , e a razao de existir do job", () => {
    // O write_date do item nao muda quando a entrega acontece (quem nasce e a nota).
    // Se filtrassemos por ele, o valor entraria uma vez e congelaria.
    const campos = dominioAtendimento().map(([campo]) => campo);
    expect(campos).not.toContain("write_date");
  });
});

describe("syncAtendimento", () => {
  it("regrava os itens com a quantidade a atender", async () => {
    const raw = fakeRaw();

    const r = await syncAtendimento(fakeClient([[item(1), item(2)]]), raw);

    expect(r).toMatchObject({ lidos: 2, atualizados: 2 });
    expect(raw.upsert).toHaveBeenCalledTimes(2);
    const primeiro = raw.upsert.mock.calls[0][0];
    expect(primeiro.where).toEqual({ odooId: 1 });
    expect(primeiro.update.data).toMatchObject({
      quantidade_a_atender_pedido: 4,
      quantidade_atendida_pedido: 6,
    });
  });

  it("grava o registro INTEIRO, nao so os campos novos", async () => {
    // O upsert do raw substitui o `data` inteiro. Se o job pedisse ao Odoo apenas os
    // dois campos computados, ele apagaria produto, quantidade, valor e o proprio
    // pedido_id do JSON , o builder do fato nao acharia mais nenhum item e a tela de
    // pedidos zeraria, sem erro nenhum no log.
    const raw = fakeRaw();

    await syncAtendimento(fakeClient([[item(1)]]), raw);

    const gravado = raw.upsert.mock.calls[0][0].update.data as Record<
      string,
      unknown
    >;
    expect(gravado).toMatchObject({
      id: 1,
      pedido_id: [2348, "PV-2051/26"],
      produto_id: [99, "Esteira"],
      quantidade: 10,
      vr_produtos: 1000,
    });
  });

  it("pagina ate esgotar", async () => {
    const raw = fakeRaw();

    const r = await syncAtendimento(
      fakeClient([[item(1), item(2)], [item(3)]]),
      raw,
    );

    expect(r.lidos).toBe(3);
    expect(raw.upsert).toHaveBeenCalledTimes(3);
  });

  it("ignora registro sem id valido", async () => {
    const raw = fakeRaw();

    const r = await syncAtendimento(
      fakeClient([[item(1), { ...item(2), id: "nao-e-numero" }]]),
      raw,
    );

    expect(r.lidos).toBe(2);
    expect(r.atualizados).toBe(1);
  });

  it("nao quebra quando o Odoo nao devolve nada", async () => {
    const raw = fakeRaw();

    const r = await syncAtendimento(fakeClient([[]]), raw);

    expect(r).toMatchObject({ lidos: 0, atualizados: 0 });
    expect(raw.upsert).not.toHaveBeenCalled();
  });
});
