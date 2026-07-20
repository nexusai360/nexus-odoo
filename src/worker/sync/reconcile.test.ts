import { reconcileModel } from "./reconcile";

jest.mock("../odoo/field-selection", () => ({
  getModelFields: jest.fn().mockResolvedValue(["id", "name", "write_date"]),
}));

/** Cache: linhas já existentes na tabela raw. O updateMany devolve quantas linhas casaram,
 *  como o Prisma faz. */
function fakeRaw(linhas: { odooId: number; rawDeleted?: boolean }[]) {
  return {
    findMany: jest.fn().mockResolvedValue(
      linhas.map((l) => ({ odooId: l.odooId, rawDeleted: l.rawDeleted ?? false })),
    ),
    updateMany: jest.fn().mockImplementation(
      (args: { where: { odooId: { in: number[] } } }) =>
        Promise.resolve({ count: args.where.odooId.in.length }),
    ),
    upsert: jest.fn().mockResolvedValue({}),
  };
}

describe("reconcileModel , o cache tem que convergir para o Odoo nos DOIS sentidos", () => {
  it("marca rawDeleted nos ids que sumiram do Odoo", async () => {
    const client = { searchIds: jest.fn().mockResolvedValue([1, 3]), searchRead: jest.fn() } as never;
    const raw = fakeRaw([{ odooId: 1 }, { odooId: 2 }, { odooId: 3 }]);
    const r = await reconcileModel(client, raw as never, "res.partner");
    expect(raw.updateMany).toHaveBeenCalledWith({
      where: { odooId: { in: [2] } },
      data: { rawDeleted: true },
    });
    expect(r.marcadosDeletados).toBe(1);
  });

  it("não chama updateMany quando nada sumiu", async () => {
    const client = { searchIds: jest.fn().mockResolvedValue([1, 2]), searchRead: jest.fn() } as never;
    const raw = fakeRaw([{ odooId: 1 }, { odooId: 2 }]);
    const r = await reconcileModel(client, raw as never, "res.partner");
    expect(raw.updateMany).not.toHaveBeenCalled();
    expect(r.marcadosDeletados).toBe(0);
  });

  // O BURACO QUE ISTO FECHA (perícia de 2026-07-13): a reconciliação era mão única. Ela só
  // marcava o que sumiu do Odoo e NUNCA procurava o que faltava no cache, então os 158 itens
  // perdidos na janela de commit ficavam de fora para sempre, sem nada para pescá-los.
  it("BUSCA no Odoo e insere o que esta FALTANDO no cache", async () => {
    const itemPerdido = { id: 258508, name: "item que nunca chegou", write_date: "2026-07-03 21:29:20" };
    const client = {
      searchIds: jest.fn().mockResolvedValue([1, 258508]),
      searchRead: jest.fn().mockResolvedValue([itemPerdido]),
    } as never;
    const raw = fakeRaw([{ odooId: 1 }]); // 258508 nao esta no cache

    const r = await reconcileModel(client, raw as never, "sped.documento.item");

    const c = client as never as { searchRead: jest.Mock };
    expect(c.searchRead).toHaveBeenCalledWith(
      "sped.documento.item",
      [["id", "in", [258508]]],
      ["id", "name", "write_date"],
    );
    expect(raw.upsert).toHaveBeenCalledTimes(1);
    const chamada = raw.upsert.mock.calls[0][0];
    expect(chamada.where).toEqual({ odooId: 258508 });
    expect(chamada.create.data).toEqual(itemPerdido);
    expect(chamada.create.rawDeleted).toBe(false);
    expect(r.inseridosFaltantes).toBe(1);
  });

  it("RESSUSCITA a linha marcada como deletada que voltou a existir no Odoo", async () => {
    // Sem isto, uma marcacao errada de rawDeleted e definitiva: a linha fica invisivel para
    // sempre, mesmo o Odoo dizendo que ela existe.
    const client = {
      searchIds: jest.fn().mockResolvedValue([1, 2]),
      searchRead: jest.fn().mockResolvedValue([]),
    } as never;
    const raw = fakeRaw([{ odooId: 1 }, { odooId: 2, rawDeleted: true }]);

    const r = await reconcileModel(client, raw as never, "res.partner");

    expect(raw.updateMany).toHaveBeenCalledWith({
      where: { odooId: { in: [2] } },
      data: { rawDeleted: false },
    });
    expect(r.ressuscitados).toBe(1);
    expect(raw.upsert).not.toHaveBeenCalled(); // ja esta no cache, so estava escondida
  });

  // A ARMADILHA que este teste trava: `sped.documento.item` nao tem data propria, entao o
  // corte dele e o do documento pai. Perguntar ao Odoo "quais itens existem" SEM o corte
  // herdado devolve o modelo inteiro (233.563 itens contra 59.804 dentro do corte, medido em
  // producao). Inserir por essa lista despejaria ~172 mil linhas pre-corte no cache, contra a
  // regra de ingestao, e provavelmente mataria o worker por memoria.
  it("modelo FILHO: busca os faltantes pelo corte HERDADO do pai, nunca pelo modelo inteiro", async () => {
    const searchIds = jest
      .fn()
      // 1a chamada (deteccao de exclusao): universo amplo, o modelo inteiro
      .mockResolvedValueOnce([1, 2, 999_001, 999_002])
      // 2a chamada (o que inserir): so o que esta dentro do corte herdado
      .mockResolvedValueOnce([1, 2]);
    const client = { searchIds, searchRead: jest.fn().mockResolvedValue([]) } as never;
    const raw = fakeRaw([{ odooId: 1 }, { odooId: 2 }]);

    const r = await reconcileModel(client, raw as never, "sped.documento.item");

    expect(searchIds).toHaveBeenNthCalledWith(1, "sped.documento.item", []);
    // Fase 1B: o corte herdado do item virou UNIAO (itens de pedido recuam para 2024-11; itens
    // de nota ficam em 2026). O universo restrito de insercao continua vindo do herdado, nunca
    // do modelo inteiro , os pre-corte 999_00x seguem fora.
    expect(searchIds).toHaveBeenNthCalledWith(2, "sped.documento.item", [
      "|",
      "&", ["pedido_id", "!=", false], ["documento_id.data_emissao", ">=", "2024-11-01"],
      "&", ["pedido_id", "=", false], ["documento_id.data_emissao", ">=", "2026-01-01"],
    ]);
    // os pre-corte (999_001, 999_002) NAO entram no cache
    expect(raw.upsert).not.toHaveBeenCalled();
    expect(r.inseridosFaltantes).toBe(0);
    // e tambem NAO sao marcados como deletados (eles existem no Odoo, so estao fora do corte)
    expect(raw.updateMany).not.toHaveBeenCalled();
  });

  it("cache em dia: nao escreve nada", async () => {
    const client = {
      searchIds: jest.fn().mockResolvedValue([1, 2]),
      searchRead: jest.fn().mockResolvedValue([]),
    } as never;
    const raw = fakeRaw([{ odooId: 1 }, { odooId: 2 }]);
    const r = await reconcileModel(client, raw as never, "res.partner");
    expect(raw.updateMany).not.toHaveBeenCalled();
    expect(raw.upsert).not.toHaveBeenCalled();
    expect(r).toEqual({ marcadosDeletados: 0, inseridosFaltantes: 0, ressuscitados: 0 });
  });
});
