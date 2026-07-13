// src/lib/reports/queries/financeiro.test.ts
// Testes do núcleo de query de financeiro.

import { corteAtual, corteAtualDate } from "@/lib/corte-dados";
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
    fatoParceiro: { findMany: jest.fn().mockResolvedValue([]) },
      fatoFinanceiroTitulo: { findMany: jest.fn() },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// querySaldoContas , task 4d.1-q
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
// queryCaixaPeriodo , task 4d.2-q
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

  it("passa filtro de data quando periodoDe e periodoAte fornecidos (borda superior exclusiva)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([]);
    await queryCaixaPeriodo(prisma as never, { periodoDe: "2026-04-01", periodoAte: "2026-04-30" });
    const call = (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.data.gte).toEqual(new Date("2026-04-01T00:00:00Z"));
    // O dia "ate" entra inteiro: a borda e o dia seguinte, exclusiva.
    expect(call.where.data.lt).toEqual(new Date("2026-05-01T00:00:00Z"));
  });

  // Regra do corte: sem periodo, o piso e a data de inicio das analises , a consulta
  // NUNCA pode varrer o cache inteiro.
  it("aplica o piso do corte quando os filtros vêm vazios", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([]);
    await queryCaixaPeriodo(prisma as never, {});
    const call = (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.data.gte).toEqual(corteAtualDate());
  });

  it("grampeia periodoDe anterior ao corte", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([]);
    await queryCaixaPeriodo(prisma as never, { periodoDe: "2020-01-01", periodoAte: "2026-12-31" });
    const call = (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.data.gte).toEqual(corteAtualDate());
  });
});

// ---------------------------------------------------------------------------
// queryFluxoCaixa , task 4d.3-q
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

  // Regra do corte: a serie mensal e historico puro , sem periodo, comeca no corte.
  it("aplica o piso do corte quando os filtros vêm vazios", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([]);
    await queryFluxoCaixa(prisma as never, {});
    const call = (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.data.gte).toEqual(corteAtualDate());
  });

  it("grampeia periodoDe anterior ao corte", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mockResolvedValue([]);
    await queryFluxoCaixa(prisma as never, { periodoDe: "2019-05-01", periodoAte: "2026-06-30" });
    const call = (prisma.fatoFinanceiroMovimento.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.data.gte).toEqual(corteAtualDate());
    expect(call.where.data.lt).toEqual(new Date("2026-07-01T00:00:00Z"));
  });
});

// ---------------------------------------------------------------------------
// queryContasAReceber , task 4d.5-q
// ---------------------------------------------------------------------------

// A JANELA DE COBRANÇA (decisão do dono, 2026-07-12) é: vencido em aberto + vencendo até o
// FIM DO PERÍODO. Com isso, o teto sai do fim do período , e um período MAIOR nunca pode
// devolver um valor MENOR.
//
// Era exatamente o que acontecia (relatado pelo dono e reproduzido em produção): o preset
// "Tudo" definia o fim do período como HOJE, então "Tudo" virava "só o vencido" e mostrava
// MENOS que "este mês". Medido em prod, a receber: mês R$ 18,1 mi, ano R$ 56,8 mi,
// TUDO R$ 9,6 mi. Sem fim de período, não existe teto: é a carteira inteira em aberto.
describe("queryContasAReceber , janela de cobrança (o teto vem do fim do período)", () => {
  const hoje = new Date("2026-05-18");

  it("sem fim de período: NÃO há teto de vencimento (carteira inteira em aberto)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAReceber(prisma as never, {}, hoje);
    const where = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.dataVencimento).toBeUndefined();
  });

  it("com fim de período: o teto é o fim do período (borda exclusiva no dia seguinte)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAReceber(prisma as never, { periodoAte: "2026-07-31" }, hoje);
    const where = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.dataVencimento.lt).toEqual(new Date("2026-08-01T00:00:00Z"));
  });

  it("período maior nunca soma menos: o teto de julho <= o teto de dezembro <= sem teto", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAReceber(prisma as never, { periodoAte: "2026-07-31" }, hoje);
    await queryContasAReceber(prisma as never, { periodoAte: "2026-12-31" }, hoje);
    await queryContasAReceber(prisma as never, {}, hoje);
    const calls = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls;
    const julho = calls[0][0].where.dataVencimento.lt as Date;
    const dezembro = calls[1][0].where.dataVencimento.lt as Date;
    expect(julho.getTime()).toBeLessThan(dezembro.getTime());
    expect(calls[2][0].where.dataVencimento).toBeUndefined(); // sem teto = o maior de todos
  });
});

describe("queryContasAReceber", () => {
  const hoje = new Date("2026-05-18");

  it("filtra tipo='a_receber' e em aberto por vrSaldo>0 (inclui provisório, exclui quitado/baixado)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAReceber(prisma as never, {}, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ tipo: "a_receber", vrSaldo: { gt: 0 } });
    // Decisão 2026-06-11: NÃO filtra mais por situacaoSimples='aberto'.
    expect(call.where).not.toHaveProperty("situacaoSimples");
  });

  it("devolve quebra confirmado/provisório por situacaoSimples", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "A", numeroDocumento: "1", dataVencimento: null, vrSaldo: "100.00", vrTotal: "100.00", situacaoSimples: "aberto", notaFiscalId: 11, pedidoId: null, pedidoFaturado: false },
      { participanteNome: "B", numeroDocumento: "2", dataVencimento: null, vrSaldo: "30.00", vrTotal: "30.00", situacaoSimples: "provisorio", notaFiscalId: 12, pedidoId: null, pedidoFaturado: false },
    ]);
    const result = await queryContasAReceber(prisma as never, {}, hoje);
    expect(result.totalAReceber).toBeCloseTo(130);
    expect(result.quebra.confirmado).toBeCloseTo(100);
    expect(result.quebra.provisorio).toBeCloseTo(30);
    expect(result.titulos[1].situacaoSimples).toBe("provisorio");
  });

  it("NÃO usa dataPagamento como critério", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAReceber(prisma as never, {}, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).not.toHaveProperty("dataPagamento");
  });

  it("seleciona vrSaldo no findMany (fonte finan.lancamento , bug R1 corrigido)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAReceber(prisma as never, {}, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.select).toHaveProperty("vrSaldo", true);
  });

  it("calcula diasAtraso por linha e totalAReceber usando vrSaldo", async () => {
    const prisma = makePrisma();
    // Fixture no formato finan.lancamento: vrSaldo == vrDocumento quando aberto
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Empresa A", numeroDocumento: "NF-001", dataVencimento: new Date("2026-05-10"), vrSaldo: "9700.50", vrTotal: "9700.50", notaFiscalId: 11, pedidoId: null, pedidoFaturado: false },
      { participanteNome: "Empresa B", numeroDocumento: "NF-002", dataVencimento: null, vrSaldo: "5314.75", vrTotal: "5314.75", notaFiscalId: 12, pedidoId: null, pedidoFaturado: false },
    ]);
    const result = await queryContasAReceber(prisma as never, {}, hoje);
    expect(result.titulos[0].diasAtraso).toBe(8); // 18 - 10 = 8 dias
    expect(result.titulos[1].diasAtraso).toBe(0); // null → 0
    expect(result.titulos[0].vrSaldo).toBeCloseTo(9700.50);
    expect(result.titulos[0].vrTotal).toBeCloseTo(9700.50);
    // totalAReceber usa vrSaldo
    expect(result.totalAReceber).toBeCloseTo(15015.25);
  });


  // ─── Recebível x carteira (perícia de 2026-07-12) ──────────────────────────
  // O Odoo da Tauga gera o financeiro pelo PEDIDO ou pela NOTA. Somar os dois punha
  // R$ 30,9 mi de pedidos SEM nota emitida dentro do "A receber".

  it("pedido AINDA SEM nota emitida é carteira, não conta a receber", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Cliente X", numeroDocumento: "PV-1/26", dataVencimento: null, vrSaldo: "1000.00", vrTotal: "1000.00", situacaoSimples: "aberto", pedidoId: 500, notaFiscalId: null, pedidoFaturado: false },
    ]);
    const r = await queryContasAReceber(prisma as never, {}, hoje);
    expect(r.totalAReceber).toBe(0);
    expect(r.carteiraAFaturar).toBeCloseTo(1000);
    expect(r.titulosCarteira).toHaveLength(1);
    expect(r.titulos).toHaveLength(0);
  });

  it("título de pedido JÁ faturado é recebível (modo financeiro pelo pedido, sem duplicata)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Cliente Y", numeroDocumento: "PV-2/26", dataVencimento: null, vrSaldo: "2000.00", vrTotal: "2000.00", situacaoSimples: "aberto", pedidoId: 600, notaFiscalId: null, pedidoFaturado: true },
    ]);
    const r = await queryContasAReceber(prisma as never, {}, hoje);
    expect(r.totalAReceber).toBeCloseTo(2000);
    expect(r.carteiraAFaturar).toBe(0);
  });

  it("pedido com duplicata de NF: conta UMA vez (a duplicata manda, o título do pedido sai)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      // Mesmo pedido, os dois títulos abertos: era dupla contagem (R$ 547 mil no cache real).
      { participanteNome: "Cliente Z", numeroDocumento: "1-99/1", dataVencimento: null, vrSaldo: "5000.00", vrTotal: "5000.00", situacaoSimples: "aberto", pedidoId: 700, notaFiscalId: 90, pedidoFaturado: true },
      { participanteNome: "Cliente Z", numeroDocumento: "PV-3/26", dataVencimento: null, vrSaldo: "5000.00", vrTotal: "5000.00", situacaoSimples: "aberto", pedidoId: 700, notaFiscalId: null, pedidoFaturado: true },
    ]);
    const r = await queryContasAReceber(prisma as never, {}, hoje);
    expect(r.totalAReceber).toBeCloseTo(5000);
    expect(r.titulos).toHaveLength(1);
    expect(r.carteiraAFaturar).toBe(0);
  });

  it("título quitado não aparece (banco não devolve , filtro situacaoSimples='aberto')", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await queryContasAReceber(prisma as never, {}, hoje);
    expect(result.titulos).toHaveLength(0);
    expect(result.totalAReceber).toBe(0);
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
// queryContasAPagar , task 4d.6-q
// ---------------------------------------------------------------------------

describe("queryContasAPagar", () => {
  const hoje = new Date("2026-05-18");

  it("filtra tipo='a_pagar' e em aberto por vrSaldo>0 (inclui provisório , a maior parte da dívida)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAPagar(prisma as never, {}, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toMatchObject({ tipo: "a_pagar", vrSaldo: { gt: 0 } });
    expect(call.where).not.toHaveProperty("situacaoSimples");
  });

  it("devolve quebra confirmado/provisório (provisório domina no a_pagar)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Efetivo", numeroDocumento: "1", dataVencimento: null, vrSaldo: "20.00", vrTotal: "20.00", situacaoSimples: "aberto" },
      { participanteNome: "Johnson", numeroDocumento: "2", dataVencimento: null, vrSaldo: "373.00", vrTotal: "373.00", situacaoSimples: "provisorio" },
    ]);
    const result = await queryContasAPagar(prisma as never, {}, hoje);
    expect(result.totalAPagar).toBeCloseTo(393);
    expect(result.quebra.confirmado).toBeCloseTo(20);
    expect(result.quebra.provisorio).toBeCloseTo(373);
  });

  it("NÃO usa dataPagamento como critério", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAPagar(prisma as never, {}, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).not.toHaveProperty("dataPagamento");
  });

  it("seleciona vrSaldo no findMany (fonte finan.lancamento , bug R1 corrigido)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryContasAPagar(prisma as never, {}, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.select).toHaveProperty("vrSaldo", true);
  });

  it("calcula diasAtraso e totalAPagar usando vrSaldo", async () => {
    const prisma = makePrisma();
    // Fixture no formato finan.lancamento: vrSaldo == vrDocumento quando aberto
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Fornecedor X", numeroDocumento: "BOL-001", dataVencimento: new Date("2026-05-15"), vrSaldo: "5314.75", vrTotal: "5314.75" },
    ]);
    const result = await queryContasAPagar(prisma as never, {}, hoje);
    expect(result.titulos[0].diasAtraso).toBe(3);
    expect(result.titulos[0].vrSaldo).toBeCloseTo(5314.75);
    expect(result.titulos[0].vrTotal).toBeCloseTo(5314.75);
    // totalAPagar usa vrSaldo
    expect(result.totalAPagar).toBeCloseTo(5314.75);
  });


  // ─── Recebível x carteira (perícia de 2026-07-12) ──────────────────────────
  // O Odoo da Tauga gera o financeiro pelo PEDIDO ou pela NOTA. Somar os dois punha
  // R$ 30,9 mi de pedidos SEM nota emitida dentro do "A receber".

  it("pedido AINDA SEM nota emitida é carteira, não conta a receber", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Cliente X", numeroDocumento: "PV-1/26", dataVencimento: null, vrSaldo: "1000.00", vrTotal: "1000.00", situacaoSimples: "aberto", pedidoId: 500, notaFiscalId: null, pedidoFaturado: false },
    ]);
    const r = await queryContasAReceber(prisma as never, {}, hoje);
    expect(r.totalAReceber).toBe(0);
    expect(r.carteiraAFaturar).toBeCloseTo(1000);
    expect(r.titulosCarteira).toHaveLength(1);
    expect(r.titulos).toHaveLength(0);
  });

  it("título de pedido JÁ faturado é recebível (modo financeiro pelo pedido, sem duplicata)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { participanteNome: "Cliente Y", numeroDocumento: "PV-2/26", dataVencimento: null, vrSaldo: "2000.00", vrTotal: "2000.00", situacaoSimples: "aberto", pedidoId: 600, notaFiscalId: null, pedidoFaturado: true },
    ]);
    const r = await queryContasAReceber(prisma as never, {}, hoje);
    expect(r.totalAReceber).toBeCloseTo(2000);
    expect(r.carteiraAFaturar).toBe(0);
  });

  it("pedido com duplicata de NF: conta UMA vez (a duplicata manda, o título do pedido sai)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      // Mesmo pedido, os dois títulos abertos: era dupla contagem (R$ 547 mil no cache real).
      { participanteNome: "Cliente Z", numeroDocumento: "1-99/1", dataVencimento: null, vrSaldo: "5000.00", vrTotal: "5000.00", situacaoSimples: "aberto", pedidoId: 700, notaFiscalId: 90, pedidoFaturado: true },
      { participanteNome: "Cliente Z", numeroDocumento: "PV-3/26", dataVencimento: null, vrSaldo: "5000.00", vrTotal: "5000.00", situacaoSimples: "aberto", pedidoId: 700, notaFiscalId: null, pedidoFaturado: true },
    ]);
    const r = await queryContasAReceber(prisma as never, {}, hoje);
    expect(r.totalAReceber).toBeCloseTo(5000);
    expect(r.titulos).toHaveLength(1);
    expect(r.carteiraAFaturar).toBe(0);
  });

  it("título quitado não aparece (banco não devolve , filtro situacaoSimples='aberto')", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await queryContasAPagar(prisma as never, {}, hoje);
    expect(result.titulos).toHaveLength(0);
    expect(result.totalAPagar).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// queryTitulosVencidos , task 4d.7-q
// ---------------------------------------------------------------------------

describe("queryTitulosVencidos", () => {
  // Usa timestamp com componente de hora para simular new Date() real (com fuso)
  // e confirmar que a normalização para início do dia funciona corretamente.
  const hoje = new Date("2026-05-18T14:30:00-03:00"); // meio do dia, horário de Brasília

  it("filtra situacaoSimples='aberto' e dataVencimento < início do dia de hoje", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryTitulosVencidos(prisma as never, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    // Decisão 2026-06-11: em aberto = vrSaldo>0 (inclui provisório), não mais situacaoSimples='aberto'.
    expect(call.where.vrSaldo).toEqual({ gt: 0 });
    expect(call.where).not.toHaveProperty("situacaoSimples");
    // O where.dataVencimento.lt deve ser o início do dia local (não new Date() diretamente)
    const ltValue: Date = call.where.dataVencimento.lt;
    expect(ltValue.getHours()).toBe(0);
    expect(ltValue.getMinutes()).toBe(0);
    expect(ltValue.getSeconds()).toBe(0);
    expect(ltValue.getMilliseconds()).toBe(0);
    // NÃO usa dataPagamento como critério
    expect(call.where).not.toHaveProperty("dataPagamento");
  });

  it("inclui tipo e vrSaldo no resultado; totalVencido usa vrSaldo (fonte finan.lancamento)", async () => {
    // Usa hoje fixo meia-noite local para evitar variação de fuso no cálculo de dias.
    const hojeFixo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()); // 2026-05-18 local
    const prisma = makePrisma();
    // Fixture no formato finan.lancamento: vrSaldo == vrTotal quando aberto
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { tipo: "a_receber", participanteNome: "Cliente Z", numeroDocumento: "NF-100", dataVencimento: new Date(2026, 3, 1), vrSaldo: "2000.00", vrTotal: "2000.00" }, // 2026-04-01 local
      { tipo: "a_pagar", participanteNome: "Forn Y", numeroDocumento: "BOL-200", dataVencimento: new Date(2026, 4, 1), vrSaldo: "800.00", vrTotal: "800.00" }, // 2026-05-01 local
    ]);
    const result = await queryTitulosVencidos(prisma as never, hojeFixo);
    expect(result.titulos).toHaveLength(2);
    expect(result.titulos[0].tipo).toBe("a_receber");
    expect(result.titulos[0].diasAtraso).toBe(47); // 18 mai - 1 abr = 47 dias (ambos em local)
    expect(result.titulos[0].vrSaldo).toBeCloseTo(2000);
    expect(result.titulos[0].vrTotal).toBeCloseTo(2000);
    // totalVencido usa vrSaldo
    expect(result.totalVencido).toBeCloseTo(2800);
  });

  // Caso de borda I-1: título que vence EXATAMENTE hoje NÃO deve aparecer como vencido.
  // O banco não chega a devolvê-lo (o filtro `lt: inicioDoDia` exclui), mas validamos
  // que a chamada ao Prisma usa inicioDoDia correto , e que diasAtraso seria 0
  // (reforço: não há incoerência "listado como vencido com diasAtraso: 0").
  it("caso de borda: título que vence hoje NÃO é incluído (inicioDoDia normalizado)", async () => {
    const prisma = makePrisma();
    // Simula banco retornando vazio (o filtro lt: inicioDoDia excluiu o título de hoje)
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    const result = await queryTitulosVencidos(prisma as never, hoje);
    expect(result.titulos).toHaveLength(0);
    expect(result.totalVencido).toBe(0);
    // Confirma que o lt passado é exatamente meia-noite do dia de hoje (local)
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    const ltValue: Date = call.where.dataVencimento.lt;
    const inicioDoDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    expect(ltValue.getTime()).toBe(inicioDoDia.getTime());
  });

  it("ordena por vrSaldo desc com desempate por odooId (contrato de lista, Fase B)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryTitulosVencidos(prisma as never, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.orderBy).toEqual([{ vrSaldo: "desc" }, { odooId: "asc" }]);
  });

  it("caso de borda: título que venceu ontem SIM aparece como vencido (diasAtraso: 1)", async () => {
    const prisma = makePrisma();
    const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1); // 2026-05-17T00:00:00
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { tipo: "a_pagar", participanteNome: "Forn A", numeroDocumento: "BOL-001", dataVencimento: ontem, vrSaldo: "500.00", vrTotal: "500.00" },
    ]);
    const result = await queryTitulosVencidos(prisma as never, hoje);
    expect(result.titulos).toHaveLength(1);
    expect(result.titulos[0].diasAtraso).toBe(1);
    expect(result.titulos[0].vrSaldo).toBeCloseTo(500);
    // totalVencido usa vrSaldo
    expect(result.totalVencido).toBeCloseTo(500);
  });

  // Regra do corte: titulo cujo DOCUMENTO e anterior a data de inicio das analises nao e
  // da operacao coberta , e a mesma divida velha do Odoo que ja foi tirada de
  // queryContasAReceber/queryContasAPagar. Sem este piso ela voltava pelo relatorio de
  // vencidos (titulo de 2019 "vencido ha 2000 dias").
  it("aplica o piso do corte em dataDocumento (mesma regra de contas a receber/pagar)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryTitulosVencidos(prisma as never, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.dataDocumento).toEqual({ gte: corteAtualDate() });
    expect(corteAtual()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("exclui título intragrupo (mesma regra das contas a receber/pagar)", async () => {
    const prisma = makePrisma();
    // Participante do proprio grupo (via fato_parceiro com raiz de CNPJ do grupo).
    (prisma.fatoParceiro.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([
      { tipo: "a_receber", participanteId: 7, participanteNome: "Cliente Externo", numeroDocumento: "NF-1", dataVencimento: new Date(2026, 3, 1), vrSaldo: "100.00", vrTotal: "100.00", situacaoSimples: "aberto" },
      { tipo: "a_receber", participanteId: 2, participanteNome: "Empresa do Grupo", numeroDocumento: "NF-2", dataVencimento: new Date(2026, 3, 1), vrSaldo: "900.00", vrTotal: "900.00", situacaoSimples: "aberto" },
    ]);
    const result = await queryTitulosVencidos(prisma as never, hoje);
    // O pid 2 esta na whitelist de participantes do grupo (whitelist-grupo.ts).
    expect(result.titulos.map((t) => t.numeroDocumento)).toEqual(["NF-1"]);
    expect(result.totalVencido).toBeCloseTo(100);
  });

  it("seleciona participanteId (necessário para o filtro intragrupo)", async () => {
    const prisma = makePrisma();
    (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mockResolvedValue([]);
    await queryTitulosVencidos(prisma as never, hoje);
    const call = (prisma.fatoFinanceiroTitulo.findMany as jest.Mock).mock.calls[0][0];
    expect(call.select).toHaveProperty("participanteId", true);
  });
});
