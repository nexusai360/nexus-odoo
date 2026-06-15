import { resolverSinonimia } from "../sinonimias";

describe("resolverSinonimia", () => {
  it("parceiro cliente", () => expect(resolverSinonimia("tipoParceiro", "cliente")).toEqual({ ehCliente: true }));
  it("parceiro fornecedor (case-insensitive)", () => expect(resolverSinonimia("tipoParceiro", "Fornecedor")).toEqual({ ehFornecedor: true }));
  it("produto ativo", () => expect(resolverSinonimia("statusProduto", "ativo")).toEqual({ ativo: true }));
  it("produto inativo", () => expect(resolverSinonimia("statusProduto", "inativo")).toEqual({ ativo: false }));
  it("pedido aberto", () => expect(resolverSinonimia("etapaPedido", "aberto")).toEqual({ etapaFinaliza: false }));
  it("pedido venda", () => expect(resolverSinonimia("tipoPedido", "venda")).toEqual({ tipo: "venda" }));
  it("pedido devolucao de venda", () => expect(resolverSinonimia("tipoPedido", "devolucao de venda")).toEqual({ tipo: "devolucao_venda" }));
  it("pedido transferencia (3 valores)", () =>
    expect(resolverSinonimia("tipoPedido", "transferencia")).toEqual({
      tipo: { in: ["transferencia_entrada", "transferencia_saida", "transferencia_solicitacao"] },
    }));
  it("nf entrada", () => expect(resolverSinonimia("sentidoNf", "entrada")).toEqual({ entradaSaida: "0" }));
  it("nf saida", () => expect(resolverSinonimia("sentidoNf", "saida")).toEqual({ entradaSaida: "1" }));
  it("situacao autorizada", () => expect(resolverSinonimia("situacaoNf", "autorizada")).toEqual({ situacaoNfe: "autorizada" }));
  it("situacao em_digitacao", () => expect(resolverSinonimia("situacaoNf", "em_digitacao")).toEqual({ situacaoNfe: "em_digitacao" }));
  it("natureza contabil 01", () => expect(resolverSinonimia("naturezaContabil", "01")).toEqual({ natureza: "01" }));
  it("natureza fora do de-para = null", () => expect(resolverSinonimia("naturezaContabil", "09")).toBeNull());
  it("termo desconhecido = null", () => expect(resolverSinonimia("tipoParceiro", "xyz")).toBeNull());
  it("categoria desconhecida = null", () => expect(resolverSinonimia("foo", "bar")).toBeNull());
});
