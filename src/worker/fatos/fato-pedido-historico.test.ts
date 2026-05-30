import { mapPedidoHistoricoRow, rebuildFatoPedidoHistorico } from "./fato-pedido-historico";

const baseRaw: Record<string, unknown> = {
  id: 100,
  pedido_id: [821, "PED-821"],
  etapa_id: [163, "Pedido - SIMPLES REMESSA"],
  etapa_tipo: "venda",
  data_ultima_etapa: "2026-01-10 08:00:00",
  data_proxima_etapa: "2026-01-15 08:00:00",
  tempo_etapa: 5,
  create_uid: [11, "joaozanini"],
  create_date: "2026-01-10 08:00:00",
};

describe("mapPedidoHistoricoRow", () => {
  it("mapeia FK, etapa, datas e tempo", () => {
    const r = mapPedidoHistoricoRow(baseRaw);
    expect(r.odooId).toBe(100);
    expect(r.pedidoId).toBe(821);
    expect(r.etapaId).toBe(163);
    expect(r.etapaNome).toBe("Pedido - SIMPLES REMESSA");
    expect(r.etapaTipo).toBe("venda");
    expect(r.dataEntrada).toEqual(new Date("2026-01-10T08:00:00"));
    expect(r.dataProxima).toEqual(new Date("2026-01-15T08:00:00"));
    expect(r.tempoEtapaDias).toBe(5);
    expect(r.usuarioId).toBe(11);
  });

  it("saneia tempo_etapa negativo para 0 (GREATEST)", () => {
    expect(mapPedidoHistoricoRow({ ...baseRaw, tempo_etapa: -1 }).tempoEtapaDias).toBe(0);
  });

  it("trata FK/data false como null e tempo ausente como 0", () => {
    const r = mapPedidoHistoricoRow({
      id: 2,
      pedido_id: false,
      etapa_id: false,
      data_ultima_etapa: false,
      tempo_etapa: false,
      create_uid: false,
    });
    expect(r.pedidoId).toBeNull();
    expect(r.etapaId).toBeNull();
    expect(r.dataEntrada).toBeNull();
    expect(r.tempoEtapaDias).toBe(0);
    expect(r.usuarioId).toBeNull();
  });

  it("nao inclui atualizadoEm (default no schema)", () => {
    expect("atualizadoEm" in mapPedidoHistoricoRow(baseRaw)).toBe(false);
  });
});

describe("rebuildFatoPedidoHistorico", () => {
  it("le raw, mapeia e popula em transacao + marca build", async () => {
    const mockTx = {
      fatoPedidoHistorico: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
      fatoBuildState: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const mockPrisma = {
      rawPedidoDocumentoHistorico: {
        findMany: jest.fn().mockResolvedValue([{ data: baseRaw }]),
      },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
    } as unknown as Parameters<typeof rebuildFatoPedidoHistorico>[0];

    const count = await rebuildFatoPedidoHistorico(mockPrisma);
    expect(count).toBe(1);
    expect(mockTx.fatoPedidoHistorico.createMany).toHaveBeenCalledTimes(1);
    expect(mockTx.fatoBuildState.upsert).toHaveBeenCalled();
  });
});
