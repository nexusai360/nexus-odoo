import { aAtenderDoItem } from "./atendimento-item";

// Custo de exemplo: produto 1 custa 10, produto 2 custa 0 (sem custo).
const custo = (id: number): number | undefined => ({ 1: 10, 2: 0 })[id];

describe("aAtenderDoItem", () => {
  it("job OK + quantidade a atender preenchida: usa o saldo a atender", () => {
    const r = aAtenderDoItem(
      { quantidade: 10, quantidadeAAtender: 4, vrProdutos: 1000, produtoId: 1 },
      custo,
      true,
    );
    expect(r.aAtender).toBe(4);
    expect(r.custoLinha).toBe(40); // 4 * 10
    expect(r.vendaLinha).toBe(400); // 4 * (1000/10)
    expect(r.semCusto).toBe(false);
    expect(r.semProduto).toBe(false);
  });

  it("job OK + quantidade a atender NULL: a atender vira 0 (nada pendente)", () => {
    const r = aAtenderDoItem(
      { quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000, produtoId: 1 },
      custo,
      true,
    );
    expect(r.aAtender).toBe(0);
    expect(r.custoLinha).toBe(0);
    expect(r.vendaLinha).toBe(0);
  });

  it("job NAO sincronizado: cai na quantidade cheia", () => {
    const r = aAtenderDoItem(
      { quantidade: 10, quantidadeAAtender: null, vrProdutos: 1000, produtoId: 1 },
      custo,
      false,
    );
    expect(r.aAtender).toBe(10);
    expect(r.custoLinha).toBe(100);
    expect(r.vendaLinha).toBe(1000);
  });

  it("quantidade a atender NEGATIVA (entregou a mais): piso em zero", () => {
    const r = aAtenderDoItem(
      { quantidade: 10, quantidadeAAtender: -3, vrProdutos: 1000, produtoId: 1 },
      custo,
      true,
    );
    expect(r.aAtender).toBe(0);
    expect(r.custoLinha).toBe(0);
  });

  it("produto sem custo (custo 0): marca semCusto, custoLinha 0, venda segue", () => {
    const r = aAtenderDoItem(
      { quantidade: 10, quantidadeAAtender: 5, vrProdutos: 500, produtoId: 2 },
      custo,
      true,
    );
    expect(r.semCusto).toBe(true);
    expect(r.custoLinha).toBe(0);
    expect(r.vendaLinha).toBe(250); // 5 * (500/10)
  });

  it("item sem produto: marca semProduto, custoLinha 0", () => {
    const r = aAtenderDoItem(
      { quantidade: 4, quantidadeAAtender: 4, vrProdutos: 400, produtoId: null },
      custo,
      true,
    );
    expect(r.semProduto).toBe(true);
    expect(r.custoLinha).toBe(0);
    expect(r.vendaLinha).toBe(400); // 4 * (400/4)
  });

  it("quantidade cheia zero: preco unitario 0 (nao divide por zero)", () => {
    const r = aAtenderDoItem(
      { quantidade: 0, quantidadeAAtender: 0, vrProdutos: 100, produtoId: 1 },
      custo,
      false,
    );
    expect(r.aAtender).toBe(0);
    expect(r.vendaLinha).toBe(0);
  });
});
