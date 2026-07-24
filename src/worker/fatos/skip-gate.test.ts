import {
  algumInsumoMudou,
  algumPaiMaisNovo,
  builderDeveRodar,
  INSUMOS_BUILDER,
  type SkipGateClient,
} from "./skip-gate";

function clientQueSuja(sujo: boolean) {
  const queryRawUnsafe = jest.fn().mockResolvedValue([{ sujo }]);
  return {
    client: { $queryRawUnsafe: queryRawUnsafe } as unknown as SkipGateClient,
    queryRawUnsafe,
  };
}

describe("algumInsumoMudou", () => {
  it("monta um OR de EXISTS por raw e passa a data como parâmetro", async () => {
    const { client, queryRawUnsafe } = clientQueSuja(true);
    const desde = new Date("2026-07-23T00:00:00Z");
    const r = await algumInsumoMudou(client, ["raw_a", "raw_b"], desde);
    expect(r).toBe(true);
    const [sql, param] = queryRawUnsafe.mock.calls[0];
    expect(sql).toContain("EXISTS(SELECT 1 FROM raw_a WHERE synced_at > $1)");
    expect(sql).toContain("EXISTS(SELECT 1 FROM raw_b WHERE synced_at > $1)");
    expect(sql).toContain(" OR ");
    expect(param).toBe(desde);
  });

  it("retorna false quando nenhuma raw mudou", async () => {
    const { client } = clientQueSuja(false);
    expect(await algumInsumoMudou(client, ["raw_a"], new Date())).toBe(false);
  });

  it("fail-safe: lista sem nome de raw válido => true, sem tocar o banco", async () => {
    const { client, queryRawUnsafe } = clientQueSuja(false);
    // "produtos; DROP" nao casa /^raw_[a-z0-9_]+$/ => filtrado
    expect(await algumInsumoMudou(client, ["produtos; DROP TABLE x"], new Date())).toBe(true);
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("builderDeveRodar", () => {
  const base = {
    mapaBuildAt: new Map<string, Date>(),
    forcarTudo: false,
  };

  it("forcarTudo => sempre roda (não consulta o banco)", async () => {
    const { client, queryRawUnsafe } = clientQueSuja(false);
    const r = await builderDeveRodar({
      ...base, client, nome: "fato_pedido_item",
      ultimoBuildAt: new Date(), forcarTudo: true,
    });
    expect(r).toBe(true);
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("fato não mapeado => sempre roda", async () => {
    const { client } = clientQueSuja(false);
    expect(await builderDeveRodar({
      ...base, client, nome: "fato_inexistente", ultimoBuildAt: new Date(),
    })).toBe(true);
  });

  it("nunca buildado (ultimoBuildAt null) => roda", async () => {
    const { client } = clientQueSuja(false);
    expect(await builderDeveRodar({
      ...base, client, nome: "fato_pedido_item", ultimoBuildAt: null,
    })).toBe(true);
  });

  it("pai (dependsOn) mais novo que o filho => roda", async () => {
    const { client, queryRawUnsafe } = clientQueSuja(false);
    const meuBuild = new Date("2026-07-23T10:00:00Z");
    const paiBuild = new Date("2026-07-23T10:05:00Z"); // fato_produto mais novo
    const mapa = new Map<string, Date>([["fato_produto", paiBuild]]);
    const r = await builderDeveRodar({
      client, nome: "fato_pedido_item", ultimoBuildAt: meuBuild,
      mapaBuildAt: mapa, forcarTudo: false,
    });
    expect(r).toBe(true);
    // Decidiu pela dependência, nem chegou a consultar a raw.
    expect(queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("pai nunca buildado (ausente do mapa) => roda por segurança", async () => {
    const { client } = clientQueSuja(false);
    expect(await builderDeveRodar({
      client, nome: "fato_pedido_item", ultimoBuildAt: new Date(),
      mapaBuildAt: new Map(), forcarTudo: false,
    })).toBe(true);
  });

  it("pai mais velho que o filho E raw sem mudança => PULA (false)", async () => {
    const { client } = clientQueSuja(false);
    const meuBuild = new Date("2026-07-23T10:05:00Z");
    const paiBuild = new Date("2026-07-23T10:00:00Z"); // pai mais velho
    const mapa = new Map<string, Date>([["fato_produto", paiBuild]]);
    const r = await builderDeveRodar({
      client, nome: "fato_pedido_item", ultimoBuildAt: meuBuild,
      mapaBuildAt: mapa, forcarTudo: false,
    });
    expect(r).toBe(false);
  });

  it("raw mudou (synced_at novo) => roda", async () => {
    const { client } = clientQueSuja(true);
    const r = await builderDeveRodar({
      ...base, client, nome: "fato_nota_fiscal_item", ultimoBuildAt: new Date("2026-07-23T00:00:00Z"),
    });
    expect(r).toBe(true);
  });
});

describe("algumPaiMaisNovo (força full quando o pai mudou)", () => {
  const build = new Date("2026-07-23T10:00:00Z");

  it("sem dependsOn => false (nota_fiscal_item não tem pai)", () => {
    expect(algumPaiMaisNovo("fato_nota_fiscal_item", build, new Map())).toBe(false);
  });

  it("pai mais novo que o filho => true (força full)", () => {
    const mapa = new Map([["fato_produto", new Date("2026-07-23T10:05:00Z")]]);
    expect(algumPaiMaisNovo("fato_pedido_item", build, mapa)).toBe(true);
  });

  it("pai mais velho => false (pode incremental)", () => {
    const mapa = new Map([["fato_produto", new Date("2026-07-23T09:00:00Z")]]);
    expect(algumPaiMaisNovo("fato_pedido_item", build, mapa)).toBe(false);
  });

  it("pai ausente do mapa => true (segurança)", () => {
    expect(algumPaiMaisNovo("fato_pedido_item", build, new Map())).toBe(true);
  });

  it("ultimoBuildAt null com dependsOn => true", () => {
    expect(algumPaiMaisNovo("fato_pedido_item", null, new Map())).toBe(true);
  });

  it("fato_nota_fiscal depende de fato_parceiro (furo corrigido)", () => {
    const mapa = new Map([["fato_parceiro", new Date("2026-07-23T10:05:00Z")]]);
    expect(algumPaiMaisNovo("fato_nota_fiscal", build, mapa)).toBe(true);
  });
});

describe("INSUMOS_BUILDER (sanidade do mapa)", () => {
  it("todo rawSource segue o padrão físico raw_*", () => {
    for (const [fato, insumo] of Object.entries(INSUMOS_BUILDER)) {
      expect(insumo.rawSources.length).toBeGreaterThan(0);
      for (const raw of insumo.rawSources) {
        expect(raw).toMatch(/^raw_[a-z0-9_]+$/);
      }
      // dependsOn, quando existe, aponta para nomes de fato_*
      for (const dep of insumo.dependsOn ?? []) {
        expect(dep).toMatch(/^fato_[a-z0-9_]+$/);
        expect(dep).not.toBe(fato); // sem auto-dependência
      }
    }
  });
});
