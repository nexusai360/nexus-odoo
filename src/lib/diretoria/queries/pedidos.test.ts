import {
  queryDemandasPorUf,
  queryIndicadoresDemandas,
  queryDemandasPendentes,
  queryDemandaPorEtapa,
  queryDemandasMaisParadas,
} from "./pedidos";

/** Piso da demanda a entregar: ela nao e cortada pelo corte de leitura (D8/RF-A5). */
const PISO_DEMANDA = "2000-01-01";

type PedidoMock = {
  odooId: number;
  numero: string | null;
  participanteId: number | null;
  participanteNome: string | null;
  etapaId: number | null;
  etapaNome: string | null;
  dataPrevista: Date | null;
  dataAprovacao: Date | null;
  dataOrcamento: Date | null;
  vrProdutos: number;
};

function makePrisma(
  pedidos: Partial<PedidoMock>[],
  parceiros: { odooId: number; uf: string | null }[],
  historico: { pedidoId: number | null; etapaId: number | null; dataEntrada: Date | null }[] = [],
) {
  return {
    fatoPedido: { findMany: jest.fn().mockResolvedValue(pedidos) },
    fatoParceiro: { findMany: jest.fn().mockResolvedValue(parceiros) },
    fatoPedidoHistorico: { findMany: jest.fn().mockResolvedValue(historico) },
    // Sem o marcador, as consultas caem no valor cheio , e os testes abaixo comparam
    // justamente contra o vr_produtos do cabecalho, que e a base cheia.
    fatoBuildState: { findUnique: jest.fn().mockResolvedValue(null) },
    // Um item por pedido, com custo unitario 1: assim o valor a atender de cada pedido
    // cai exatamente no `vrProdutos` que os testes abaixo ja esperavam, e eles seguem
    // medindo o que sempre mediram (agrupamento por UF, etapa, prazo), sem virar teste
    // de aritmetica de custo , isso e testado a parte.
    fatoPedidoItem: {
      findMany: jest.fn().mockResolvedValue(
        pedidos.map((p) => ({
          pedidoId: p.odooId,
          produtoId: 1,
          quantidade: p.vrProdutos ?? 0,
          quantidadeAAtender: null,
          vrProdutos: p.vrProdutos ?? 0,
        })),
      ),
    },
    fatoProduto: {
      findMany: jest.fn().mockResolvedValue([{ odooId: 1, precoCusto: 1 }]),
    },
  } as unknown as Parameters<typeof queryDemandasPorUf>[0];
}

const hoje = new Date("2026-06-28");

const pedidos: Partial<PedidoMock>[] = [
  { odooId: 10, numero: "P1", participanteId: 1, participanteNome: "A", etapaId: 5, etapaNome: "Separação", dataPrevista: new Date("2026-06-20"), dataAprovacao: new Date("2026-06-01"), dataOrcamento: new Date("2026-05-20"), vrProdutos: 100 },
  { odooId: 20, numero: "P2", participanteId: 2, participanteNome: "B", etapaId: 3, etapaNome: "Aprovado", dataPrevista: new Date("2026-07-10"), dataAprovacao: new Date("2026-06-25"), dataOrcamento: new Date("2026-06-10"), vrProdutos: 300 },
  { odooId: 30, numero: "P3", participanteId: 1, participanteNome: "C", etapaId: 5, etapaNome: "Separação", dataPrevista: null, dataAprovacao: null, dataOrcamento: new Date("2026-06-15"), vrProdutos: 50 },
];
const parceiros = [
  { odooId: 1, uf: "São Paulo (BR)" },
  { odooId: 2, uf: "Minas Gerais (BR)" },
];

describe("queryDemandasPorUf (B4)", () => {
  it("agrupa demanda em aberta por UF (sigla)", async () => {
    const r = await queryDemandasPorUf(makePrisma(pedidos, parceiros), {});
    expect(r.valorGeral).toBe(450);
    expect(r.linhas[0]).toEqual({ uf: "MG", quantidade: 1, valorTotal: 300 });
    expect(r.linhas[1]).toEqual({ uf: "SP", quantidade: 2, valorTotal: 150 });
  });
  it("respeita UF-scoping", async () => {
    const r = await queryDemandasPorUf(makePrisma(pedidos, parceiros), { ufs: ["SP"] });
    expect(r.linhas).toEqual([{ uf: "SP", quantidade: 2, valorTotal: 150 }]);
  });
  it("filtra apenas demanda em aberta (bucketDemanda='ABERTA') no where", async () => {
    const p = makePrisma([], []);
    await queryDemandasPorUf(p, {});
    expect((p.fatoPedido.findMany as jest.Mock).mock.calls[0][0].where.bucketDemanda).toBe("ABERTA");
  });
});

describe("queryIndicadoresDemandas (B6)", () => {
  it("conta demanda em aberta, valor a entregar e atrasadas", async () => {
    const r = await queryIndicadoresDemandas(makePrisma(pedidos, parceiros), hoje);
    expect(r.totalPendentes).toBe(3);
    expect(r.valorAEntregar).toBe(450);
    expect(r.atrasadas).toBe(1); // só P1 (prevista 06-20 < hoje)
  });
  it("respeita UF-scoping nos indicadores", async () => {
    const r = await queryIndicadoresDemandas(makePrisma(pedidos, parceiros), hoje, { ufs: ["MG"] });
    expect(r.totalPendentes).toBe(1);
    expect(r.valorAEntregar).toBe(300);
    expect(r.atrasadas).toBe(0);
  });
});

describe("queryDemandasPendentes (B2)", () => {
  it("lista demanda em aberta com uf, prazo e flag de atraso", async () => {
    const r = await queryDemandasPendentes(makePrisma(pedidos, parceiros), hoje, {});
    expect(r.linhas[0]).toEqual({
      numero: "P2",
      cliente: "B",
      uf: "MG",
      etapa: "Aprovado",
      dataPrevista: "2026-07-10",
      valor: 300,
      atrasado: false,
    });
    const p1 = r.linhas.find((l) => l.numero === "P1");
    expect(p1?.atrasado).toBe(true);
  });
});

describe("queryDemandaPorEtapa (B6b)", () => {
  it("agrupa a demanda em aberta por etapa com qtd e valor", async () => {
    const r = await queryDemandaPorEtapa(makePrisma(pedidos, parceiros), {});
    expect(r.total).toBe(3);
    expect(r.valorGeral).toBe(450);
    // Separação: P1(100)+P3(50)=150 (qtd 2); Aprovado: 300 (qtd 1). Ordena por valor desc.
    expect(r.linhas[0]).toEqual({ etapaNome: "Aprovado", quantidade: 1, valorTotal: 300 });
    expect(r.linhas[1]).toEqual({ etapaNome: "Separação", quantidade: 2, valorTotal: 150 });
  });
  it("respeita UF-scoping", async () => {
    const r = await queryDemandaPorEtapa(makePrisma(pedidos, parceiros), { ufs: ["SP"] });
    expect(r.linhas).toEqual([{ etapaNome: "Separação", quantidade: 2, valorTotal: 150 }]);
    expect(r.total).toBe(2);
  });
});

describe("queryDemandasMaisParadas (B7)", () => {
  const historico = [
    // P1 (etapaId 5) entrou na etapa atual em 2026-06-10
    { pedidoId: 10, etapaId: 4, dataEntrada: new Date("2026-05-01") },
    { pedidoId: 10, etapaId: 5, dataEntrada: new Date("2026-06-10") },
    // P2 (etapaId 3) entrou na etapa atual em 2026-06-25
    { pedidoId: 20, etapaId: 3, dataEntrada: new Date("2026-06-25") },
    // P3 sem histórico -> fallback dataAprovacao(null) -> dataOrcamento 2026-06-15
  ];
  it("calcula dias parado (entrada na etapa atual, fallback aprovação/orçamento) e ordena desc", async () => {
    const r = await queryDemandasMaisParadas(makePrisma(pedidos, parceiros, historico), hoje, {});
    // hoje=06-28. P1: 06-10 -> 18d; P3: 06-15 (fallback orçamento) -> 13d; P2: 06-25 -> 3d.
    expect(r.linhas.map((l) => l.numero)).toEqual(["P1", "P3", "P2"]);
    expect(r.linhas[0]).toMatchObject({ numero: "P1", diasParado: 18, etapa: "Separação", uf: "SP", valor: 100 });
    expect(r.linhas[1]).toMatchObject({ numero: "P3", diasParado: 13 });
    expect(r.linhas[2]).toMatchObject({ numero: "P2", diasParado: 3 });
  });
  it("respeita limite e UF-scoping", async () => {
    const r = await queryDemandasMaisParadas(makePrisma(pedidos, parceiros, historico), hoje, { ufs: ["SP"], limite: 1 });
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].numero).toBe("P1");
  });
});

// Recorte por empresa do grupo. Como todo o módulo sai de carregarAbertas, o filtro
// aplicado lá vale para as 5 consultas da tela (e para o mapa da visão geral).
describe("recorte por empresa na demanda em aberta", () => {
  const whereDe = (p: ReturnType<typeof makePrisma>) =>
    (p.fatoPedido.findMany as jest.Mock).mock.calls[0][0].where;

  it("sem empresa, não filtra empresa (grupo inteiro)", async () => {
    const p = makePrisma([], []);
    await queryDemandasPorUf(p, {});
    expect(whereDe(p).empresaId).toBeUndefined();
    expect("empresaId" in whereDe(p)).toBe(false);
  });

  it("com empresa, filtra fato_pedido pela empresa escolhida", async () => {
    const p = makePrisma([], []);
    await queryDemandasPorUf(p, { empresaId: 7 });
    expect(whereDe(p).empresaId).toBe(7);
  });

  it("o recorte por empresa vale para as demais consultas do módulo (B2, B6, B6b, B7)", async () => {
    for (const roda of [
      (p: ReturnType<typeof makePrisma>) => queryIndicadoresDemandas(p, hoje, { empresaId: 7 }),
      (p: ReturnType<typeof makePrisma>) => queryDemandasPendentes(p, hoje, { empresaId: 7 }),
      (p: ReturnType<typeof makePrisma>) => queryDemandaPorEtapa(p, { empresaId: 7 }),
      (p: ReturnType<typeof makePrisma>) => queryDemandasMaisParadas(p, hoje, { empresaId: 7 }),
    ]) {
      const p = makePrisma([], []);
      await roda(p);
      expect(whereDe(p).empresaId).toBe(7);
    }
  });

  it("empresa e período convivem no mesmo where", async () => {
    const p = makePrisma([], []);
    await queryDemandasPorUf(p, {
      empresaId: 3,
      periodoDe: "2026-06-01",
      periodoAte: "2026-06-30",
    });
    expect(whereDe(p).empresaId).toBe(3);
    expect(whereDe(p).dataOrcamento.lt).toEqual(new Date("2026-07-01T00:00:00Z"));
    expect(whereDe(p).bucketDemanda).toBe("ABERTA");
  });
});

// Pedido é documento com data, mas a DEMANDA A ENTREGAR não é cortada pelo corte de leitura
// (D8/RF-A5): a janela vem só da pílula. TUDO no módulo sai de carregarAbertas, então o piso
// (2000, "abre tudo") é verificado ali, uma vez, para as 5 queries.
describe("janela da demanda em aberta segue a pílula, não o corte de leitura", () => {
  const whereDe = (p: ReturnType<typeof makePrisma>) =>
    (p.fatoPedido.findMany as jest.Mock).mock.calls[0][0].where;

  it("sem período, a demanda abre no piso 2000 (não no corte de leitura)", async () => {
    const p = makePrisma([], []);
    await queryDemandasPorUf(p, {});
    expect(whereDe(p).bucketDemanda).toBe("ABERTA");
    expect(whereDe(p).dataOrcamento.gte.toISOString().slice(0, 10)).toBe(PISO_DEMANDA);
  });

  it("carregarAbertas usa a janela de demanda (piso 2000) via queryIndicadoresDemandas", async () => {
    const p = makePrisma([], []);
    await queryIndicadoresDemandas(p, hoje, {});
    expect(whereDe(p).dataOrcamento.gte.toISOString().slice(0, 10)).toBe(PISO_DEMANDA);
  });

  it("período informado antes do corte NÃO é grampeado (recorta exato)", async () => {
    const p = makePrisma([], []);
    await queryIndicadoresDemandas(p, hoje, { periodoDe: "2024-05-01", periodoAte: "2026-06-30" });
    expect(whereDe(p).dataOrcamento.gte).toEqual(new Date("2024-05-01T00:00:00Z"));
    expect(whereDe(p).dataOrcamento.lt).toEqual(new Date("2026-07-01T00:00:00Z"));
  });

  it("o piso 2000 vale para as demais leituras do módulo (B2, B6b, B7)", async () => {
    for (const roda of [
      (p: ReturnType<typeof makePrisma>) => queryDemandasPendentes(p, hoje, {}),
      (p: ReturnType<typeof makePrisma>) => queryDemandaPorEtapa(p, {}),
      (p: ReturnType<typeof makePrisma>) => queryDemandasMaisParadas(p, hoje, {}),
    ]) {
      const p = makePrisma([], []);
      await roda(p);
      expect(whereDe(p).dataOrcamento.gte.toISOString().slice(0, 10)).toBe(PISO_DEMANDA);
    }
  });
});
