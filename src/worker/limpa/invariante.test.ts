// T5 , invariante financeiro do purge (Limpa 2026+).
import { describe, it, expect } from "@jest/globals";
import { compararInvariante, SITUACOES_VIVAS, type CelulaInvariante } from "./invariante";

const celula = (over: Partial<CelulaInvariante>): CelulaInvariante => ({
  tipo: "a_pagar",
  situacao: "aberto",
  n: 10,
  saldo: "1000.00",
  documento: "1200.00",
  ...over,
});

describe("invariante financeiro (a pagar/receber em aberto identico)", () => {
  it("vivas identicas => ok, sem violacoes", () => {
    const antes = [celula({}), celula({ tipo: "a_receber", situacao: "provisorio" })];
    const r = compararInvariante(antes, antes);
    expect(r.ok).toBe(true);
    expect(r.violacoes).toEqual([]);
  });

  it("saldo vivo divergente => violacao (nunca soma liquida: celula a celula)", () => {
    const antes = [celula({ saldo: "1000.00" })];
    const depois = [celula({ saldo: "999.99" })];
    const r = compararInvariante(antes, depois);
    expect(r.ok).toBe(false);
    expect(r.violacoes[0]).toContain("a_pagar/aberto");
  });

  it("count vivo divergente => violacao mesmo com saldo igual", () => {
    const r = compararInvariante([celula({ n: 10 })], [celula({ n: 9 })]);
    expect(r.ok).toBe(false);
  });

  it("celula viva SUMIU depois => violacao", () => {
    const r = compararInvariante([celula({})], []);
    expect(r.ok).toBe(false);
  });

  it("quitado/baixado podem divergir (purge esperado) => informativo, nao viola", () => {
    const antes = [celula({ situacao: "quitado", n: 743, saldo: "0.00" })];
    const depois = [celula({ situacao: "quitado", n: 670, saldo: "0.00" })];
    const r = compararInvariante(antes, depois);
    expect(r.ok).toBe(true);
    expect(r.informativos[0]).toContain("quitado");
  });

  it("situacoes vivas sao exatamente aberto e provisorio", () => {
    expect([...SITUACOES_VIVAS].sort()).toEqual(["aberto", "provisorio"]);
  });
});
