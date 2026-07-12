import { janelaAnterior, calcularDeltaKpi } from "./janela-anterior";
import { CORTE_DADOS_PADRAO } from "@/lib/corte-dados";

// Corte antigo: neutraliza o piso e deixa a subtracao pura visivel nos testes de forma.
const CORTE_ANTIGO = "2020-01-01";

describe("janelaAnterior , forma da janela", () => {
  it("desloca a janela para o periodo imediatamente anterior, de mesmo tamanho", () => {
    // Jan..Mar 2026 (3 meses) -> Out..Dez 2025
    expect(janelaAnterior("2026-01", "2026-03", CORTE_ANTIGO)).toEqual({ de: "2025-10", ate: "2025-12" });
  });

  it("janela de 1 mes vira o mes anterior", () => {
    expect(janelaAnterior("2026-03", "2026-03", CORTE_ANTIGO)).toEqual({ de: "2026-02", ate: "2026-02" });
  });

  it("retorna null quando falta um dos limites ou o formato e invalido", () => {
    expect(janelaAnterior(undefined, "2026-03", CORTE_ANTIGO)).toBeNull();
    expect(janelaAnterior("2026-03", undefined, CORTE_ANTIGO)).toBeNull();
    expect(janelaAnterior("xx", "2026-03", CORTE_ANTIGO)).toBeNull();
  });
});

describe("janelaAnterior , data de inicio das analises", () => {
  it("suprime o delta quando a janela anterior termina antes do corte", () => {
    // Corte em 16/03/2026: comparar mar/2026 com fev/2026 daria base zero e um
    // crescimento inventado de centenas de %.
    expect(janelaAnterior("2026-03", "2026-03", "2026-03-16")).toBeNull();
    // Jan..Mar/2026 -> anterior Out..Dez/2025: inteiramente fora da janela analisada.
    expect(janelaAnterior("2026-01", "2026-03", "2026-03-16")).toBeNull();
  });

  it("grampeia o inicio quando a janela anterior cruza o corte", () => {
    // Jul..Set/2026 -> anterior Abr..Jun/2026 (toda depois do corte, passa inteira).
    expect(janelaAnterior("2026-07", "2026-09", "2026-03-16")).toEqual({ de: "2026-04", ate: "2026-06" });
    // Jun..Ago/2026 -> anterior Mar..Mai/2026: comeca no mes do corte, passa inteira.
    expect(janelaAnterior("2026-06", "2026-08", "2026-03-16")).toEqual({ de: "2026-03", ate: "2026-05" });
    // Mai..Ago/2026 (4 meses) -> anterior Jan..Abr/2026: cruza o corte, grampeia em mar/2026.
    expect(janelaAnterior("2026-05", "2026-08", "2026-03-16")).toEqual({ de: "2026-03", ate: "2026-04" });
  });

  it("usa o corte vigente do processo quando nenhum corte e passado", () => {
    // Sem corte explicito vale o valor em memoria (padrao 2026-03-16 nos testes).
    expect(CORTE_DADOS_PADRAO).toBe("2026-03-16");
    expect(janelaAnterior("2026-01", "2026-03")).toBeNull();
    expect(janelaAnterior("2026-07", "2026-09")).toEqual({ de: "2026-04", ate: "2026-06" });
  });
});

describe("calcularDeltaKpi", () => {
  it("variacao positiva = direction up", () => {
    expect(calcularDeltaKpi(120, 100)).toEqual({ direction: "up", percent: 20 });
  });

  it("variacao negativa = direction down (percent absoluto)", () => {
    expect(calcularDeltaKpi(80, 100)).toEqual({ direction: "down", percent: 20 });
  });

  it("igual = flat", () => {
    expect(calcularDeltaKpi(100, 100)).toEqual({ direction: "flat", percent: 0 });
  });

  it("base zero ou invalida nao tem delta honesto (null)", () => {
    expect(calcularDeltaKpi(50, 0)).toBeNull();
    expect(calcularDeltaKpi(50, Number.NaN)).toBeNull();
  });
});
