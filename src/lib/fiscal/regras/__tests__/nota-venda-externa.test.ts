// src/lib/fiscal/regras/__tests__/nota-venda-externa.test.ts
import { notaEhVendaExterna } from "../nota-venda-externa";

const vendaOk = {
  entradaSaida: "1",
  situacaoNfe: "autorizada",
  modelo: "55",
  ehReceita: true,
  intragrupo: false,
};

describe("notaEhVendaExterna , regra canonica de venda a cliente externo", () => {
  it("saida autorizada mod 55 receita externa => true", () => {
    expect(notaEhVendaExterna(vendaOk)).toBe(true);
  });
  it("entrada (devolucao/compra) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, entradaSaida: "0" })).toBe(false);
  });
  it("nao autorizada (em_digitacao) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, situacaoNfe: "em_digitacao" })).toBe(false);
  });
  it("modelo 57 (CT-e) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, modelo: "57" })).toBe(false);
  });
  it("nao-receita (transferencia) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, ehReceita: false })).toBe(false);
  });
  it("intragrupo (triangulacao) => false", () => {
    expect(notaEhVendaExterna({ ...vendaOk, intragrupo: true })).toBe(false);
  });
});
