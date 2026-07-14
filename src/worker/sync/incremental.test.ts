import { syncIncremental } from "./incremental";

// Isola field-selection: não queremos um RPC real de fields_get nos testes de
// incremental; o comportamento do filtro de campos é coberto em field-selection.test.ts.
jest.mock("../odoo/field-selection", () => ({
  getModelFields: jest.fn().mockResolvedValue(["id", "name", "write_date"]),
}));

/** Cria um fake client com uma única página (sem paginação). */
function fakeClientSinglePage(records: unknown[]) {
  const searchReadPage = jest.fn().mockResolvedValue({ records, hasMore: false });
  return { searchReadPage } as never;
}

function fakeRawTable() {
  return {
    upsert: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({}),
  };
}

describe("syncIncremental", () => {
  it("filtra por write_date recuando a MARGEM de seguranca a partir do lastIncrementalAt", async () => {
    const client = fakeClientSinglePage([]);
    const raw = fakeRawTable();
    await syncIncremental(client, raw as never, "res.partner", new Date("2026-05-01T12:00:00Z"));
    const domain = (client as never as { searchReadPage: jest.Mock }).searchReadPage.mock.calls[0][1];
    // 15 min para tras: fecha a janela de commit do Odoo (ver MARGEM_SEGURANCA_MS).
    expect(domain).toEqual([["write_date", ">", "2026-05-01 11:45:00"]]);
  });

  // O BUG QUE ISTO TRAVA (perícia de 2026-07-13, 158 itens perdidos em producao):
  // o Odoo carimba `write_date` no INICIO da transacao e so torna a linha visivel no
  // COMMIT. Quando alguem salva uma nota com 30 itens, os itens nascem com write_date de
  // T, mas so aparecem para o search_read em T+alguns segundos. Se o ciclo le nesse
  // intervalo, ele NAO ve os itens , e como a marca d'agua avanca para o inicio do ciclo,
  // o proximo ciclo pede `write_date > inicio`, que ja passou do write_date deles.
  // Eles nunca mais sao buscados: o buraco e PERMANENTE (a reconciliacao so olha o que
  // sumiu do Odoo, nunca o que falta no cache).
  it("busca o registro que ficou preso na janela de commit do Odoo", async () => {
    const inicioDoCicloAnterior = new Date("2026-07-03T21:30:00Z");
    // Item criado com write_date 40s ANTES do ciclo anterior comecar, mas que so ficou
    // visivel depois que aquele ciclo ja tinha lido. Sem margem, ele some para sempre.
    const itemPreso = { id: 258508, name: "item que o commit atrasou", write_date: "2026-07-03 21:29:20" };
    const client = fakeClientSinglePage([itemPreso]);
    const raw = fakeRawTable();

    const res = await syncIncremental(client, raw as never, "sped.documento.item", inicioDoCicloAnterior);

    const [, domain] = (client as never as { searchReadPage: jest.Mock }).searchReadPage.mock.calls[0];
    const [, , limite] = (domain as [string, string, string][])[0];
    expect(limite < "2026-07-03 21:29:20").toBe(true); // a janela alcanca o item preso
    expect(res.count).toBe(1);
    expect(raw.upsert).toHaveBeenCalledTimes(1); // e ele volta para o cache (upsert = idempotente)
  });

  it("usa domínio vazio (backfill) quando lastIncrementalAt é null", async () => {
    const client = fakeClientSinglePage([]);
    const raw = fakeRawTable();
    await syncIncremental(client, raw as never, "res.partner", null);
    expect((client as never as { searchReadPage: jest.Mock }).searchReadPage.mock.calls[0][1]).toEqual([]);
  });

  describe("backfill (since === null)", () => {
    it("usa createMany em lote, não upsert", async () => {
      const records = [
        { id: 1, name: "A", write_date: "2026-05-02 10:00:00" },
        { id: 2, name: "B", write_date: false },
      ];
      const client = fakeClientSinglePage(records);
      const raw = fakeRawTable();
      const res = await syncIncremental(client, raw as never, "res.partner", null);
      expect(res.count).toBe(2);
      expect(raw.upsert).not.toHaveBeenCalled();
      expect(raw.createMany).toHaveBeenCalledTimes(1);
      const call = raw.createMany.mock.calls[0][0];
      expect(call.skipDuplicates).toBe(true);
      expect(call.data).toHaveLength(2);
      expect(call.data[0].odooId).toBe(1);
      expect(call.data[0].odooWriteDate).toBeInstanceOf(Date);
      expect(call.data[1].odooId).toBe(2);
      expect(call.data[1].odooWriteDate).toBeNull();
    });

    it("retorna count = 0 e não chama createMany quando não há registros", async () => {
      const client = fakeClientSinglePage([]);
      const raw = fakeRawTable();
      const res = await syncIncremental(client, raw as never, "res.partner", null);
      expect(res.count).toBe(0);
      expect(raw.createMany).not.toHaveBeenCalled();
    });
  });

  describe("ciclo incremental (since !== null)", () => {
    it("usa upsert por registro, não createMany", async () => {
      const records = [
        { id: 1, name: "A", write_date: "2026-05-02 10:00:00" },
        { id: 2, name: "B", write_date: false },
      ];
      const client = fakeClientSinglePage(records);
      const raw = fakeRawTable();
      const res = await syncIncremental(client, raw as never, "res.partner", new Date("2026-05-01T00:00:00Z"));
      expect(res.count).toBe(2);
      expect(raw.createMany).not.toHaveBeenCalled();
      expect(raw.upsert).toHaveBeenCalledTimes(2);
      const primeiro = raw.upsert.mock.calls[0][0];
      expect(primeiro.where).toEqual({ odooId: 1 });
      expect(primeiro.create.odooWriteDate).toBeInstanceOf(Date);
      const segundo = raw.upsert.mock.calls[1][0];
      expect(segundo.create.odooWriteDate).toBeNull();
    });
  });

  describe("paginação", () => {
    it("para quando a página retorna menos registros que o pageSize", async () => {
      // Para testar multi-página de forma determinística, usamos um mock manual.
      const raw = fakeRawTable();
      let callCount = 0;
      const pages: unknown[][] = [
        [{ id: 1, name: "A", write_date: false }, { id: 2, name: "B", write_date: false }],
        [{ id: 3, name: "C", write_date: false }],
      ];
      const multiPageClient = {
        searchReadPage: jest.fn().mockImplementation(async () => {
          const page = pages[callCount++] ?? [];
          return { records: page, hasMore: page.length >= 2 };
        }),
      } as never;

      const res = await syncIncremental(multiPageClient, raw as never, "res.partner", null);
      expect(res.count).toBe(3);
      // duas chamadas: página 1 (hasMore=true) e página 2 (hasMore=false)
      expect((multiPageClient as never as { searchReadPage: jest.Mock }).searchReadPage).toHaveBeenCalledTimes(2);
    });

    it("passa o offset correto nas chamadas subsequentes", async () => {
      let callCount = 0;
      const pages: unknown[][] = [
        Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `R${i + 1}`, write_date: false })),
        [{ id: 501, name: "R501", write_date: false }],
      ];
      const multiPageClient = {
        searchReadPage: jest.fn().mockImplementation(async (_m: string, _d: unknown[], opts: { offset: number }) => {
          const page = pages[callCount++] ?? [];
          return { records: page, hasMore: opts.offset === 0 };
        }),
      } as never;
      const raw = fakeRawTable();
      const res = await syncIncremental(multiPageClient, raw as never, "res.partner", null);
      expect(res.count).toBe(501);
      const calls = (multiPageClient as never as { searchReadPage: jest.Mock }).searchReadPage.mock.calls;
      expect(calls[0][2].offset).toBe(0);
      expect(calls[1][2].offset).toBe(500);
    });
  });

  it("CR-01: o watermark é capturado ANTES do fetch, não na conclusão", async () => {
    let fetchStart = 0;
    const client = {
      searchReadPage: jest.fn().mockImplementation(async () => {
        fetchStart = Date.now();
        await new Promise((r) => setTimeout(r, 20));
        return { records: [], hasMore: false };
      }),
    } as never;
    const raw = fakeRawTable();
    const res = await syncIncremental(client, raw as never, "res.partner", null);
    // watermark <= instante em que o fetch começou (pré-fetch),
    // estritamente menor que a conclusão.
    expect(res.watermark.getTime()).toBeLessThanOrEqual(fetchStart);
  });
});
