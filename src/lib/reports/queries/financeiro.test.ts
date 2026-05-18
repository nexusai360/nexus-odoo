// src/lib/reports/queries/financeiro.test.ts
// Testes do núcleo de query de financeiro.

import {
  querySaldoContas,
  queryCaixaPeriodo,
  queryFluxoCaixa,
  queryContasAReceber,
  queryContasAPagar,
  queryTitulosVencidos,
} from "./financeiro.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    fatoFinanceiroSaldo: { findMany: jest.fn() },
    fatoFinanceiroMovimento: { findMany: jest.fn() },
    fatoFinanceiroTitulo: { findMany: jest.fn() },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// querySaldoContas — task 4d.1-q
// ---------------------------------------------------------------------------

describe("querySaldoContas", () => {
  it("agrega saldo e retorna saldoTotal", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroSaldo.findMany as jest.Mock).mockResolvedValue([
      { bancoNome: "Itaú", tipo: "corrente", saldo: "1000.50" },
      { bancoNome: "Bradesco", tipo: "corrente", saldo: "500.25" },
    ]);
    const result = await querySaldoContas(prisma as never);
    expect(result.contas).toHaveLength(2);
    expect(result.contas[0]).toEqual({ bancoNome: "Itaú", tipo: "corrente", saldo: 1000.5 });
    expect(result.saldoTotal).toBeCloseTo(1500.75);
  });

  it("retorna lista vazia e saldoTotal 0 quando não há contas", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroSaldo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await querySaldoContas(prisma as never);
    expect(result.contas).toHaveLength(0);
    expect(result.saldoTotal).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// queryCaixaPeriodo — task 4d.2-q
// ---------------------------------------------------------------------------

describe("queryCaixaPeriodo", () => {
  it("soma entrada e saida realizados e calcula saldo", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([
      { entrada: "1000", saida: "400" },
      { entrada: "500", saida: "200" },
    ]);
    const result = await queryCaixaPeriodo(prisma as never, {});
    expect(result.entrada).toBe(1500);
    expect(result.saida).toBe(600);
    expect(result.saldo).toBe(900);
  });

  it("passa filtro de data quando periodoDe e periodoAte fornecidos", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([]);
    await queryCaixaPeriodo(prisma as never, { periodoDe: "2026-01-01", periodoAte: "2026-01-31" });
    const call = (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ data: { gte: expect.any(Date), lte: expect.any(Date) } });
  });

  it("não passa filtro de data quando filtros ausentes", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([]);
    await queryCaixaPeriodo(prisma as never, {});
    const call = (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// queryFluxoCaixa — task 4d.3-q
// ---------------------------------------------------------------------------

describe("queryFluxoCaixa", () => {
  it("agrupa por mês YYYY-MM e ordena a série", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([
      { data: new Date("2026-03-15"), valor: "300", valorPrevisto: "400" },
      { data: new Date("2026-01-10"), valor: "100", valorPrevisto: "150" },
      { data: new Date("2026-01-20"), valor: "200", valorPrevisto: "250" },
    ]);
    const result = await queryFluxoCaixa(prisma as never, {});
    expect(result.serie).toHaveLength(2);
    expect(result.serie[0]).toEqual({ periodo: "2026-01", realizado: 300, previsto: 400 });
    expect(result.serie[1]).toEqual({ periodo: "2026-03", realizado: 300, previsto: 400 });
  });

  it("ignora linhas sem data", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([
      { data: null, valor: "100", valorPrevisto: "100" },
    ]);
    const result = await queryFluxoCaixa(prisma as never, {});
    expect(result.serie).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// queryContasAReceber — task 4d.5-q
// ---------------------------------------------------------------------------

describe("queryContasAReceber", () => {
  const hoje = new Date("2026-05-18");

  it("filtra tipo='a_receber' e dataPagamento=null", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAReceber(prisma as never, {}, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ tipo: "a_receber", dataPagamento: null });
  });

  it("calcula diasAtraso por linha e totalAReceber", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Empresa A", numeroDocumento: "NF-001", dataVencimento: new Date("2026-05-10"), vrSaldo: "500.00" },
      { participanteNome: "Empresa B", numeroDocumento: "NF-002", dataVencimento: null, vrSaldo: "300.00" },
    ]);
    const result = await queryContasAReceber(prisma as never, {}, hoje);
    expect(result.titulos[0].diasAtraso).toBe(8); // 18 - 10 = 8 dias
    expect(result.titulos[1].diasAtraso).toBe(0); // null → 0
    expect(result.totalAReceber).toBeCloseTo(800);
  });

  it("aplica filtro participanteId quando fornecido", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAReceber(prisma as never, { participanteId: 42 }, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ participanteId: 42 });
  });
});

// ---------------------------------------------------------------------------
// queryContasAPagar — task 4d.6-q
// ---------------------------------------------------------------------------

describe("queryContasAPagar", () => {
  const hoje = new Date("2026-05-18");

  it("filtra tipo='a_pagar' e dataPagamento=null", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAPagar(prisma as never, {}, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ tipo: "a_pagar", dataPagamento: null });
  });

  it("calcula diasAtraso e totalAPagar", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Fornecedor X", numeroDocumento: "BOL-001", dataVencimento: new Date("2026-05-15"), vrSaldo: "1000.00" },
    ]);
    const result = await queryContasAPagar(prisma as never, {}, hoje);
    expect(result.titulos[0].diasAtraso).toBe(3);
    expect(result.totalAPagar).toBeCloseTo(1000);
  });
});

// ---------------------------------------------------------------------------
// queryTitulosVencidos — task 4d.7-q
// ---------------------------------------------------------------------------

describe("queryTitulosVencidos", () => {
  const hoje = new Date("2026-05-18");

  it("filtra dataVencimento < hoje e dataPagamento=null", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryTitulosVencidos(prisma as never, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ dataVencimento: { lt: hoje }, dataPagamento: null });
  });

  it("inclui tipo no resultado e calcula diasAtraso e totalVencido", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { tipo: "a_receber", participanteNome: "Cliente Z", numeroDocumento: "NF-100", dataVencimento: new Date("2026-04-01"), vrSaldo: "2000.00" },
      { tipo: "a_pagar", participanteNome: "Forn Y", numeroDocumento: "BOL-200", dataVencimento: new Date("2026-05-01"), vrSaldo: "800.00" },
    ]);
    const result = await queryTitulosVencidos(prisma as never, hoje);
    expect(result.titulos).toHaveLength(2);
    expect(result.titulos[0].tipo).toBe("a_receber");
    expect(result.titulos[0].diasAtraso).toBe(47); // 18 mai - 1 abr = 47 dias
    expect(result.totalVencido).toBeCloseTo(2800);
  });
});
