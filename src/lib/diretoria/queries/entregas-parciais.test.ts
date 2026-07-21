import {
  extrairObsPedido,
  isoData,
  mapaCorEtapa,
  precoUnitarioItem,
  queryEntregasParciais,
} from "./entregas-parciais";

const HOJE = new Date("2026-07-18T12:00:00");

type Pedido = {
  odooId: number;
  numero: string | null;
  participanteId: number | null;
  participanteNome: string | null;
  operacaoNome: string | null;
  modalidadeFrete?: string | null;
  numeroMercos?: string | null;
  etapaId?: number | null;
  etapaNome: string | null;
  vrProdutos: number;
  // Fase 3
  dataOrcamento?: Date | null;
  dataPrevista?: Date | null;
  dataValidade?: Date | null;
  empresaNome?: string | null;
  vendedorNome?: string | null;
};
type Item = {
  pedidoId: number;
  produtoId: number | null;
  produtoNome: string | null;
  familiaNome: string | null;
  marcaNome: string | null;
  quantidade: number;
  quantidadeAAtender: number | null;
  vrProdutos: number;
};

function makePrisma(opts: {
  pedidos: Pedido[];
  itens: Item[];
  produtos: { odooId: number; precoCusto: number; codigo?: string | null }[];
  parceiros: {
    odooId: number;
    uf: string | null;
    cidade: string | null;
    documento?: string | null;
    cep?: string | null;
  }[];
  jobOk?: boolean;
  titulosVencidos?: { participanteId: number | null; participanteNome: string | null }[];
  formasPagamento?: { pedidoId: number | null; formaPagamentoNome: string | null }[];
  etapasRaw?: { odooId: number; data: unknown }[];
  obsRaw?: { odooId: number; data: unknown }[];
}) {
  const rawPedidoEtapaFindMany = jest.fn().mockResolvedValue(opts.etapasRaw ?? []);
  const rawPedidoDocumentoFindMany = jest.fn().mockResolvedValue(opts.obsRaw ?? []);
  return {
    __rawPedidoEtapaFindMany: rawPedidoEtapaFindMany,
    __rawPedidoDocumentoFindMany: rawPedidoDocumentoFindMany,
    rawPedidoEtapa: { findMany: rawPedidoEtapaFindMany },
    rawPedidoDocumento: { findMany: rawPedidoDocumentoFindMany },
    fatoPedido: { findMany: jest.fn().mockResolvedValue(opts.pedidos) },
    fatoPedidoItem: { findMany: jest.fn().mockResolvedValue(opts.itens) },
    fatoProduto: { findMany: jest.fn().mockResolvedValue(opts.produtos) },
    fatoBuildState: {
      // O marcador de atendimento é aferido contra Date.now() com validade de 48h
      // (atendimento-status.ts). Para o teste ser determinístico (não depender de o relógio
      // real estar dentro de 48h de HOJE), o marcador "fresco" usa a data atual.
      findUnique: jest
        .fn()
        .mockResolvedValue(opts.jobOk ? { ultimoBuildAt: new Date() } : null),
    },
    fatoParceiro: {
      findMany: jest.fn().mockImplementation(({ select }: { select: Record<string, boolean> }) =>
        // carregarParticipantesGrupo pede documentoDigits; a query do relatório pede
        // uf/cidade/documento/cep (documentoDigits falsy => cai no ramo do relatório).
        select?.documentoDigits
          ? opts.parceiros.map((p) => ({ odooId: p.odooId, documentoDigits: null }))
          : opts.parceiros,
      ),
    },
    fatoFinanceiroTitulo: {
      findMany: jest.fn().mockResolvedValue(opts.titulosVencidos ?? []),
    },
    fatoPedidoParcela: {
      findMany: jest.fn().mockResolvedValue(opts.formasPagamento ?? []),
    },
  } as never;
}

describe("queryEntregasParciais", () => {
  it("uma linha por item com saldo a atender; KPIs reconciliam com a soma das linhas", async () => {
    const prisma = makePrisma({
      pedidos: [
        { odooId: 1, numero: "P1", participanteId: 5010, participanteNome: "Cliente A", operacaoNome: "Venda", etapaNome: "Sep", vrProdutos: 1000 },
        { odooId: 2, numero: "P2", participanteId: 5020, participanteNome: "Cliente B", operacaoNome: "Venda", etapaNome: "Sep", vrProdutos: 500 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "Esteira", familiaNome: "Cardio", marcaNome: "Matrix", quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000 },
        { pedidoId: 2, produtoId: 200, produtoNome: "Anilha", familiaNome: "Acess", marcaNome: "JHT", quantidade: 5, quantidadeAAtender: null, vrProdutos: 500 },
      ],
      produtos: [
        { odooId: 100, precoCusto: 40 },
        { odooId: 200, precoCusto: 20 },
      ],
      parceiros: [
        { odooId: 5010, uf: "São Paulo (BR)", cidade: "São Paulo" },
        { odooId: 5020, uf: "Bahia (BR)", cidade: "Salvador" },
      ],
    });

    const r = await queryEntregasParciais(prisma, HOJE);

    expect(r.linhas).toHaveLength(2);
    // job NÃO sincronizado (fatoBuildState null) => quantidade cheia.
    expect(r.indicadores.qtdPedidos).toBe(2);
    expect(r.indicadores.totalPedido).toBe(1500); // 1000 + 500 (header)
    expect(r.indicadores.aAtenderVenda).toBe(1500); // cheia a venda: 10*100 + 5*100
    expect(r.indicadores.aAtenderCusto).toBe(500); // 10*40 + 5*20
    // reconciliação algébrica: KPI custo == soma das linhas
    const somaLinhas = r.linhas.reduce((s, l) => s + l.valorCustoAAtender, 0);
    expect(r.indicadores.aAtenderCusto).toBe(somaLinhas);
    // colunas
    const l1 = r.linhas.find((l) => l.numero === "P1")!;
    expect(l1.uf).toBe("SP");
    expect(l1.cidade).toBe("São Paulo");
    expect(l1.marca).toBe("Matrix");
    expect(l1.operacao).toBe("Venda");
    expect(l1.statusFinanceiro).toBe("liberado");
  });

  it("traduz o código de modalidade de frete para rótulo, separado da operação", async () => {
    const prisma = makePrisma({
      pedidos: [
        { odooId: 1, numero: "P1", participanteId: 5010, participanteNome: "A", operacaoNome: "Venda", modalidadeFrete: "1", etapaNome: "Sep", vrProdutos: 1000 },
        { odooId: 2, numero: "P2", participanteId: 5020, participanteNome: "B", operacaoNome: "Venda", modalidadeFrete: null, etapaNome: "Sep", vrProdutos: 500 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "X", familiaNome: null, marcaNome: null, quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000 },
        { pedidoId: 2, produtoId: 100, produtoNome: "Y", familiaNome: null, marcaNome: null, quantidade: 5, quantidadeAAtender: null, vrProdutos: 500 },
      ],
      produtos: [{ odooId: 100, precoCusto: 40 }],
      parceiros: [
        { odooId: 5010, uf: "SP", cidade: "SP" },
        { odooId: 5020, uf: "SP", cidade: "SP" },
      ],
    });

    const r = await queryEntregasParciais(prisma, HOJE);
    const l1 = r.linhas.find((l) => l.numero === "P1")!;
    const l2 = r.linhas.find((l) => l.numero === "P2")!;
    expect(l1.modalidade).toBe("FOB (destinatario)");
    expect(l1.operacao).toBe("Venda"); // operação continua distinta da modalidade
    expect(l2.modalidade).toBe("Nao informada");
  });

  it("carrega o número do Mercos na linha", async () => {
    const prisma = makePrisma({
      pedidos: [
        { odooId: 1, numero: "P1", participanteId: 5010, participanteNome: "A", operacaoNome: "Venda", numeroMercos: "43203", etapaNome: "Sep", vrProdutos: 1000 },
        { odooId: 2, numero: "P2", participanteId: 5020, participanteNome: "B", operacaoNome: "Venda", numeroMercos: null, etapaNome: "Sep", vrProdutos: 500 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "X", familiaNome: null, marcaNome: null, quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000 },
        { pedidoId: 2, produtoId: 100, produtoNome: "Y", familiaNome: null, marcaNome: null, quantidade: 5, quantidadeAAtender: null, vrProdutos: 500 },
      ],
      produtos: [{ odooId: 100, precoCusto: 40 }],
      parceiros: [
        { odooId: 5010, uf: "SP", cidade: "SP" },
        { odooId: 5020, uf: "SP", cidade: "SP" },
      ],
    });

    const r = await queryEntregasParciais(prisma, HOJE);
    expect(r.linhas.find((l) => l.numero === "P1")!.numeroMercos).toBe("43203");
    expect(r.linhas.find((l) => l.numero === "P2")!.numeroMercos).toBeNull();
  });

  it("job sincronizado: item já entregue (a atender 0) some da tabela mas não some do total do pedido", async () => {
    const prisma = makePrisma({
      jobOk: true,
      pedidos: [
        { odooId: 1, numero: "P1", participanteId: 5010, participanteNome: "A", operacaoNome: "Venda", etapaNome: "Sep", vrProdutos: 1000 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "X", familiaNome: null, marcaNome: null, quantidade: 10, quantidadeAAtender: 0, vrProdutos: 1000 },
      ],
      produtos: [{ odooId: 100, precoCusto: 40 }],
      parceiros: [{ odooId: 5010, uf: "SP", cidade: "SP" }],
    });

    const r = await queryEntregasParciais(prisma, HOJE);
    expect(r.linhas).toHaveLength(0); // nada a entregar
    expect(r.indicadores.qtdPedidos).toBe(1); // mas o pedido conta
    expect(r.indicadores.totalPedido).toBe(1000);
    expect(r.indicadores.aAtenderCusto).toBe(0);
  });

  it("cliente com nota fiscal vencida fica bloqueado", async () => {
    const prisma = makePrisma({
      pedidos: [
        { odooId: 1, numero: "P1", participanteId: 5010, participanteNome: "Devedor", operacaoNome: "Venda", etapaNome: "Sep", vrProdutos: 1000 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "X", familiaNome: null, marcaNome: null, quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000 },
      ],
      produtos: [{ odooId: 100, precoCusto: 40 }],
      parceiros: [{ odooId: 5010, uf: "SP", cidade: "SP" }],
      titulosVencidos: [{ participanteId: 5010, participanteNome: "Devedor" }],
    });

    const r = await queryEntregasParciais(prisma, HOJE);
    expect(r.linhas[0].statusFinanceiro).toBe("bloqueado");
  });

  it("forma de pagamento vem da parcela do pedido", async () => {
    const prisma = makePrisma({
      pedidos: [
        { odooId: 1, numero: "P1", participanteId: 5010, participanteNome: "A", operacaoNome: "Venda", etapaNome: "Sep", vrProdutos: 1000 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "X", familiaNome: null, marcaNome: null, quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000 },
      ],
      produtos: [{ odooId: 100, precoCusto: 40 }],
      parceiros: [{ odooId: 5010, uf: "SP", cidade: "SP" }],
      formasPagamento: [{ pedidoId: 1, formaPagamentoNome: "Boleto" }],
    });

    const r = await queryEntregasParciais(prisma, HOJE);
    expect(r.linhas[0].formaPagamento).toBe("Boleto");
  });

  it("RF-A5: usa a janela de demanda (piso 2000), não o corte de leitura", async () => {
    const prisma = makePrisma({ pedidos: [], itens: [], produtos: [], parceiros: [] });
    await queryEntregasParciais(prisma, HOJE, {});
    const where = (prisma as unknown as { fatoPedido: { findMany: jest.Mock } }).fatoPedido
      .findMany.mock.calls[0][0].where;
    expect(where.dataOrcamento.gte.toISOString().slice(0, 10)).toBe("2000-01-01");
  });

  it("RF-A8: repassa o filtro de empresa ao where (recorta B-08/B-09)", async () => {
    const prisma = makePrisma({ pedidos: [], itens: [], produtos: [], parceiros: [] });
    await queryEntregasParciais(prisma, HOJE, { empresaId: 1 });
    const where = (prisma as unknown as { fatoPedido: { findMany: jest.Mock } }).fatoPedido
      .findMany.mock.calls[0][0].where;
    expect(where.empresaId).toBe(1);
  });

  it("RF-A9: empresa sem entregas => indicadores zerados e linhas vazias (estado vazio representável)", async () => {
    const prisma = makePrisma({ pedidos: [], itens: [], produtos: [], parceiros: [] });
    const data = await queryEntregasParciais(prisma, HOJE, { empresaId: 999 });
    expect(data.linhas).toHaveLength(0);
    expect(data.indicadores.qtdPedidos).toBe(0);
    expect(data.indicadores.aAtenderCusto).toBe(0);
  });

  it("escopo de UF remove pedidos de estados fora do filtro", async () => {
    const prisma = makePrisma({
      pedidos: [
        { odooId: 1, numero: "P1", participanteId: 5010, participanteNome: "A", operacaoNome: "Venda", etapaNome: "Sep", vrProdutos: 1000 },
        { odooId: 2, numero: "P2", participanteId: 5020, participanteNome: "B", operacaoNome: "Venda", etapaNome: "Sep", vrProdutos: 500 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "X", familiaNome: null, marcaNome: null, quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000 },
        { pedidoId: 2, produtoId: 100, produtoNome: "Y", familiaNome: null, marcaNome: null, quantidade: 5, quantidadeAAtender: null, vrProdutos: 500 },
      ],
      produtos: [{ odooId: 100, precoCusto: 40 }],
      parceiros: [
        { odooId: 5010, uf: "SP", cidade: "SP" },
        { odooId: 5020, uf: "BA", cidade: "Salvador" },
      ],
    });

    const r = await queryEntregasParciais(prisma, HOJE, { ufs: ["SP"] });
    expect(r.indicadores.qtdPedidos).toBe(1);
    expect(r.linhas.every((l) => l.uf === "SP")).toBe(true);
  });

  it("Fase 2: devolve etapaCor (hex do Odoo) e o nome da etapa formatado na linha", async () => {
    const prisma = makePrisma({
      pedidos: [
        { odooId: 1, numero: "P1", participanteId: 5010, participanteNome: "A", operacaoNome: "Venda", etapaId: 42, etapaNome: "GERA BOLETO", vrProdutos: 1000 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "X", familiaNome: null, marcaNome: null, quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000 },
      ],
      produtos: [{ odooId: 100, precoCusto: 40 }],
      parceiros: [{ odooId: 5010, uf: "SP", cidade: "SP" }],
      etapasRaw: [{ odooId: 42, data: { cor: "#fa7e1e" } }],
    });

    const r = await queryEntregasParciais(prisma, HOJE);
    expect(r.linhas[0].etapaCor).toBe("#fa7e1e");
    expect(r.linhas[0].etapa).toBe("Gera Boleto"); // formatarNomeEtapa aplicado

    // A5: o lote em raw_pedido_etapa filtra registros vivos e usa só os etapa_id em uso.
    const where = (prisma as unknown as { __rawPedidoEtapaFindMany: jest.Mock })
      .__rawPedidoEtapaFindMany.mock.calls[0][0].where;
    expect(where.rawDeleted).toBe(false);
    expect(where.odooId.in).toEqual([42]);
  });

  it("Fase 2: etapa sem cor no Odoo (false) => etapaCor null (tag neutra)", async () => {
    const prisma = makePrisma({
      pedidos: [
        { odooId: 1, numero: "P1", participanteId: 5010, participanteNome: "A", operacaoNome: "Venda", etapaId: 7, etapaNome: "V.O - Aprovado", vrProdutos: 1000 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "X", familiaNome: null, marcaNome: null, quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000 },
      ],
      produtos: [{ odooId: 100, precoCusto: 40 }],
      parceiros: [{ odooId: 5010, uf: "SP", cidade: "SP" }],
      etapasRaw: [{ odooId: 7, data: { cor: false } }],
    });

    const r = await queryEntregasParciais(prisma, HOJE);
    expect(r.linhas[0].etapaCor).toBeNull();
    expect(r.linhas[0].etapa).toBe("V.O - Aprovado");
  });

  it("Fase 2: sem etapa_id não dispara o lote em raw_pedido_etapa (sem query desnecessária)", async () => {
    const prisma = makePrisma({
      pedidos: [
        { odooId: 1, numero: "P1", participanteId: 5010, participanteNome: "A", operacaoNome: "Venda", etapaNome: null, vrProdutos: 1000 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "X", familiaNome: null, marcaNome: null, quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000 },
      ],
      produtos: [{ odooId: 100, precoCusto: 40 }],
      parceiros: [{ odooId: 5010, uf: "SP", cidade: "SP" }],
    });

    const r = await queryEntregasParciais(prisma, HOJE);
    expect(r.linhas[0].etapaCor).toBeNull();
    expect(r.linhas[0].etapa).toBeNull(); // etapaNome null preserva null (UI cai no DASH)
    expect((prisma as unknown as { __rawPedidoEtapaFindMany: jest.Mock })
      .__rawPedidoEtapaFindMany).not.toHaveBeenCalled();
  });
});

describe("mapaCorEtapa", () => {
  it("mapeia etapa_id -> hex valido e trata false/ausente como null", () => {
    const m = mapaCorEtapa([
      { odooId: 4, data: { cor: "#fa7e1e" } },
      { odooId: 6, data: { cor: false } },
      { odooId: 9, data: {} },
    ]);
    expect(m.get(4)).toBe("#fa7e1e");
    expect(m.get(6)).toBeNull();
    expect(m.get(9)).toBeNull();
  });

  it("descarta hex invalido (vira null) e aceita data nulo", () => {
    const m = mapaCorEtapa([
      { odooId: 1, data: { cor: "laranja" } },
      { odooId: 2, data: null },
    ]);
    expect(m.get(1)).toBeNull();
    expect(m.get(2)).toBeNull();
  });

  it("mapa vazio para lista vazia", () => {
    expect(mapaCorEtapa([]).size).toBe(0);
  });
});

// --- Fase 3: helpers puros ---

describe("isoData", () => {
  it("formata Date em YYYY-MM-DD sem deslocar o dia (datas Odoo são meia-noite UTC)", () => {
    expect(isoData(new Date("2026-03-16T00:00:00.000Z"))).toBe("2026-03-16");
  });
  it("null/undefined => null", () => {
    expect(isoData(null)).toBeNull();
    expect(isoData(undefined)).toBeNull();
  });
});

describe("precoUnitarioItem", () => {
  it("valor cheio / quantidade", () => {
    expect(precoUnitarioItem(259112.2, 20)).toBeCloseTo(12955.61, 2);
  });
  it("quantidade fracionária", () => {
    expect(precoUnitarioItem(180, 24.93)).toBeCloseTo(7.2202, 3);
  });
  it("quantidade 0 ou negativa => 0 (sem divisão por zero)", () => {
    expect(precoUnitarioItem(100, 0)).toBe(0);
    expect(precoUnitarioItem(100, -1)).toBe(0);
  });
});

describe("extrairObsPedido", () => {
  it("lê obs e obs_produtos do jsonb", () => {
    expect(extrairObsPedido({ obs: "Inventário GPLOG", obs_produtos: "Entregar cedo" })).toEqual({
      obs: "Inventário GPLOG",
      obsEntrega: "Entregar cedo",
    });
  });
  it("false/vazio/não-string do Odoo => null", () => {
    expect(extrairObsPedido({ obs: false, obs_produtos: "   " })).toEqual({ obs: null, obsEntrega: null });
    expect(extrairObsPedido({ obs: 123 })).toEqual({ obs: null, obsEntrega: null });
    expect(extrairObsPedido(null)).toEqual({ obs: null, obsEntrega: null });
  });
});

describe("queryEntregasParciais , Fase 3 (colunas completas)", () => {
  it("materializa datas (ISO), emitente, vendedor, CNPJ, CEP, código, unitário, valor cheio e observações", async () => {
    const prisma = makePrisma({
      pedidos: [
        {
          odooId: 1,
          numero: "PV-1",
          participanteId: 5010,
          participanteNome: "Cliente A",
          operacaoNome: "Venda",
          etapaNome: "Sep",
          vrProdutos: 1000,
          dataOrcamento: new Date("2026-03-16T00:00:00.000Z"),
          dataPrevista: new Date("2026-04-01T00:00:00.000Z"),
          dataValidade: new Date("2026-03-20T00:00:00.000Z"),
          empresaNome: "Jds Comércio - Matriz DF 18.282.961/0001-00",
          vendedorNome: "Mariane Trindade - Mariane",
        },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "Esteira", familiaNome: "Cardio", marcaNome: "Matrix", quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000 },
      ],
      produtos: [{ odooId: 100, precoCusto: 40, codigo: "2396" }],
      parceiros: [{ odooId: 5010, uf: "São Paulo (BR)", cidade: "São Paulo", documento: "07.390.039/0001-01", cep: "72007-490" }],
      obsRaw: [{ odooId: 1, data: { obs: "Inventário GPLOG", obs_produtos: false } }],
    });

    const r = await queryEntregasParciais(prisma, HOJE);
    const l = r.linhas[0];
    expect(l.orcamento).toBe("2026-03-16");
    expect(l.prevista).toBe("2026-04-01");
    expect(l.validade).toBe("2026-03-20");
    expect(l.emitente).toBe("Jds Comércio - Matriz DF 18.282.961/0001-00"); // limpeza é na UI
    expect(l.vendedor).toBe("Mariane Trindade - Mariane"); // corte do login é na UI
    expect(l.cnpj).toBe("07.390.039/0001-01");
    expect(l.cep).toBe("72007-490");
    expect(l.codigoProduto).toBe("2396");
    expect(l.valorCheio).toBe(1000);
    expect(l.unitario).toBe(100); // 1000 / 10
    expect(l.observacoes).toBe("Inventário GPLOG");
    expect(l.obsEntrega).toBeNull(); // obs_produtos false => null
  });

  it("campos ausentes viram null (sem raw de obs, sem documento/cep/código)", async () => {
    const prisma = makePrisma({
      pedidos: [
        { odooId: 1, numero: "PV-1", participanteId: 5010, participanteNome: "A", operacaoNome: "Venda", etapaNome: "Sep", vrProdutos: 500 },
      ],
      itens: [
        { pedidoId: 1, produtoId: 100, produtoNome: "X", familiaNome: null, marcaNome: null, quantidade: 5, quantidadeAAtender: null, vrProdutos: 500 },
      ],
      produtos: [{ odooId: 100, precoCusto: 20 }],
      parceiros: [{ odooId: 5010, uf: "SP", cidade: "SP" }],
    });

    const r = await queryEntregasParciais(prisma, HOJE);
    const l = r.linhas[0];
    expect(l.orcamento).toBeNull();
    expect(l.emitente).toBeNull();
    expect(l.vendedor).toBeNull();
    expect(l.cnpj).toBeNull();
    expect(l.cep).toBeNull();
    expect(l.codigoProduto).toBeNull();
    expect(l.observacoes).toBeNull();
    expect(l.obsEntrega).toBeNull();
    expect(l.unitario).toBe(100); // 500 / 5
  });

  it("sem pedidos: não dispara o lote de observações no raw (guarda de ids vazios)", async () => {
    const prisma = makePrisma({ pedidos: [], itens: [], produtos: [], parceiros: [] });
    await queryEntregasParciais(prisma, HOJE);
    expect((prisma as unknown as { __rawPedidoDocumentoFindMany: jest.Mock })
      .__rawPedidoDocumentoFindMany).not.toHaveBeenCalled();
  });
});
