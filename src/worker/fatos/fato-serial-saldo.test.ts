import { mapSerialSaldoRow } from "./fato-serial-saldo";

const LOCAIS = new Map<number, string>([
  [11, "fisico"],
  [3, "fora"], // Virtual
  [300, "demonstracao"],
]);
const CUSTOS = new Map<number, number>([[99, 1000]]);

function raw(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 19650,
    lote_serie_id: [5, "GM101HI2505C078"],
    produto_id: [99, "Esteira T600X"],
    local_id: [11, "Jds - Matriz DF » Próprio"],
    saldo: 1,
    ...over,
  };
}

describe("mapSerialSaldoRow", () => {
  it("mapeia o serial com o local onde ele esta e o saldo", () => {
    expect(mapSerialSaldoRow(raw(), LOCAIS, CUSTOS)).toEqual({
      odooId: 19650,
      serial: "GM101HI2505C078",
      produtoId: 99,
      produtoNome: "Esteira T600X",
      localId: 11,
      localNome: "Jds - Matriz DF » Próprio",
      classificacao: "fisico",
      saldo: 1,
      valorCusto: 1000,
    });
  });

  it("classifica o serial pelo local onde ele esta", () => {
    const noVirtual = mapSerialSaldoRow(
      raw({ local_id: [3, "Virtual"] }),
      LOCAIS,
      CUSTOS,
    );
    expect(noVirtual?.classificacao).toBe("fora");

    const naDemo = mapSerialSaldoRow(
      raw({ local_id: [300, "Cliente X » Demonstração » Terceiros"] }),
      LOCAIS,
      CUSTOS,
    );
    expect(naDemo?.classificacao).toBe("demonstracao");
  });

  it("ignora serial sem saldo (ja saiu)", () => {
    expect(mapSerialSaldoRow(raw({ saldo: 0 }), LOCAIS, CUSTOS)).toBeNull();
  });

  it("ignora saldo negativo (furo de inventario, nao e estoque)", () => {
    expect(mapSerialSaldoRow(raw({ saldo: -1 }), LOCAIS, CUSTOS)).toBeNull();
  });

  it("ignora linha sem numero de serial", () => {
    expect(mapSerialSaldoRow(raw({ lote_serie_id: false }), LOCAIS, CUSTOS)).toBeNull();
  });

  it("local desconhecido nao entra no estoque de casa (fail-closed)", () => {
    const orfao = mapSerialSaldoRow(raw({ local_id: [777, "Novo"] }), LOCAIS, CUSTOS);
    expect(orfao?.classificacao).toBe("fora");
  });

  it("serial sem local nenhum tambem e fail-closed", () => {
    const semLocal = mapSerialSaldoRow(raw({ local_id: false }), LOCAIS, CUSTOS);
    expect(semLocal?.classificacao).toBe("fora");
    expect(semLocal?.localId).toBeNull();
  });

  it("produto sem custo cadastrado nao inventa valor", () => {
    const semCusto = mapSerialSaldoRow(
      raw({ produto_id: [123, "Produto sem custo"] }),
      LOCAIS,
      CUSTOS,
    );
    expect(semCusto?.valorCusto).toBeNull();
  });

  it("valoriza pelo saldo, nao por unidade", () => {
    const tres = mapSerialSaldoRow(raw({ saldo: 3 }), LOCAIS, CUSTOS);
    expect(tres?.valorCusto).toBe(3000);
  });
});
