import { agregarSaldoAtender, nucleoDe, nucleoDeVigente, montarSnapshots } from "./captura-pedido-valor";

describe("agregarSaldoAtender", () => {
  const custoDe = (id: number) => (id === 100 ? 20 : id === 200 ? 5 : undefined);

  it("soma venda e custo a atender por pedido (jobOk=true usa quantidadeAAtender)", () => {
    const itens = [
      // pedido 1: produto 100, qtd 10, a atender 4, vrProdutos 1000 (unit 100) -> venda 400, custo 80
      { pedidoId: 1, produtoId: 100, quantidade: 10, quantidadeAAtender: 4, vrProdutos: 1000 },
      // pedido 1: produto 200, qtd 2, a atender 2, vrProdutos 200 (unit 100) -> venda 200, custo 10
      { pedidoId: 1, produtoId: 200, quantidade: 2, quantidadeAAtender: 2, vrProdutos: 200 },
      // pedido 2: produto 100, qtd 5, a atender 0 -> nada
      { pedidoId: 2, produtoId: 100, quantidade: 5, quantidadeAAtender: 0, vrProdutos: 500 },
    ];
    const m = agregarSaldoAtender(itens, custoDe, true);
    expect(m.get(1)).toEqual({ venda: 600, custo: 90 });
    expect(m.get(2)).toEqual({ venda: 0, custo: 0 });
  });

  it("jobOk=false usa a quantidade cheia (por isso a captura adia essa rodada)", () => {
    const itens = [{ pedidoId: 1, produtoId: 100, quantidade: 10, quantidadeAAtender: 0, vrProdutos: 1000 }];
    const m = agregarSaldoAtender(itens, custoDe, false);
    // cheia = 10 -> venda 1000, custo 200
    expect(m.get(1)).toEqual({ venda: 1000, custo: 200 });
  });
});

describe("nucleo (estabilidade do delta)", () => {
  it("nucleoDe e nucleoDeVigente produzem o MESMO array para valores iguais", () => {
    const atual = { etapaId: 7, saldoAtenderVenda: 331808.18, alMargem: 9.75, vrDesconto: 0, vrCbs: 12.34, vrIbs: 56.78 };
    const vigente = {
      etapaId: 7,
      saldoAtenderVenda: "331808.18",
      alMargem: "9.7500",
      vrDesconto: "0",
      vrCbs: "12.34",
      vrIbs: "56.78",
    };
    expect(nucleoDe(atual)).toEqual(nucleoDeVigente(vigente));
  });

  it("etapa null vira null (nao string) nos dois lados", () => {
    expect(nucleoDe({ etapaId: null, saldoAtenderVenda: 0, alMargem: 0, vrDesconto: 0, vrCbs: 0, vrIbs: 0 })[0]).toBeNull();
    expect(nucleoDeVigente({ etapaId: null, saldoAtenderVenda: null, alMargem: null, vrDesconto: null, vrCbs: null, vrIbs: null })[0]).toBeNull();
  });

  it("uma mudanca so no CBS ja muda o nucleo (rampa CBS/IBS observavel)", () => {
    const base = { etapaId: 7, saldoAtenderVenda: 0, alMargem: 0, vrDesconto: 0, vrCbs: 10, vrIbs: 0 };
    const comCbsMaior = { ...base, vrCbs: 11 };
    expect(nucleoDe(base)).not.toEqual(nucleoDe(comCbsMaior));
  });
});

describe("montarSnapshots", () => {
  it("copia os valores prontos do raw (nao recalcula margem) e agrega o saldo", () => {
    const pedidos = [{ odooId: 1, etapaId: 7, etapaNome: "Producao", vrProdutos: 1000, dataPrevista: new Date("2026-08-01T00:00:00Z") }];
    const rawPorId = new Map<number, unknown>([
      [1, { vr_operacao_tributacao: 950, vr_custo_comercial: 700, al_margem: 9.75, vr_liquido: 92.6, vr_cbs: 12.34, vr_ibs: 56.78, al_comissao: 3, vr_comissao: 28.5, vr_desconto: 50 }],
    ]);
    const saldo = new Map([[1, { custo: 700, venda: 900 }]]);
    const snap = montarSnapshots(pedidos, rawPorId, saldo).get(1)!;
    expect(snap.alMargem).toBe(9.75); // copiado, nao recalculado
    expect(snap.vrOperacaoTributacao).toBe(950);
    expect(snap.vrDesconto).toBe(50);
    expect(snap.vrCbs).toBe(12.34);
    expect(snap.vrIbs).toBe(56.78);
    expect(snap.saldoAtenderVenda).toBe(900);
    expect(snap.saldoAtenderCusto).toBe(700);
    expect(snap.vrProdutos).toBe(1000);
    expect(snap.etapaId).toBe(7);
  });

  it("pedido sem raw vira zeros (campos ausentes do Odoo => 0), nunca NaN", () => {
    const pedidos = [{ odooId: 9, etapaId: null, etapaNome: null, vrProdutos: 0, dataPrevista: null }];
    const snap = montarSnapshots(pedidos, new Map(), new Map()).get(9)!;
    expect(snap.alMargem).toBe(0);
    expect(snap.vrCbs).toBe(0);
    expect(snap.saldoAtenderVenda).toBe(0);
  });
});
