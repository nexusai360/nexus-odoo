import { pendenciasDaEtapa, frasePendencia, ehTrue } from "./pendencia-etapa";

describe("pendenciasDaEtapa", () => {
  it("GERA BOLETO (finaliza_financeiro) -> liberar o financeiro", () => {
    expect(pendenciasDaEtapa({ finalizaFinanceiro: true })).toEqual([
      "liberar o financeiro (ex.: baixar o boleto/confirmar o pagamento)",
    ]);
  });
  it("etapa de estoque -> confirmar separação", () => {
    expect(pendenciasDaEtapa({ finalizaEstoque: true })).toEqual([
      "confirmar a separação/reserva de estoque",
    ]);
  });
  it("etapa de nota -> emitir a nota fiscal", () => {
    expect(pendenciasDaEtapa({ finalizaFaturamento: true })).toEqual(["emitir a nota fiscal"]);
  });
  it("múltiplos gatilhos entram na ordem do fluxo", () => {
    expect(
      pendenciasDaEtapa({ aprovaPedido: true, finalizaFinanceiro: true, finalizaFaturamento: true }),
    ).toEqual([
      "aprovar o pedido",
      "liberar o financeiro (ex.: baixar o boleto/confirmar o pagamento)",
      "emitir a nota fiscal",
    ]);
  });
  it("sem gatilho conhecido -> vazio", () => {
    expect(pendenciasDaEtapa({})).toEqual([]);
  });
});

describe("frasePendencia", () => {
  it("uma pendência", () => {
    expect(frasePendencia({ finalizaFinanceiro: true })).toBe(
      "Para avançar, falta liberar o financeiro (ex.: baixar o boleto/confirmar o pagamento).",
    );
  });
  it("duas pendências usa 'e'", () => {
    expect(frasePendencia({ finalizaEstoque: true, finalizaFaturamento: true })).toBe(
      "Para avançar, falta confirmar a separação/reserva de estoque e emitir a nota fiscal.",
    );
  });
  it("nenhuma -> null", () => {
    expect(frasePendencia({})).toBeNull();
  });
});

describe("ehTrue", () => {
  it("reconhece as formas de verdadeiro do jsonb", () => {
    expect(ehTrue("true")).toBe(true);
    expect(ehTrue("t")).toBe(true);
    expect(ehTrue("false")).toBe(false);
    expect(ehTrue(null)).toBe(false);
    expect(ehTrue(undefined)).toBe(false);
  });
});
