import { calcularDelta, type LinhaSerie } from "./delta-serie";

const l = (chave: string, ...valores: (string | null)[]): LinhaSerie => ({ chave, valores });

describe("calcularDelta", () => {
  it("grava os novos (nunca vistos)", () => {
    expect(calcularDelta([l("3:100", "500.0000")], [])).toEqual([
      { chave: "3:100", evento: "mudanca", valores: ["500.0000"] },
    ]);
  });

  it("nao regrava o que nao mudou", () => {
    expect(calcularDelta([l("3:100", "500.0000")], [l("3:100", "500.0000")])).toEqual([]);
  });

  it("grava so o que mudou de valor", () => {
    const r = calcularDelta(
      [l("3:100", "550.0000"), l("3:200", "800.0000")],
      [l("3:100", "500.0000"), l("3:200", "800.0000")],
    );
    expect(r).toEqual([{ chave: "3:100", evento: "mudanca", valores: ["550.0000"] }]);
  });

  it("gera baixa para a chave que sumiu", () => {
    expect(calcularDelta([], [l("3:100", "500.0000")])).toEqual([
      { chave: "3:100", evento: "baixa", valores: [null] },
    ]);
  });

  it("ressurreicao: vigente e baixa e a chave reaparece -> mudanca", () => {
    expect(calcularDelta([l("3:100", "500.0000")], [l("3:100", null)])).toEqual([
      { chave: "3:100", evento: "mudanca", valores: ["500.0000"] },
    ]);
  });

  it("baixa nao vira baixa de novo (vigente ja e baixa e continua ausente)", () => {
    expect(calcularDelta([], [l("3:100", null)])).toEqual([]);
  });

  it("multi-coluna (saldo): muda se qualquer coluna muda", () => {
    const r = calcularDelta([l("7:1", "10.0000", "999.99")], [l("7:1", "10.0000", "500.00")]);
    expect(r).toEqual([{ chave: "7:1", evento: "mudanca", valores: ["10.0000", "999.99"] }]);
  });

  it("zero e diferente de baixa (null)", () => {
    const r = calcularDelta([l("7:1", "0.0000")], [l("7:1", "10.0000")]);
    expect(r).toEqual([{ chave: "7:1", evento: "mudanca", valores: ["0.0000"] }]);
  });
});
