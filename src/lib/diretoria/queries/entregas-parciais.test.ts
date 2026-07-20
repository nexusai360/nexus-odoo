import { mapaCorEtapa, queryEntregasParciais } from "./entregas-parciais";

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
  produtos: { odooId: number; precoCusto: number }[];
  parceiros: { odooId: number; uf: string | null; cidade: string | null }[];
  jobOk?: boolean;
  titulosVencidos?: { participanteId: number | null; participanteNome: string | null }[];
  formasPagamento?: { pedidoId: number | null; formaPagamentoNome: string | null }[];
  etapasRaw?: { odooId: number; data: unknown }[];
}) {
  const rawPedidoEtapaFindMany = jest.fn().mockResolvedValue(opts.etapasRaw ?? []);
  return {
    __rawPedidoEtapaFindMany: rawPedidoEtapaFindMany,
    rawPedidoEtapa: { findMany: rawPedidoEtapaFindMany },
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
        // carregarParticipantesGrupo pede documentoDigits; a query do relatório pede uf/cidade.
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
